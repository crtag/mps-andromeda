const {logger} = require("firebase-functions");
const {getStorage} = require("firebase-admin/storage");
const admin = require("firebase-admin");
const {Writable} = require("stream");
const {extractSection, extractSimulationResults} = require("./outputOperations");

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

const storage = getStorage();
const JOBS_PREFIX = "job-specs/";
const RESULTS_PREFIX = "job-results/";

// Get default bucket reference
const getBucket = () => storage.bucket();

// Utility function to list files with a specific prefix
async function listFilesWithQuery(prefix, matchGlob) {
    const [files] = await getBucket().getFiles({prefix, matchGlob});
    return files;
}

async function listPendingJobs() {
    try {
        const files = await listFilesWithQuery(JOBS_PREFIX, "**.in");

        const jobPromises = files
            .filter((file) => file.exists())
            .map(async (file) => {
                const [metadata] = await file.getMetadata();
                return {
                    ...metadata.metadata,
                    filename: file.name.replace(JOBS_PREFIX, ""), // Remove prefix for client use
                    submitTime: metadata.timeCreated,
                    status: metadata.metadata?.status || "PENDING",
                    lastUpdate: metadata.metadata?.lastUpdate,
                };
            });

        const jobs = await Promise.all(jobPromises);
        return jobs.sort((a, b) => new Date(a.submitTime) - new Date(b.submitTime));
    } catch (error) {
        logger.error("Error listing pending jobs", error);
        throw error;
    }
}

async function listCompletedJobs(limit = 10) {
    try {
        const files = await listFilesWithQuery(RESULTS_PREFIX, "**.out");
        logger.info(`Found ${files.length} completed jobs`);
        const completedJobs = new Map();

        files.forEach((file) => {
            const fullName = file.name.replace(RESULTS_PREFIX, "");
            const baseName = fullName.replace(/\.(out)$/, "");

            // Create a new entry if encountering new baseName
            if (!completedJobs.has(baseName)) {
                completedJobs.set(baseName, {filename: baseName});
            }

            const job = completedJobs.get(baseName);
            job.resultFile = `${fullName}`;
            job.moldenFile = `${baseName}.molden`;
            job.specFile = `${baseName}.in`;
        });

        // exclude pending jobs from completed jobs
        const pendingFiles = await listFilesWithQuery(JOBS_PREFIX);
        pendingFiles.forEach((file) => {
            const baseName = file.name.replace(JOBS_PREFIX, "").replace(".in", "");
            completedJobs.delete(baseName);
        });

        // Get completion times from metadata
        const jobPromises = Array.from(completedJobs.values()).map(async (job) => {
            let metadata;
            try {
                [metadata] = await getBucket()
                    .file(`${RESULTS_PREFIX}${job.specFile}`)
                    .getMetadata();
            } catch (error) {
                logger.warn("Error getting metadata for job, missing file?", error);
            }

            if (job.filename && metadata) {
                // add all metadata to the job object
                job = {
                    ...job,
                    ...metadata.metadata,
                };
                return job;
            } else {
                logger.warn(`Job ${job.specFile} file or its metadata is missing`);
            }
            return null;
        });

        const jobs = await Promise.all(jobPromises);
        return jobs
            .filter((job) => job !== null)
            .sort((a, b) => {
                const timeA = new Date(a.completionTime || 0);
                const timeB = new Date(b.completionTime || 0);
                return timeB - timeA;
            })
            .slice(0, limit);
    } catch (error) {
        logger.error("Error listing completed jobs", error);
        throw error;
    }
}


async function getJobFile(filename, type) {
    try {
        let fullPath;
        // the type dictates the prefix, two options are "spec" and "result"

        switch (type) {
        case "spec":
            fullPath = `${JOBS_PREFIX}${filename}`;
            break;
        case "result":
            fullPath = `${RESULTS_PREFIX}${filename}`;
            break;
        default:
            throw new Error("Invalid file type");
        }

        const file = getBucket().file(fullPath);
        const [exists] = await file.exists();
        if (!exists) {
            throw new Error(`File not found [${fullPath}]`);
        }

        const [content] = await file.download();
        return content.toString("utf8");
    } catch (error) {
        logger.warn("Error getting job file", error);
        throw error;
    }
}

async function saveJobFile(filename, content, type, metadata = {}) {
    try {
        const prefix = type === "spec" ? JOBS_PREFIX : RESULTS_PREFIX;
        const fullPath = `${prefix}${filename}`;
        const file = getBucket().file(fullPath);

        await file.save(content, {
            contentType: "text/plain",
        });

        await file.setMetadata({
            metadata: {
                ...metadata,
                timestamp: new Date().toISOString(),
            },
        });

        return true;
    } catch (error) {
        logger.error("Error saving job file", error);
        throw error;
    }
}

async function updateJobMeta(filename, type, metadata = {}) {
    try {
        const prefix = type === "spec" ? JOBS_PREFIX : RESULTS_PREFIX;
        const fullPath = `${prefix}${filename}`;
        const file = getBucket().file(fullPath);

        // get existing metadata
        const [existingMetadata] = await file.getMetadata();

        await file.setMetadata({
            metadata: {
                ...existingMetadata.metadata,
                ...metadata,
                timestamp: new Date().toISOString(),
            },
        });

        return true;
    } catch (error) {
        logger.error("Error updating job file metadata", error);
        throw error;
    }
}

/**
 * Tracks normal termination status by reading the last line of .out file and updating metadata in the
 * corresponding .in file. When postScan is true, expects both files to be in RESULTS_PREFIX location,
 * indicating post execution scan; otherwise expects .in file in JOBS_PREFIX location which is the default.
 * @param {string} filename - Base filename without extension
 * @param {boolean} [postScan=false] - When true, both files are in RESULTS_PREFIX; otherwise .in file is in JOBS_PREFIX
 * @return {Promise<boolean>} Returns true if metadata was updated successfully, false if files don't exist or on error
 * @throws {Error} If filename parameter is empty or undefined
 */
async function trackNormalTermination(filename, postScan = false) {
    if (!filename?.trim()) {
        throw new Error("Valid filename is required");
    }

    const outputFile = getBucket().file(`${RESULTS_PREFIX}${filename}.out`);
    const inputFile = getBucket().file(`${postScan ? RESULTS_PREFIX : JOBS_PREFIX}${filename}.in`);

    try {
        // Verify file existence
        const [outputExists] = await outputFile.exists();
        const [inputExists] = await inputFile.exists();
        if (!outputExists || !inputExists) {
            logger.warn(`Required files not found for ${filename}`);
            return false;
        }
        logger.info(`Start termination tracking for ${filename}`);

        // Get file size for dynamic buffer sizing
        const [stats] = await outputFile.getMetadata();
        const fileSize = parseInt(stats.size);
        const readSize = Math.min(fileSize, 128); // Read up to 128B from end

        let lastFileBytes = "";

        // Read file ending
        await new Promise((resolve, reject) => {
            logger.info(`Will read last ${readSize} bytes out of ${fileSize} bytes total from ${filename}.out`);

            const stream = outputFile.createReadStream({
                start: Math.max(0, fileSize - readSize),
                end: fileSize,
            });

            const writable = new Writable({
                write(chunk, encoding, callback) {
                    try {
                        logger.info(`Read ${chunk.length} bytes from ${filename}.out with [${encoding}] encoding`);
                        const validEncoding = (typeof encoding === "string" && !["buffer", ""].includes(encoding)) ?
                            encoding : "utf8";
                        lastFileBytes += chunk.toString(validEncoding);
                        callback();
                    } catch (err) {
                        callback(err);
                    }
                },
            });

            // Handle events for both streams
            stream.on("error", (err) => {
                logger.error(`Error reading output file ${filename}`, err);
                reject(err);
            });

            writable.on("error", (err) => {
                logger.error(`Error in writable stream for ${filename}`, err);
                reject(err);
            });

            writable.on("finish", () => {
                resolve();
            });

            // Clean up on completion or error
            const cleanup = () => {
                logger.info(`Finished reading ${lastFileBytes.length} bytes from ${filename}.out, cleaning up`);
                stream.removeAllListeners();
                writable.removeAllListeners();
            };

            writable.on("finish", cleanup);
            writable.on("error", cleanup);
            stream.on("error", cleanup);

            logger.info(`Piping output stream for ${filename}`);
            // Start the pipeline
            stream.pipe(writable);
        });

        // Process file content
        const lines = lastFileBytes.split("\n")
            .map((line) => line.trim())
            .filter(Boolean);

        const lastLine = lines.length > 0 ? lines[lines.length - 1] : "";
        const normalTermination = lastLine.includes("Normal Termination");

        // Update metadata
        const [metadata] = await inputFile.getMetadata();
        await inputFile.setMetadata({
            metadata: {
                ...metadata.metadata,
                normalTermination,
                lastOutputLine: lastLine, // Store last line for debugging
            },
        });

        return true;
    } catch (error) {
        logger.error(`Failed to track termination for ${filename}`, error);
        return false;
    }
}

/**
 * Parses the simulation output file and extracts the optimized geometry information.
 *
 * This function performs the following steps:
 * 1. Checks if the job terminated normally by inspecting the metadata of the input file.
 * 2. If the job did not terminate normally, it logs a warning and returns false.
 * 3. Retrieves the output file corresponding to the given filename.
 * 4. Downloads the content of the output file.
 * 5. Extracts the simulation results from the output content.
 * 6. Saves the extracted optimized geometry into a separate file with the same filename and .xyz extension.
 * 7. Updates the metadata of the input file with the extracted simulation results properties.
 *
 * @param {string} filename - The name of the simulation output file to parse.
 * @return {Promise<boolean>} - Returns true if the parsing and extraction were successful, otherwise false.
 */
async function parseSimulationOutput(filename) {
    // check for the normal termination
    // if not normal termination, then job failed and nothing to extract
    let inputFile;
    try {
        inputFile = getBucket().file(`${RESULTS_PREFIX}${filename}.in`);
    } catch (error) {
        logger.error("Error getting input file. ", error);
        return false;
    }

    let inputMetadata;
    try {
        [inputMetadata] = await inputFile.getMetadata();
        if (!inputMetadata.metadata.normalTermination) {
            logger.warn(`Job ${filename} did not terminate normally, nothing to parse.`);
            return false;
        }
    } catch (error) {
        logger.error("Error getting metadata for job, trying anyway with the parser. ", error);
    }

    // get the output file with the given filename
    let outputFile;
    try {
        outputFile = getBucket().file(`${RESULTS_PREFIX}${filename}.out`);
    } catch (error) {
        logger.error("Error getting output file, can't proceed with parsing. ", error);
        return false;
    }

    // download the output file content
    let content;
    try {
        [content] = await outputFile.download();
    } catch (error) {
        logger.error("Error downloading output file content, aborting. ", error);
        return false;
    }

    const outputContent = content.toString("utf8");
    // extract the simulation results from the output content starting with
    // ================ OPTIMIZED GEOMETRY INFORMATION ============== separator
    const startSep = "================ OPTIMIZED GEOMETRY INFORMATION ==============";
    const endSep = null; // no end separator, read till the end
    const simulationResults = extractSection(outputContent, startSep, endSep, true);

    const parsedResults = extractSimulationResults(simulationResults);

    // save the extracted "optimizedGeometry" property into a separate file with the same filename and xyz extension
    const optimizedGeometry = parsedResults.optimizedGeometry;
    // unset the optimizedGeometry property from the simulation results object
    // will track the optimized geometry in a separate file
    // and update the metadata with the status of the optimized geometry file
    delete parsedResults.optimizedGeometry;

    let optimizedGeometrySaved = false;
    if (!optimizedGeometry) {
        logger.warn("No optimized geometry found in output file.");
    } else {
        try {
            // create a proper xyz file with the optimized geometry
            const atomsCount = optimizedGeometry.split("\n").length;
            const optimizedGeometryHeader = `${atomsCount}\nEnergy=${parsedResults.minimizedEnergy}\n`;

            await saveJobFile(`${filename}.xyz`, optimizedGeometryHeader + optimizedGeometry, "result", {
                timestamp: new Date().toISOString(),
            });
            optimizedGeometrySaved = true;
        } catch (error) {
            logger.error("Error saving optimized geometry. ", error);
        }
    }

    // update metadata with the extracted simulation results object properties
    try {
        await inputFile.setMetadata({
            metadata: {
                ...inputMetadata.metadata,
                ...parsedResults,
                optimizedGeometrySaved,
            },
        });
    } catch (error) {
        logger.error("Error updating metadata for input file. ", error);
        return false;
    }

    return true;
}

async function updateJobStatus(filename, status, additionalMetadata = {}) {
    try {
        const fullPath = `${JOBS_PREFIX}${filename}`;
        const file = getBucket().file(fullPath);
        const [exists] = await file.exists();
        if (!exists) {
            throw new Error(`Job spec not found, [${fullPath}]`);
        }

        const [metadata] = await file.getMetadata();
        await file.setMetadata({
            metadata: {
                ...metadata.metadata,
                status,
                lastUpdate: new Date().toISOString(),
                ...additionalMetadata,
            },
        });
    } catch (error) {
        logger.error("Error updating job status", error);
    }
}

async function moveJobToResults(filename) {
    try {
        const sourcePath = `${JOBS_PREFIX}${filename}`;
        const sourceFile = getBucket().file(sourcePath);

        // Get the metadata of the source file
        const [metadata] = await sourceFile.getMetadata();

        // First, copy the spec file to results with the existing metadata
        await sourceFile.copy(`${RESULTS_PREFIX}${filename}`, {
            metadata: metadata.metadata,
        });

        // Then delete the original
        await sourceFile.delete();

        return true;
    } catch (error) {
        logger.warn("Error moving job to results, could have been moved earlier", error);
    }
}

module.exports = {
    listPendingJobs,
    listCompletedJobs,
    getJobFile,
    saveJobFile,
    updateJobMeta,
    updateJobStatus,
    moveJobToResults,
    trackNormalTermination,
    parseSimulationOutput,
    JOBS_PREFIX,
    RESULTS_PREFIX,
};

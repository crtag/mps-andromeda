const {logger} = require("firebase-functions");
const {getStorage} = require("firebase-admin/storage");
const admin = require("firebase-admin");
const {Writable} = require("stream");

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
async function listFilesWithPrefix(prefix) {
    const [files] = await getBucket().getFiles({prefix});
    return files;
}

async function listPendingJobs() {
    try {
        const files = await listFilesWithPrefix(JOBS_PREFIX);

        const jobPromises = files.map(async (file) => {
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
        const files = await listFilesWithPrefix(RESULTS_PREFIX);
        const completedJobs = new Map();

        // Group files by job, excluding .in files from initial entry creation
        files.forEach((file) => {
            const fullName = file.name.replace(RESULTS_PREFIX, "");
            const baseName = fullName.replace(/\.(out|molden|in)$/, "");

            // Create a new entry if encountering new file and skip log files
            if (!completedJobs.has(baseName) && !fullName.endsWith(".log")) {
                completedJobs.set(baseName, {filename: baseName});
            }

            const job = completedJobs.get(baseName);
            if (fullName.endsWith(".molden")) {
                job.moldenFile = fullName;
            } else if (fullName.endsWith(".out")) {
                job.resultFile = fullName;
            } else if (fullName.endsWith(".in")) {
                job.specFile = fullName;
            }
        });

        // exclude pending jobs from completed jobs
        const pendingFiles = await listFilesWithPrefix(JOBS_PREFIX);
        pendingFiles.forEach((file) => {
            const baseName = file.name.replace(JOBS_PREFIX, "").replace(".in", "");
            completedJobs.delete(baseName);
        });

        // Get completion times from metadata
        const jobPromises = Array.from(completedJobs.values()).map(async (job) => {
            let metadata;
            try {
                [metadata] = await getBucket()
                    .file(`${RESULTS_PREFIX}${job.filename}.in`)
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
            }
            return null;
        });

        const jobs = await Promise.all(jobPromises);
        return jobs
            .filter((job) => job !== null)
            .sort((a, b) => new Date(b.completionTime) - new Date(a.completionTime))
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
    updateJobStatus,
    moveJobToResults,
    trackNormalTermination,
    JOBS_PREFIX,
    RESULTS_PREFIX,
};

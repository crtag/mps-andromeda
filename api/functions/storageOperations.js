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
const TRAJECTORY_PREFIX = "job-trajectories/";

// Get default bucket reference
const getBucket = () => {
    // const red = '\x1b[31m';
    // const green = '\x1b[32m';
    // const reset = '\x1b[0m'; // Resets color to default

    // if ('true' === process.env.FUNCTIONS_EMULATOR) {
    //     // console.log(green + "Using dev storage bucket: mps-andromeda-dev" + reset);
    //     // dealing with the dev environment
    //     const bucketName = "mps-andromeda-dev";
    //     return storage.bucket(bucketName);
    // }
    // console.log(red + "Using production storage bucket" + reset);
    return storage.bucket()
};

// Utility function to list files with a specific prefix
async function listFilesWithQuery(prefix) {
    const [files] = await getBucket().getFiles({prefix});
    return files;
}

async function jobFolderExists(folderName) {
    try {
        const jobsPrefix = `${JOBS_PREFIX}${folderName}/`;
        const resultsPrefix = `${RESULTS_PREFIX}${folderName}/`;
        
        const [[jobsFiles], [resultsFiles]] = await Promise.all([
            getBucket().getFiles({prefix: jobsPrefix, maxResults: 1}),
            getBucket().getFiles({prefix: resultsPrefix, maxResults: 1})
        ]);
        
        return jobsFiles.length > 0 || resultsFiles.length > 0;
    } catch (error) {
        logger.error(`Error checking if job folder exists: ${folderName}`, error);
        return false;
    }
}

async function listPendingAndDraftJobs() {
    try {
        const allFiles = await listFilesWithQuery(JOBS_PREFIX);
        const files = allFiles.filter(file => file.name.endsWith('.cfg'));

        const jobs = await Promise.all(files.map(async (file) => {
            const [metadata] = await file.getMetadata();
            const relativePath = file.name.replace(JOBS_PREFIX, "");
            const pathParts = relativePath.split("/");
            const jobFolder = pathParts.length > 1 ? pathParts[0] : null;
            const filename = pathParts[pathParts.length - 1];
            
            const jobMetadata = {...metadata.metadata};
            if (jobMetadata.inputFiles) {
                try {
                    jobMetadata.inputFiles = JSON.parse(jobMetadata.inputFiles);
                } catch (e) {
                    logger.warn(`Failed to parse inputFiles for ${jobFolder || filename}`, e);
                    jobMetadata.inputFiles = [];
                }
            }
            
            return {
                filename,
                jobFolder,
                jobFilePath: file.name,
                submitTime: metadata.timeCreated,
                ...jobMetadata,
            };
        }));

        console.log('found jobs:', jobs.length);
        
        return jobs.sort((a, b) => new Date(b.submitTime) - new Date(a.submitTime));
    } catch (error) {
        logger.error("Error listing pending jobs", error);
        throw error;
    }
}


async function listCompletedAndRunningJobs(limit = 10) {
    try {
        const allFiles = await listFilesWithQuery(RESULTS_PREFIX);

        // Old logic: metadata on .in file, no job folders (legacy unfolder jobs)
        const inFiles = allFiles.filter(file => {
            const relativePath = file.name.replace(RESULTS_PREFIX, "");
            const pathParts = relativePath.split("/");
            // Only include unfoldered files (no folder structure)
            return pathParts.length === 1 && file.name.endsWith('.in');
        });
        
        const oldJobs = await Promise.all(inFiles.map(async (file) => {
            const [metadata] = await file.getMetadata();
            
            const relativePath = file.name.replace(RESULTS_PREFIX, "");
            const filename = relativePath.replace(/\.in$/, "");
            const baseName = relativePath.replace(/\.in$/, "");
            
            // Check if corresponding .out file exists
            const outFile = allFiles.find(f => f.name === `${RESULTS_PREFIX}${baseName}.out`);
            const resultFile = outFile ? `${baseName}.out` : null;
            
            // Legacy unfolder jobs might not have status metadata
            // If no status, assume ENDED for legacy jobs (they wouldn't be in results if not completed)
            const jobMetadata = {...metadata.metadata};
            if (!jobMetadata.status) {
                logger.info(`Legacy unfolder job ${filename} (.in) has no status metadata, defaulting to ENDED`);
                jobMetadata.status = 'ENDED';
            }
            
            return {
                filename,
                jobFolder: null,
                baseName,
                resultFile,
                moldenFile: `${baseName}.molden`,
                specFile: relativePath,
                submitTime: metadata.timeCreated,
                ...jobMetadata,
            };
        }));

        // New jobs: metadata on .cfg file, all job files in the job folder
        const cfgFiles = allFiles.filter(file => file.name.endsWith('.cfg'));
        const newJobs = await Promise.all(cfgFiles.map(async (file) => {
            const [metadata] = await file.getMetadata();
            if (!metadata.metadata?.status) return null; // not main config file

            const filename = file.name.split("/").pop();
            const jobFolder = metadata.metadata.jobFolder;
            
            // Find actual files in the job folder
            const folderFiles = allFiles.filter(f => f.name.startsWith(`${RESULTS_PREFIX}${jobFolder}/`));
            const outFile = folderFiles.find(f => f.name.endsWith('.out'));
            const moldenFile = folderFiles.find(f => f.name.endsWith('.molden'));
            const cfgFile = folderFiles.find(f => f.name.endsWith('.cfg'));
            
            // Parse outputFiles JSON string back to array if it exists
            const jobMetadata = {...metadata.metadata};
            if (jobMetadata.outputFiles) {
                try {
                    jobMetadata.outputFiles = JSON.parse(jobMetadata.outputFiles);
                } catch (e) {
                    logger.warn(`Failed to parse outputFiles for ${jobFolder}`, e);
                    jobMetadata.outputFiles = [];
                }
            }
            if (jobMetadata.inputFiles) {
                try {
                    jobMetadata.inputFiles = JSON.parse(jobMetadata.inputFiles);
                } catch (e) {
                    logger.warn(`Failed to parse inputFiles for ${jobFolder}`, e);
                    jobMetadata.inputFiles = [];
                }
            }
            
            return {
                filename,
                jobFolder,
                resultFile: outFile ? outFile.name.replace(RESULTS_PREFIX, "") : null,
                moldenFile: moldenFile ? moldenFile.name.replace(RESULTS_PREFIX, "") : null,
                specFile: cfgFile ? cfgFile.name.replace(RESULTS_PREFIX, "") : null,
                submitTime: metadata.timeCreated,
                ...jobMetadata,
            };
        }));

        const allJobs = [...oldJobs, ...newJobs];
        
        return allJobs
            .filter(job => job !== null)
            .sort((a, b) => {
                const timeA = a.completionTime || a.submitTime || 0;
                const timeB = b.completionTime || b.submitTime || 0;
                return new Date(timeB) - new Date(timeA);
            })
            .slice(0, limit);
    } catch (error) {
        logger.error("Error listing completed/running jobs", error);
        throw error;
    }
}

async function getAllJobJsonData(limit = 75) {
    try {
        const allFiles = await listFilesWithQuery(RESULTS_PREFIX);
        const jsonFiles = allFiles.filter(file => {
            const pathParts = file.name.replace(RESULTS_PREFIX, "").split("/");
            return pathParts.length === 2 && file.name.endsWith('.json');
        });

        // Sort by filename (job folder name contains timestamp) - newest first
        jsonFiles.sort((a, b) => b.name.localeCompare(a.name));
        
        // Take only the top N files
        const topFiles = jsonFiles.slice(0, limit);

        // Load JSON files and extract job folder from path
        const jsonDataArray = await Promise.all(topFiles.map(async (file) => {
            const pathParts = file.name.replace(RESULTS_PREFIX, "").split("/");
            const jobFolder = pathParts[0];
            
            // Get file creation time
            const [fileMetadata] = await file.getMetadata();
            const fileTime = fileMetadata.timeCreated;
            
            // Convert to ISO string
            const completedTime = fileTime instanceof Date 
                ? fileTime.toISOString() 
                : (fileTime || new Date().toISOString());
            
            try {
                const [content] = await file.download();
                const jsonContent = content.toString("utf8");
                const parsedData = JSON.parse(jsonContent);
                
                // Filter out running jobs if status is in JSON
                if (parsedData.status === 'RUNNING') {
                    return null;
                }
                
                // Return JSON data with job identifier and completed timestamp
                return {
                    job: jobFolder,
                    completed: completedTime,
                    ...parsedData,
                };
            } catch (error) {
                logger.warn(`Failed to parse JSON file for job ${jobFolder}`, error);
                return null;
            }
        }));

        // Filter out nulls (failed parses or running jobs)
        return jsonDataArray.filter(data => data !== null);
    } catch (error) {
        logger.error("Error getting all job JSON data", error);
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

async function saveJobFileInFolder(folderPath, filename, content, metadata = {}) {
    try {
        const fullPath = `${JOBS_PREFIX}${folderPath}/${filename}`;
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
        logger.error("Error saving job file in folder", error);
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
 * Reads the ending lines from a file in cloud storage.
 * @param {Object} file - File object from getBucket().file()
 * @param {number} [maxBytes=128] - Maximum number of bytes to read from the end
 * @return {Promise<string[]>} Array of non-empty trimmed lines from the end of the file
 */
async function getFileEndingLines(file, maxBytes = 128) {
    const [stats] = await file.getMetadata();
    const fileSize = parseInt(stats.size);
    const readSize = Math.min(fileSize, maxBytes);

    let lastFileBytes = "";

    await new Promise((resolve, reject) => {
        logger.info(`Will read last ${readSize} bytes out of ${fileSize} bytes total from ${file.name}`);

        const stream = file.createReadStream({
            start: Math.max(0, fileSize - readSize),
            end: fileSize,
        });

        const writable = new Writable({
            write(chunk, encoding, callback) {
                try {
                    logger.info(`Read ${chunk.length} bytes from ${file.name} with [${encoding}] encoding`);
                    const validEncoding = (typeof encoding === "string" && !["buffer", ""].includes(encoding)) ?
                        encoding : "utf8";
                    lastFileBytes += chunk.toString(validEncoding);
                    callback();
                } catch (err) {
                    callback(err);
                }
            },
        });

        stream.on("error", (err) => {
            logger.error(`Error reading file ${file.name}`, err);
            reject(err);
        });

        writable.on("error", (err) => {
            logger.error(`Error in writable stream for ${file.name}`, err);
            reject(err);
        });

        writable.on("finish", () => {
            resolve();
        });

        const cleanup = () => {
            logger.info(`Finished reading ${lastFileBytes.length} bytes from ${file.name}, cleaning up`);
            stream.removeAllListeners();
            writable.removeAllListeners();
        };

        writable.on("finish", cleanup);
        writable.on("error", cleanup);
        stream.on("error", cleanup);

        logger.info(`Piping output stream for ${file.name}`);
        stream.pipe(writable);
    });

    return lastFileBytes.split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
}


async function updateFileMeta(file, metadata = {}) {
    const [existingMetadata] = await file.getMetadata();
    await file.setMetadata({
        metadata: {
            ...(existingMetadata.metadata || {}),
            ...metadata,
        },
    });
    return true;
}

async function trackNormalTermination(jobFolderPath) {

    const [files] = await getBucket().getFiles({ prefix: jobFolderPath });
    const outputFile = files.find(f => f.name.endsWith('.out'));
    
    if (!outputFile) {
        logger.warn(`No .out file found in job folder ${jobFolderPath}`);
        return false;
    }

    try {
        logger.info(`Start termination tracking for ${jobFolderPath}`);

        const lines = await getFileEndingLines(outputFile);

        const lastLine = lines.length > 0 ? lines[lines.length - 1] : "";
        const normalTermination = lastLine.includes("Normal Termination");

        // Find corresponding .in file
        const basePath = outputFile.name.replace(/\.out$/, '');
        const inputFile = getBucket().file(`${basePath}.in`);

        await updateFileMeta(inputFile, {
            normalTermination,
            lastOutputLine: lastLine,
        });

        return true;
    } catch (error) {
        logger.error(`Failed to track termination for ${jobFolderPath}`, error);
        return false;
    }
}

async function updateJobStatus(filePath, status, additionalMetadata = {}) {
    try {
        const file = getBucket().file(filePath);
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

async function getRunningJobMetadataFile(folderPath) {
    const [jobFiles] = await getBucket().getFiles({ prefix: `${RESULTS_PREFIX}${folderPath}/` });
    return jobFiles.find(f => f.name.endsWith('.cfg'));
}

async function moveJobToResults(job_folder) {
    try {
        const folderPrefix = `${JOBS_PREFIX}${job_folder}/`;
        const [files] = await getBucket().getFiles({ prefix: folderPrefix });
        
        if (files.length === 0) {
            logger.warn(`No files found in job folder ${job_folder}, may have been moved already`);
            return true;
        }

        logger.info(`Moving ${files.length} files from job folder ${job_folder} to results`);

        // Copy all files to results folder with their metadata
        await Promise.all(files.map(async (file) => {
            const relativePath = file.name.replace(JOBS_PREFIX, "");
            const destinationPath = `${RESULTS_PREFIX}${relativePath}`;
            
            const [metadata] = await file.getMetadata();
            await file.copy(destinationPath, {
                metadata: metadata.metadata,
            });
        }));

        // Delete all original files (this removes the folder since folders don't exist as separate entities)
        await Promise.all(files.map(f => f.delete()));

        logger.info(`Successfully moved job folder ${job_folder} to results`);
        return true;
    } catch (error) {
        logger.warn("Error moving job to results, could have been moved earlier", error);
        throw error;
    }
}

async function moveJobToTrajectory(filename) {
    try {
        const sourcePath = `${RESULTS_PREFIX}${filename}`;
        const sourceFile = getBucket().file(sourcePath);

        // Get the metadata of the source file
        const [metadata] = await sourceFile.getMetadata();

        // First, copy the spec file to results with the existing metadata
        await sourceFile.copy(`${TRAJECTORY_PREFIX}${filename}`, {
            metadata: metadata.metadata,
        });

        // Then delete the original
        await sourceFile.delete();

        logger.info(`Moved ${filename} to trajectory results`);
        return true;
    } catch (error) {
        logger.warn("Error moving job file to trajectory results, could have been moved earlier?", error);
    }
}

async function deleteJob(jobFolder) {
    try {
        // Check both JOBS_PREFIX and RESULTS_PREFIX for the folder
        let folderPrefix = `${JOBS_PREFIX}${jobFolder}/`;
        let [files] = await getBucket().getFiles({ prefix: folderPrefix });
        
        logger.info(`Deleting ${files.length} files from folder ${jobFolder}`);
        await Promise.all(files.map(f => f.delete()));
        return true;
    } catch (error) {
        logger.error("Error deleting job", error);
        throw error;
    }
}

module.exports = {
    listPendingAndDraftJobs,
    listCompletedAndRunningJobs,
    getAllJobJsonData,
    getJobFile,
    saveJobFile,
    saveJobFileInFolder,
    updateJobMeta,
    updateFileMeta,
    updateJobStatus,
    getRunningJobMetadataFile,
    moveJobToResults,
    moveJobToTrajectory,
    trackNormalTermination,
    deleteJob,
    listFilesWithQuery,
    getBucket,
    getFileEndingLines,
    jobFolderExists,
    JOBS_PREFIX,
    RESULTS_PREFIX,
};

const {logger} = require("firebase-functions");
const {getStorage} = require("firebase-admin/storage");
const admin = require("firebase-admin");

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

        // Group files by job (excluding .molden files)
        files.forEach((file) => {
            const fullName = file.name.replace(RESULTS_PREFIX, "");
            const baseName = fullName.replace(/\.(out|molden)$/, "");

            if (!completedJobs.has(baseName)) {
                completedJobs.set(baseName, {filename: baseName});
            }

            const job = completedJobs.get(baseName);
            if (fullName.endsWith(".molden")) {
                job.moldenFile = fullName;
            } else if (fullName.endsWith(".out")) {
                job.resultFile = fullName;
            }
        });

        // Get completion times from metadata
        const jobPromises = Array.from(completedJobs.values()).map(async (job) => {
            if (job.resultFile) {
                const [metadata] = await getBucket()
                    .file(`${RESULTS_PREFIX}${job.resultFile}`)
                    .getMetadata();
                job.completionTime = metadata.metadata?.completionTime || metadata.timeCreated;
            }
            return job;
        });

        const jobs = await Promise.all(jobPromises);
        return jobs
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
        logger.error("Error getting job file", error);
        throw error;
    }
}

async function saveJobFile(filename, content, type, metadata = {}) {
    try {
        const prefix = type === "spec" ? JOBS_PREFIX : RESULTS_PREFIX;
        const fullPath = `${prefix}${filename}`;
        const file = getBucket().file(fullPath);

        await file.save(content, {
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
        throw error;
    }
}

async function moveJobToResults(filename) {
    try {
        const sourcePath = `${JOBS_PREFIX}${filename}`;
        const sourceFile = getBucket().file(sourcePath);

        // First, copy the spec file to results
        await sourceFile.copy(`${RESULTS_PREFIX}${filename}`);
        // Then delete the original
        await sourceFile.delete();

        return true;
    } catch (error) {
        logger.error("Error moving job to results", error);
        throw error;
    }
}

module.exports = {
    listPendingJobs,
    listCompletedJobs,
    getJobFile,
    saveJobFile,
    updateJobStatus,
    moveJobToResults,
    JOBS_PREFIX,
    RESULTS_PREFIX,
};

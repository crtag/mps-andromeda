const {logger} = require("firebase-functions");
const {getStorage} = require("firebase-admin/storage");
const admin = require("firebase-admin");

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

const storage = getStorage();
const JOBS_BUCKET = "job-specs";
const RESULTS_BUCKET = "job-results";

// Bucket access helpers
const getJobSpecsBucket = () => storage.bucket(JOBS_BUCKET);
const getResultsBucket = () => storage.bucket(RESULTS_BUCKET);

// Job specification operations
/**
 * Retrieves the most recent job specification file from the job specs bucket.
 *
 * @async
 * @function getMostRecentJobSpec
 * @return {Promise<{content: string, filename: string} | null>} The content and filename of the most recent\
 * job spec file, or null if no files are found.
 */
async function getMostRecentJobSpec() {
    const [files] = await getJobSpecsBucket().getFiles();
    if (!files.length) return null;

    // Sort files by creation time, newest first
    const sortedFiles = files.sort((a, b) => new Date(b.metadata.timeCreated) - new Date(a.metadata.timeCreated));

    const [content] = await sortedFiles[0].download();
    return {
        content: content.toString("utf8"),
        filename: sortedFiles[0].name,
    };
}

/**
 * Deletes a job specification file from the job specs bucket.
 *
 * @async
 * @function deleteJobSpec
 * @param {string} filename - The name of the job specification file to delete.
 * @return {Promise<boolean>} A promise that resolves to true if the file was successfully deleted,\
 * or false if an error occurred.
 */
async function deleteJobSpec(filename) {
    try {
        const jobFile = getJobSpecsBucket().file(filename);
        await jobFile.delete();
        return true;
    } catch (error) {
        logger.error("Error deleting job spec", error);
        return false;
    }
}

/**
 * Appends content to a result file at a specified offset. If the file does not exist, it creates a new one.
 *
 * @async
 * @function appendToResultFile
 * @param {string} filename - The name of the result file (without extension).
 * @param {string} content - The content to append to the result file.
 * @param {number} offset - The line offset at which to start appending the content.
 * @return {Promise<boolean>} A promise that resolves to true if the operation was successful,\
 * or false if an error occurred.
 */
async function appendToResultFile(filename, content, offset) {
    const resultsBucket = getResultsBucket();
    const resultFile = resultsBucket.file(`${filename}.out`);

    try {
        const [exists] = await resultFile.exists();

        if (!exists) {
            await resultFile.save(content);
        } else {
            const [currentContent] = await resultFile.download();
            const currentLines = currentContent.toString().split("\n");

            const newLines = content.split("\n");
            while (currentLines.length < offset) {
                currentLines.push("");
            }

            for (let i = 0; i < newLines.length; i++) {
                currentLines[offset + i] = newLines[i];
            }

            await resultFile.save(currentLines.join("\n"));
        }
        return true;
    } catch (error) {
        logger.error("Error handling result file", error);
        return false;
    }
}

/**
 * Saves content to a Molden file.
 *
 * @async
 * @function saveMoldenFile
 * @param {string} filename - The name of the Molden file (without extension).
 * @param {string} content - The content to save to the Molden file.
 * @return {Promise<boolean>} A promise that resolves to true if the operation was successful,\
 * or false if an error occurred.
 */
async function saveMoldenFile(filename, content) {
    const resultsBucket = getResultsBucket();
    const moldenFile = resultsBucket.file(`${filename}.molden`);
    try {
        await moldenFile.save(content);
        return true;
    } catch (error) {
        logger.error("Error saving molden file", error);
        return false;
    }
}

module.exports = {
    getMostRecentJobSpec,
    deleteJobSpec,
    appendToResultFile,
    saveMoldenFile,
};

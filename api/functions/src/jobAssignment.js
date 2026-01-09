const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {listPendingAndDraftJobs, updateJobStatus, moveJobToResults} = require("../storageOperations");

// include sample text file
const fs = require("fs");
const path = require("path");
const sampleJobPath = path.join(__dirname, "sample_job.in");
// end of include

async function getNextJobToRun(workerType) {
    const pendingJobs = await listPendingAndDraftJobs();
    if (pendingJobs.length === 0) return null;

    // Filter by worker type and PENDING status, then sort by submitTime (oldest first) for FIFO
    const eligibleJobs = pendingJobs
        .filter((job) => 
            job.status === "PENDING" && 
            job.worker && 
            job.worker.toLowerCase() === workerType.toLowerCase()
        )
        .sort((a, b) => new Date(a.submitTime) - new Date(b.submitTime));
    
    if (eligibleJobs.length === 0) return null;
    const job = eligibleJobs[0];

    try {
        // Update job status to RUNNING
        await updateJobStatus(job.jobFilePath, "RUNNING", {
            startTime: new Date().toISOString(),
        });

        // Move folder to RESULTS when job starts running
        await moveJobToResults(job.jobFolder);

        // Return only the job folder name
        return job.jobFolder;
    } catch (error) {
        logger.error("Error updating job status", error);
        throw error;
    }
}

exports.handler = onRequest({cors: true}, async (req, res) => {
    logger.info("jobAssignment.handler");
    if (req.method !== "GET") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    const workerType = req.query.worker;
    if (!workerType) {
        res.status(400).send("Missing required query parameter: worker");
        return;
    }

    logger.info(`Start checking pending jobs for ${workerType}`, {structuredData: true});

    // Handle sample request
    if (req.path === "/sample" || req.query.sample === "true") {
        logger.info(`Sample job requested for ${workerType}`, {structuredData: true});
        res.status(200);
        res.set("Content-Type", "text/plain");
        res.send(fs.readFileSync(sampleJobPath, "utf8"));
        return;
    }

    // Get most recent job folder for this worker type
    try {
        const jobFolder = await getNextJobToRun(workerType);
        if (!jobFolder) {
            res.status(204).send();
            return;
        }

        res.status(200);
        res.set("Content-Type", "text/plain");
        res.send(jobFolder);
    } catch (error) {
        logger.error(`Error retrieving job folder for ${workerType}`, error);
        res.status(500).send("Internal Server Error");
    }
});

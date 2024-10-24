const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {getMostRecentJobSpec} = require("./storageOperations");

// include sample text file
const fs = require("fs");
const path = require("path");
const sampleJobPath = path.join(__dirname, "sample_job.in");
// end of include

exports.handler = onRequest(async (req, res) => {
    if (req.method !== "GET") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    logger.info("Start checking pending jobs", {structuredData: true});

    // Handle sample request
    if (req.path === "/sample") {
        logger.info("Sample job requested", {structuredData: true});
        res.status(200);
        res.set("Content-Type", "text/plain");
        res.send(fs.readFileSync(sampleJobPath, "utf8"));
        return;
    }

    // Get most recent job spec
    try {
        const jobSpec = await getMostRecentJobSpec();
        if (!jobSpec) {
            res.status(204).send();
            return;
        }

        // append the file name to the start of the content
        jobSpec.content = `${jobSpec.filename}\n\n${jobSpec.content}`;

        res.status(200);
        res.set("Content-Type", "text/plain");
        res.send(jobSpec.content);
    } catch (error) {
        logger.error("Error retrieving job spec", error);
        res.status(500).send("Internal Server Error");
    }
});

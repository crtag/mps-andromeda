const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");

// include sample text file
const fs = require("fs");
const path = require("path");
const sampleJobPath = path.join(__dirname, "sample_job.in");
// end of include

exports.handler = onRequest((req, res) => {
    if (req.method !== "GET") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    logger.info("Start checking pending jobs", {structuredData: true});

    // check the path param for "sample" which will indicate a POC situation where
    if (req.path === "/sample") {
        logger.info("Sample job requested", {structuredData: true});
        res.status(200);
        res.set("Content-Type", "text/plain");
        res.send(fs.readFileSync(sampleJobPath, "utf8"));
        return;
    }

    res.status(204);
    res.send();
});

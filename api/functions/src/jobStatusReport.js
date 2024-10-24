// jobStatusReport.js
const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {
    appendToResultFile,
    saveMoldenFile,
    deleteJobSpec,
} = require("./storageOperations");

exports.handler = onRequest(async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    const payload = req.body;
    if (payload.filename === undefined ||
        payload.status === undefined ||
        payload.new_content === undefined ||
        payload.offset === undefined
    ) {
        res.status(400).send("Bad payload format");
        return;
    }

    try {
        // Decode content
        const content = payload.new_content ?
            Buffer.from(payload.new_content, "base64").toString("utf8") :
            null;
        const molden = payload.molden ?
            Buffer.from(payload.molden, "base64").toString("utf8") :
            null;

        // Log the operation
        logger.info("Processing job status report (modified for clarity)", {
            structuredData: true,
            filename: payload.filename,
            status: payload.status,
            contentSize: content ? content.length : 0,
            moldenSize: molden ? molden.length : 0,
        });

        // Handle content update if present
        if (content) {
            await appendToResultFile(payload.filename, content, payload.offset);
        }

        // Handle job completion
        if (payload.status === "ENDED") {
            // Save molden file if provided
            if (molden) {
                await saveMoldenFile(payload.filename, molden);
            }
            // Delete job spec file
            await deleteJobSpec(payload.filename);
        }

        res.status(204).send();
    } catch (error) {
        logger.error("Error processing status report", error);
        res.status(500).send("Internal Server Error");
    }
});

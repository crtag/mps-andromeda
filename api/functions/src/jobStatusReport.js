const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {
    saveJobFile,
    updateJobStatus,
    moveJobToResults,
    getJobFile,
} = require("../storageOperations");

async function handleJobCompletion(filenameKey, moldenContent = null) {
    // Save molden file if provided
    if (moldenContent) {
        await saveJobFile(`${filenameKey}.molden`, moldenContent, "result");
    }

    // Update status and move job spec to results, in this order
    await updateJobStatus(`${filenameKey}.in`, "ENDED", {
        completionTime: new Date().toISOString(),
    });
    await moveJobToResults(`${filenameKey}.in`);
}

async function handleJobFailure(filenameKey) {
    // Update status and move job spec to results, in this order
    await updateJobStatus(`${filenameKey}.in`, "FAILED", {
        completionTime: new Date().toISOString(),
    });
    try {
        await moveJobToResults(`${filenameKey}.in`);
        return true;
    } catch (error) {
        logger.error("Error moving FAILED job to results", error);
        return false;
    }
}

async function appendToResultFile(filenameKey, content, offset) {
    try {
        // Get existing content if any
        let existingContent = "";
        try {
            existingContent = await getJobFile(`${filenameKey}.out`, "result");
        } catch (error) {
            // File might not exist yet, which is fine
            if (!error?.message.startsWith("File not found")) {
                throw error;
            } else {
                logger.info("Result file not found, this is likely the first append");
            }
        }

        // Split existing content and new content into lines
        const lines = existingContent ? existingContent.split("\n") : [];
        const newLines = content.split("\n");

        // Append or replace lines starting at the specified offset
        for (let i = 0; i < newLines.length; i++) {
            lines[offset + i] = newLines[i];
        }

        // Save the updated content
        await saveJobFile(`${filenameKey}.out`, lines.join("\n"), "result");
        return true;
    } catch (error) {
        logger.error("Error appending to result file", error);
        throw error;
    }
}

exports.handler = onRequest({cors: true}, async (req, res) => {
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
        logger.info("Processing job status report", {
            structuredData: true,
            filename: payload.filename,
            offset: payload.offset,
            status: payload.status,
            contentSize: content ? content.length : 0,
            moldenSize: molden ? molden.length : 0,
        });

        // IMPORTANT! filename comes without an extension
        const filenameKey = payload.filename;

        // Handle content update if present
        if (content) {
            await appendToResultFile(filenameKey, content, payload.offset);
        }

        // Update job status timestamp
        await updateJobStatus(`${filenameKey}.in`, payload.status, {
            lastUpdate: new Date().toISOString(),
        });

        // Handle job completion
        if (payload.status === "ENDED") {
            await handleJobCompletion(filenameKey, molden);
        }

        // Handle job failure
        if (payload.status === "FAILED") {
            if (!await handleJobFailure(filenameKey)) {
                res.status(500).send("Error moving FAILED job to results");
                return;
            }
        }

        res.status(204).send();
    } catch (error) {
        logger.error("Error processing status report", error);
        res.status(500).send("Internal Server Error");
    }
});

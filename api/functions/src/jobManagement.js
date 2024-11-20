const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {
    listPendingJobs,
    listCompletedJobs,
    getJobFile,
    saveJobFile,
} = require("../storageOperations");

async function validateJobSpec(content) {
    const lines = content.split("\n");
    const errors = [];

    if (lines.length < 3) {
        errors.push("Job spec must be at least 3 lines");
        return {valid: false, errors};
    }

    // Check if the second line is empty
    if (lines[1].trim() !== "") {
        errors.push("Second line must be empty");
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

exports.listPendingJobsHandler = onRequest({cors: true}, async (req, res) => {
    if (req.method !== "GET") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    try {
        const jobs = await listPendingJobs();
        res.status(200).json(jobs);
    } catch (error) {
        logger.error("Error listing pending jobs", error);
        res.status(500).send("Internal Server Error");
    }
});

exports.listCompletedJobsHandler = onRequest({cors: true}, async (req, res) => {
    if (req.method !== "GET") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    try {
        const limit = parseInt(req.query.limit) || 10;
        const jobs = await listCompletedJobs(limit);
        res.status(200).json(jobs);
    } catch (error) {
        logger.error("Error listing completed jobs", error);
        res.status(500).send("Internal Server Error");
    }
});

exports.getJobFileHandler = onRequest({cors: true}, async (req, res) => {
    if (req.method !== "GET") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    try {
        const {filename, type} = req.query;
        if (!filename || !type) {
            res.status(400).send("Missing required parameters");
            return;
        }

        const content = await getJobFile(filename, type);
        // force download headers
        res.set("Content-Disposition", `attachment; filename="${filename}"`);
        res.status(200).send(content);
    } catch (error) {
        logger.error("Error getting job file", error);
        res.status(error.message === "File not found" ? 404 : 500)
            .send(error.message || "Internal Server Error");
    }
});

exports.uploadJobSpecHandler = onRequest({cors: true}, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    try {
        const content = req.body.content;
        const originalFilename = req.body.filename;

        if (!content || !originalFilename) {
            res.status(400).send("Content and filename are required");
            return;
        }

        // Validate content
        const validation = await validateJobSpec(content);
        if (!validation.valid) {
            res.status(400).json({
                success: false,
                message: "Validation failed",
                errors: validation.errors,
            });
            return;
        }

        // strip off any dangerous file name characters from originalFilename
        // eslint-disable-next-line no-useless-escape
        const safeFilename = originalFilename.replace(".in", "").replace(/[^a-zA-Z0-9_\-]/g, "_");

        // Generate unique filename using truncated timestamp
        const timestamp = new Date().toISOString()
            .replace(/[^0-9]/g, "") // Remove non-digits
            .slice(0, 12); // Take first 12 digits (enough for uniqueness)
        const filename = `${safeFilename}_${timestamp}.in`;

        // extract the first line of the file to use as the job spec in metadata
        const jobSpec = content.split("\n")[0];

        // Save to storage
        await saveJobFile(filename, content, "spec", {
            status: "PENDING",
            submitTime: new Date().toISOString(),
            jobSpec,
        });

        res.status(200).json({
            success: true,
            message: "Job spec uploaded successfully",
            filename,
        });
    } catch (error) {
        logger.error("Error uploading job spec", error);
        res.status(500).json({
            success: false,
            message: "Error uploading job spec",
        });
    }
});

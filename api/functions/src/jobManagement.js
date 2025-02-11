const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {
    listPendingJobs,
    listCompletedJobs,
    getJobFile,
    saveJobFile,
    trackNormalTermination,
    parseSimulationOutput,
    updateJobMeta,
} = require("../storageOperations");
const {extractMoleculeInput} = require("../outputOperations");

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

    // see if dry run is indicated in query string via dryRun=true
    const dryRun = req.query?.dryRun === "true";

    let content;

    try {
        content = atob(req.body.content);
        content = content.trim();
        // replace all windows line endings with unix line endings
        content = content.replace(/\r\n/g, "\n");
    } catch (error) {
        logger.error("Error decoding job file content. Expected base64 encodning.", error);
        res.status(400).json({
            success: false,
            message: "Error decoding job file content. Expected base64 encodning.",
        });
        return;
    }

    try {
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
        let filename = `${safeFilename}_${timestamp}.in`;

        // extract the first line of the file to use as the job spec in metadata
        const jobSpec = content.split("\n")[0];

        // detect Trajectory Simulation job type
        const isTrajectoryJob = req.body.direction && req.body.stepSize && req.body.numSteps && req.body.steeredAtoms;

        // create metadata object based on the job type
        const defaultMeta = {
            status: "PENDING",
            submitTime: new Date().toISOString(),
            jobSpec,
        };

        const metadata = isTrajectoryJob ? {
            ...defaultMeta,
            isTrajectoryJob: true,
            direction: req.body.direction,
            stepSize: req.body.stepSize,
            numSteps: req.body.numSteps,
            steeredAtoms: req.body.steeredAtoms,
            step: 1, // unconventionally start at 1
        } : defaultMeta;

        if (dryRun) {
            res.status(200).json({
                success: true,
                message: "Job spec validated successfully, dry run complete",
                filename,
                content,
                metadata,
            });
            return;
        }

        filename = isTrajectoryJob ? `1_${filename}` : filename;

        // Save to storage
        await saveJobFile(filename, content, "spec", metadata);

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

exports.terminationPostScanHandler = onRequest({cors: true}, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    try {
        const baseFilename = req.body.filename;

        if (!baseFilename) {
            res.status(400).send("Filename is required");
            return;
        }

        const trackRes = await trackNormalTermination(baseFilename, true);
        if (!trackRes) {
            res.status(500).send("Job output tracking failed");
            return;
        }
    } catch (error) {
        logger.error("Error while post scanning", error);
        res.status(500)
            .send(error.message || "Internal Server Error");
        return;
    }

    res.status(200).send("OK");
});

exports.terminationPostParseHandler = onRequest({cors: true}, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    try {
        const baseFilename = req.body.filename;

        if (!baseFilename) {
            res.status(400).send("Filename is required");
            return;
        }

        // download the output file content
        let content;
        try {
            content = await getJobFile(`${baseFilename}.out`, "result");
        } catch (error) {
            logger.error("Error downloading output file content, aborting. ", error);
            res.status(500)
                .send(error.message || "Internal Server Error");
            return false;
        }

        const {
            totalAtomNumber,
            numberElectrons,
            numberAlphaElectrons,
            numberBetaElectrons,
        } = extractMoleculeInput(content);
        // Update job status with metadata
        const metaUpdate = {};
        if (totalAtomNumber !== null) {
            metaUpdate.totalAtomNumber = totalAtomNumber;
        }
        if (numberElectrons !== null) {
            metaUpdate.numberElectrons = numberElectrons;
        }
        if (numberAlphaElectrons !== null) {
            metaUpdate.numberAlphaElectrons = numberAlphaElectrons;
        }
        if (numberBetaElectrons !== null) {
            metaUpdate.numberBetaElectrons = numberBetaElectrons;
        }
        await updateJobMeta(`${baseFilename}.in`, "result", metaUpdate);

        const {status: parseRes} = await parseSimulationOutput(baseFilename);
        if (!parseRes) {
            res.status(500).send("Job output parsing failed");
            return;
        }
    } catch (error) {
        logger.error("Error while post parsing", error);
        res.status(500)
            .send(error.message || "Internal Server Error");
        return;
    }

    res.status(200).send("OK");
});

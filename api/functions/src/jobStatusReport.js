const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {
    saveJobFile,
    updateJobStatus,
    moveJobToResults,
    getJobFile,
    trackNormalTermination,
    parseSimulationOutput,
    moveJobToTrajectory,
} = require("../storageOperations");
const {extractMoleculeInput, extractReverse, steerXYZ} = require("../outputOperations");

async function handleJobCompletion(filenameKey) {
    // Update status and move job spec to results, in this order
    await updateJobStatus(`${filenameKey}.in`, "ENDED", {
        completionTime: new Date().toISOString(),
    });

    await trackNormalTermination(filenameKey);

    await moveJobToResults(`${filenameKey}.in`);

    // this must be run after the job spec is moved to results
    // so all metadata and output are finalized
    const res = await parseSimulationOutput(filenameKey);

    // check if this was a trajectory job
    // typical metadata for a trajectory job
    // "metadata": {
    //     "status": "PENDING",
    //     "submitTime": "2025-02-10T02:34:15.714Z",
    //     "jobSpec": "DFT B3LYP D3MBJ BASIS=3-21G CONSTRAIN OPTIMIZE ICOORD=0",
    //     "direction": "[100]",
    //     "stepSize": 0.1,
    //     "numSteps": 50,
    //     "steeredAtoms": "25 112",
    //     "step": 1
    // }
    if (res.metadata?.isTrajectoryJob) {
        logger.info("Handling trajectory job completion");
        // see what step we are on now
        const currentStep = parseInt(res.metadata.step);
        const totalSteps = parseInt(res.metadata.numSteps);
        logger.info(`Current step ${currentStep} of ${totalSteps}`);

        if (currentStep < totalSteps) {
            const nextStep = currentStep + 1;
            // - create a new job spec with the next step, upload it to specs folder, this includes
            //   steering atoms coordinates update
            const specs = res.metadata.jobSpec;
            // get current XYZ from the output file
            // file name is filenameKey.xyz
            let currentXYZ = await getJobFile(`${filenameKey}.xyz`, "result");
            // strip off the first line with the number of atoms and the second line with the comment
            currentXYZ = currentXYZ.split("\n").slice(2).join("\n");
            logger.info("Current XYZ", currentXYZ);

            let nextXYZ;
            try {
                nextXYZ = steerXYZ(currentXYZ,
                    res.metadata.steeredAtoms,
                    res.metadata.stepSize,
                    res.metadata.direction);
                logger.info("Next XYZ", nextXYZ);
            } catch (error) {
                logger.error("Error steering XYZ", error);
            }

            // get the job spec file content and extract CONSTRAINT section fron the end
            const currentJobContent = await getJobFile(`${filenameKey}.in`, "result");
            const constraintSection = extractReverse(currentJobContent);

            // create new job with spec, xyz and constraint section
            const newJobContent = `${specs}\n\n${nextXYZ}\n\n${constraintSection}`;

            // drop unnecessary metadata
            delete res.metadata.totalTime;
            delete res.metadata.completionTime;
            delete res.metadata.lastOutputLine;
            delete res.metadata.normalTermination;
            delete res.metadata.minimizedEnergy;
            delete res.metadata.optimizedGeometrySaved;
            delete res.metadata.lastUpdate;

            // reconstruct full metadata
            const metadata = {
                ...res.metadata,
                step: nextStep,
                status: "PENDING",
                submitTime: new Date().toISOString(),
            };

            // replace the first index which is digit followed by underscore with new step
            const newFilenameKey = filenameKey.replace(/^\d+_/g, `${nextStep}_`);

            // create new job spec
            await saveJobFile(`${newFilenameKey}.in`, newJobContent, "spec", metadata);
        }
        // move the previous resulting files to the trajectory results folder
        try {
            await moveJobToTrajectory(`${filenameKey}.in`);
        } catch (error) {
            logger.error("Error moving job spec to trajectory", error);
        }
        try {
            await moveJobToTrajectory(`${filenameKey}.out`);
        } catch (error) {
            logger.error("Error moving job output to trajectory", error);
        }
        try {
            await moveJobToTrajectory(`${filenameKey}.xyz`);
        } catch (error) {
            logger.error("XYZ file not found, skipping move to trajectory", error);
        }
    }
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

exports.handler = onRequest(async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    logger.info("Received job status report");

    const payload = req.body;

    if (payload.filename === undefined ||
        payload.status === undefined ||
        payload.new_content === undefined ||
        payload.offset === undefined
    ) {
        res.status(400).send("Bad payload format");
        return;
    }

    // Decode content
    const content = payload.new_content ?
        Buffer.from(payload.new_content, "base64").toString("utf8") :
        null;

    // Log the operation
    logger.info("Processing job status report", {
        filename: payload.filename,
        offset: payload.offset,
        status: payload.status,
        contentSize: content ? content.length : 0,
    });

    try {
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

        // parse the initial payload for Molecule Input details
        if (content && payload.offset === 0) {
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
            await updateJobStatus(`${filenameKey}.in`, payload.status, metaUpdate);
        }

        // Handle job completion
        if (payload.status === "ENDED") {
            await handleJobCompletion(filenameKey);
        }

        // Handle job failure
        if (payload.status === "FAILED") {
            await handleJobFailure(filenameKey);
        }

        res.status(204).send();
    } catch (error) {
        logger.error("Error processing status report", error);
        res.status(500).send("Internal Server Error");
    }
});

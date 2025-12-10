const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {
    updateJobStatus,
    updateFileMeta,
    getBucket,
    saveJobFile,
} = require("../storageOperations");
const {parseOutputFile} = require("../outputOperations");


async function handleJobCompletionPySCF(jobFilePath) {
    // Update status and move job spec to results, in this order
    await updateJobStatus(jobFilePath, "ENDED", {
        completionTime: new Date().toISOString(),
    });
    //TODO: implement PySCF job completion handling
}

async function handleJobCompletionQUICK(jobFilePath) {
    // Update status and move job spec to results, in this order
    await updateJobStatus(jobFilePath, "ENDED", {
        completionTime: new Date().toISOString(),
    });

    const jobFolderPath = jobFilePath.split("/").slice(0, -1).join("/");
    const [jobFiles] = await getBucket().getFiles({ prefix: jobFolderPath });
    const jobFile = jobFiles.find(f => f.name === jobFilePath);
    const outputFile = jobFiles.find(f => f.name.endsWith('.out'));
    
    try {
        logger.info(`Extracting metadata from output file for ${jobFolderPath}`);
        
        const [content] = await outputFile.download();
        const outputContent = content.toString("utf8");

        const parsedData = parseOutputFile(outputContent);
        
        const metadata = {
            normalTermination: parsedData.normalTermination,
            lastOutputLine: parsedData.lastOutputLine,
            totalAtomNumber: parsedData.totalAtomNumber,
            numberElectrons: parsedData.numberElectrons,
            numberAlphaElectrons: parsedData.numberAlphaElectrons,
            numberBetaElectrons: parsedData.numberBetaElectrons,
            minimizedEnergy: parsedData.minimizedEnergy,
            totalTime: parsedData.totalTime,
            optimizedGeometrySaved: false,
        };

        // Save optimized geometry XYZ if present
        try {
            if (!parsedData.optimizedGeometry) {
                logger.warn("No optimized geometry found in output file.");
            } else {
                const baseFilename = outputFile.name.replace(/\.out$/, '').replace(/^(job-specs|job-results)\//, '');
                const atomsCount = parsedData.optimizedGeometry.split("\n").length;
                const optimizedGeometryHeader = `${atomsCount}\nEnergy=${parsedData.minimizedEnergy}\n`;

                await saveJobFile(`${baseFilename}.xyz`, optimizedGeometryHeader + parsedData.optimizedGeometry, "result", {
                    timestamp: new Date().toISOString(),
                });
                metadata.optimizedGeometrySaved = true;
            }
        } catch (error) {
            logger.error(`Failed to parse simulation output for ${jobFolderPath}`, error);
        }
        await updateFileMeta(jobFile, metadata);

    } catch (error) {
        logger.error(`Failed to track termination for ${jobFolderPath}`, error);
    }
}

async function handleJobFailurePySCF(jobFilePath) {
    // Update status and move job spec to results, in this order
    await updateJobStatus(jobFilePath, "FAILED", {
        completionTime: new Date().toISOString(),
    });
    //TODO: implement PySCF job failure handling
}

async function handleJobFailureQUICK(jobFilePath) {
    // Update status and move job spec to results, in this order
    await updateJobStatus(jobFilePath, "FAILED", {
        completionTime: new Date().toISOString(),
    });
}


exports.handler = onRequest(async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    const payload = req.body;
    const worker = req.query.worker;
    if (payload.jobstatusfilepath === undefined || payload.status === undefined) {
        res.status(400).send("Bad payload format");
        return;
    }
    if (worker === undefined) {
        res.status(400).send("Worker is required");
        return;
    }


    // Log the operation
    logger.info("Processing job status report", {
        jobStatusFilePath: payload.jobstatusfilepath,
        status: payload.status,
        worker: worker,
    });

    try {
        // Update job status timestamp - always pass full file path
        await updateJobStatus(payload.jobstatusfilepath, payload.status, {
            lastUpdate: new Date().toISOString(),
        });

        // Handle job completion
        if (payload.status === "ENDED") {
            if (worker === "PySCF") {
                await handleJobCompletionPySCF(payload.jobstatusfilepath);
            } else if (worker === "QUICK") {
                await handleJobCompletionQUICK(payload.jobstatusfilepath);
            } 
        } else if (payload.status === "FAILED") {
            if (worker === "PySCF") {
                await handleJobFailurePySCF(payload.jobstatusfilepath);
            } else if (worker === "QUICK") {
                await handleJobFailureQUICK(payload.jobstatusfilepath);
            } 
        } 

        res.status(204).send();
    } catch (error) {
        logger.error("Error processing status report", error);
        res.status(500).send("Internal Server Error");
    }
});

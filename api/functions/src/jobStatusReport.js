const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const {
    updateJobStatus,
    updateFileMeta,
    getBucket,
    saveJobFile,
    getRunningJobMetadataFile,
} = require("../storageOperations");
const {parseOutputFile} = require("../outputOperations");

async function updateOutputFiles(jobFilePath) {
    const jobFolderPath = jobFilePath.split("/").slice(0, -1).join("/");
    const [jobFiles] = await getBucket().getFiles({ prefix: jobFolderPath });
    const jobFile = jobFiles.find(f => f.name === jobFilePath);
    
    if (!jobFile) {
        logger.warn(`updateOutputFiles: Job file not found for ${jobFilePath}`);
        return;
    }
    
    try {
        const [jobFileMetadata] = await jobFile.getMetadata();
        const inputFiles = jobFileMetadata.metadata.inputFiles 
            ? JSON.parse(jobFileMetadata.metadata.inputFiles) 
            : [];
        
        const fileList = jobFiles
            .map(f => {
                const relativePath = f.name.replace(jobFolderPath + '/', '');
                return relativePath;
            })
            .filter(f => !inputFiles.includes(f));
        
        await updateFileMeta(jobFile, {
            outputFiles: JSON.stringify(fileList),
        });
    } catch (error) {
        logger.error(`Failed to update outputFiles for ${jobFolderPath}`, error);
    }
}

async function handleJobCompletionPySCF(jobFilePath, status) {
    const jobFolderPath = jobFilePath.split("/").slice(0, -1).join("/");
    const [jobFiles] = await getBucket().getFiles({ prefix: jobFolderPath });
    const jobFile = jobFiles.find(f => f.name === jobFilePath);
    const jsonFile = jobFiles.find(f => f.name.endsWith('.json'));

    const metadata = {
        normalTermination: (status === "ENDED"),
        completionTime: new Date().toISOString(),
    };

    try {
        if (!jsonFile) {
            logger.warn(`handleJobCompletionPySCF: No JSON file found for ${status.toLowerCase()} job ${jobFolderPath}`);
            metadata.error = "Server Error: No result file found.";
            metadata.status = "FAILED";
            metadata.normalTermination = false;
            await updateFileMeta(jobFile, metadata);
            return;
        }
        logger.info(`handleJobCompletionPySCF: Extracting metadata from JSON file for ${jobFolderPath}`);
        
        const [content] = await jsonFile.download();
        const jsonContent = content.toString("utf8");
        const parsedData = JSON.parse(jsonContent);

        // Add user email from job metadata to result JSON
        try {
            const [jobFileMetadata] = await jobFile.getMetadata();
            if (jobFileMetadata.metadata.userEmail && !parsedData.user_email) {
                parsedData.user_email = jobFileMetadata.metadata.userEmail;

                // Re-save JSON with user email
                await jsonFile.save(JSON.stringify(parsedData, null, 2), {
                    contentType: 'application/json'
                });

                logger.info(`Added user email to result JSON for ${jobFolderPath}`);
            }
        } catch (error) {
            // Silently fail if unable to add user email
            logger.warn(`Could not add user email to result JSON for ${jobFolderPath}:`, error);
        }

        if (parsedData.error) {
            if (typeof parsedData.error === 'string') {
                metadata.error = parsedData.error;
            } else {
                const errorType = parsedData.error.type || 'Error';
                const errorMessage = parsedData.error.message || JSON.stringify(parsedData.error);
                metadata.error = `${errorType}: ${errorMessage}`;
            }
            metadata.status = "FAILED";
            metadata.normalTermination = false;
        } else {
            if (parsedData.computation_time !== undefined) {
                metadata.totalTime = parsedData.computation_time;
            }
            if (parsedData.energy !== undefined) {
                metadata.minimizedEnergy = parsedData.energy;
            }
        }
        await updateFileMeta(jobFile, metadata);

    } catch (error) {
        logger.error(`Failed to extract metadata from JSON for ${jobFolderPath}`, error);
        if (jobFile) {
            const errorMetadata = {
                status: "FAILED",
                normalTermination: false,
                completionTime: new Date().toISOString(),
                error: "Error:Failed to extract metadata from JSON",
            };
            await updateFileMeta(jobFile, errorMetadata);
        }
    }
}

async function handleJobCompletionQUICK(jobFilePath, status) {

    const jobFolderPath = jobFilePath.split("/").slice(0, -1).join("/");
    const [jobFiles] = await getBucket().getFiles({ prefix: jobFolderPath });
    const jobFile = jobFiles.find(f => f.name === jobFilePath);
    const outputFile = jobFiles.find(f => f.name.endsWith('.out'));
    if (!outputFile) {
        logger.warn(`No output file found for ${status.toLowerCase()} job ${jobFolderPath}`);
        return;
    }
    
    try {
        logger.info(`Extracting metadata from output file for ${jobFolderPath}`);
        
        const [content] = await outputFile.download();
        const outputContent = content.toString("utf8");

        const parsedData = parseOutputFile(outputContent);
        
        // Preserve user email from original metadata
        const [jobFileMetadata] = await jobFile.getMetadata();

        const metadata = {
            normalTermination: parsedData.normalTermination,
            lastOutputLine: parsedData.lastOutputLine,
            totalAtomNumber: parsedData.totalAtomNumber,
            numberElectrons: parsedData.numberElectrons,
            numberAlphaElectrons: parsedData.numberAlphaElectrons,
            numberBetaElectrons: parsedData.numberBetaElectrons,
        };

        if (jobFileMetadata.metadata.userEmail) {
            metadata.userEmail = jobFileMetadata.metadata.userEmail;
        }

        if (status === "ENDED") {
            //TODO: implement last step geometry saving for failed jobs
            metadata.minimizedEnergy = parsedData.minimizedEnergy;
            metadata.totalTime = parsedData.totalTime;
            metadata.optimizedGeometrySaved = false;

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
                logger.error(`Failed to save optimized geometry for ${jobFolderPath}`, error);
            }
        }

        await updateFileMeta(jobFile, metadata);

    } catch (error) {
        logger.error(`Failed to track termination for ${jobFolderPath}`, error);
    }
}

exports.handler = onRequest(async (req, res) => {
    if (req.method !== "POST") {
        logger.error("JobStatusReport.handler: Method Not Allowed");
        res.status(405).send("Method Not Allowed");
        return;
    }

    const payload = req.body;
    const worker = req.query.worker;
    if (payload.job_folder === undefined || payload.status === undefined) {
        logger.error("JobStatusReport.handler: Bad payload format");
        res.status(400).send("Bad payload format");
        return;
    }
    if (worker === undefined) {
        logger.error("JobStatusReport.handler: Worker is required");
        res.status(400).send("Worker is required");
        return;
    }

    const jobFolder = payload.job_folder;
    
    // Log the operation
    logger.info("JobStatusReport.handler: Processing job status report", {
        jobFolder: jobFolder,
        status: payload.status,
        worker: worker,
    });


    const cfgFile = await getRunningJobMetadataFile(jobFolder);
    const jobsMetadatafilepath = cfgFile.name;
    
    try {
        // Update outputFiles on every status update
        await updateOutputFiles(jobsMetadatafilepath);
        
        // Handle job completion or failure
        if (payload.status === "ENDED" || payload.status === "FAILED") {
            await updateJobStatus(jobsMetadatafilepath, payload.status, {
                completionTime: new Date().toISOString(),
            });
            if (worker === "PySCF") {
                await handleJobCompletionPySCF(jobsMetadatafilepath, payload.status);
            } else if (worker === "QUICK") {
                await handleJobCompletionQUICK(jobsMetadatafilepath, payload.status);
            } 
        } else {
            //just update last updated time, nothing else to update
            await updateJobStatus(jobsMetadatafilepath, "RUNNING", {});
        }

        res.status(204).send();
    } catch (error) {
        logger.error("Error processing status report", error);
        res.status(500).send("Internal Server Error");
    }
});

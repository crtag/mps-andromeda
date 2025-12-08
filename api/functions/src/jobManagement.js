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

// Parse config file to extract settings
function parseConfigFile(configContent) {
    const lines = configContent.split("\n").map(line => line.trim());
    
    const config = {};
    
    // Parse key-value pairs (key: value or key=value, handles quoted values)
    // Matches: KEY=value, KEY="quoted value", KEY: value, etc.
    lines.forEach(line => {
        // Skip empty lines and comment lines (starting with #)
        if (!line || line.startsWith('#')) {
            return;
        }
        
        const kvMatch = line.match(/(\w+)\s*[:=]\s*(.+)/);
        if (kvMatch) {
            const key = kvMatch[1].toLowerCase();
            let value = kvMatch[2].trim();
            
            // Remove inline comments (everything after # that's not inside quotes)
            // Handle quoted strings properly
            let inQuotes = false;
            let quoteChar = null;
            let commentIndex = -1;
            
            for (let i = 0; i < value.length; i++) {
                const char = value[i];
                if ((char === '"' || char === "'") && (i === 0 || value[i - 1] !== '\\')) {
                    if (!inQuotes) {
                        inQuotes = true;
                        quoteChar = char;
                    } else if (char === quoteChar) {
                        inQuotes = false;
                        quoteChar = null;
                    }
                } else if (char === '#' && !inQuotes) {
                    commentIndex = i;
                    break;
                }
            }
            
            if (commentIndex !== -1) {
                value = value.substring(0, commentIndex).trim();
            }
            
            // Remove surrounding quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) || 
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }
            
            config[key] = value;
        }
    });
    
    return config;
}

// Parse XYZ file to extract basic geometry info
function parseXYZFile(xyzContent) {
    const lines = xyzContent.split("\n").map(line => line.trim()).filter(line => line);
    
    if (lines.length < 2) {
        return { atomCount: 0 };
    }
    
    // First line is atom count
    const atomCount = parseInt(lines[0]) || 0;
    
    return { atomCount };
}

exports.uploadJobSpecHandler = onRequest({cors: true}, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    // see if dry run is indicated in query string via dryRun=true
    const dryRun = req.query?.dryRun === "true";

    let configContent, xyzContent;

    try {
        // Decode config file
        if (req.body.configContent) {
            configContent = atob(req.body.configContent);
            configContent = configContent.trim();
            configContent = configContent.replace(/\r\n/g, "\n");
        }
        
        // Decode xyz file
        if (req.body.xyzContent) {
            xyzContent = atob(req.body.xyzContent);
            xyzContent = xyzContent.trim();
            xyzContent = xyzContent.replace(/\r\n/g, "\n");
        }
    } catch (error) {
        logger.error("Error decoding file content. Expected base64 encoding.", error);
        res.status(400).json({
            success: false,
            message: "Error decoding file content. Expected base64 encoding.",
        });
        return;
    }

    try {
        const configFilename = req.body.configFilename;
        const xyzFilename = req.body.xyzFilename;
        const batchTimestamp = req.body.batchTimestamp; // Shared timestamp for batch
        const batchIndex = req.body.batchIndex || "01"; // Index in batch (01, 02, etc.)

        if (!configContent || !xyzContent || !configFilename || !xyzFilename) {
            res.status(400).send("Config and XYZ content and filenames are required");
            return;
        }

        // Parse config to extract settings
        const configData = parseConfigFile(configContent);
        
        // Extract worker from config (default to PySCF if not specified)
        const worker = configData.worker || "PySCF";
        
        // Parse XYZ to extract geometry info
        const { atomCount } = parseXYZFile(xyzContent);

        // Generate folder name: job_{timestamp}{index}
        // If batchTimestamp not provided, generate one
        const timestamp = batchTimestamp || new Date().toISOString()
            .replace(/[^0-9]/g, "") // Remove non-digits
            .slice(0, 12); // Take first 12 digits
        
        // Ensure batchIndex is 2 digits
        const index = batchIndex.toString().padStart(2, "0");
        const jobFolderName = `job_${timestamp}${index}`;
        
        logger.info(`Creating job folder: ${jobFolderName} (batchTimestamp: ${batchTimestamp}, batchIndex: ${batchIndex}, index: ${index})`);

        // Use original filenames inside the folder
        const originalConfigFilename = configFilename;
        const originalXyzFilename = xyzFilename;

        // Create metadata for XYZ file (main job file)
        const metadata = {
            status: "DRAFT",
            submitTime: new Date().toISOString(),
            config: originalConfigFilename, // Reference to config file (original name)
            worker: worker, // Worker type extracted from config
            atomCount: atomCount,
            description: req.body.description || "",
            jobFolder: jobFolderName, // Store folder name in metadata
        };

        if (dryRun) {
            res.status(200).json({
                success: true,
                message: "Job validated successfully, dry run complete",
                jobFolder: jobFolderName,
                configFilename: originalConfigFilename,
                xyzFilename: originalXyzFilename,
                metadata,
            });
            return;
        }

        // Import saveJobFileInFolder
        const { saveJobFileInFolder } = require("../storageOperations");

        // Save config file copy with original name inside folder
        await saveJobFileInFolder(jobFolderName, originalConfigFilename, configContent, {
            type: "config",
            timestamp: new Date().toISOString(),
        });

        // Save XYZ file with original name inside folder (main job file)
        await saveJobFileInFolder(jobFolderName, originalXyzFilename, xyzContent, metadata);

        res.status(200).json({
            success: true,
            message: "Job uploaded successfully",
            jobFolder: jobFolderName,
            configFilename: originalConfigFilename,
            xyzFilename: originalXyzFilename,
        });
    } catch (error) {
        logger.error("Error uploading job spec", error);
        res.status(500).json({
            success: false,
            message: "Error uploading job spec",
        });
    }
});

exports.confirmJobHandler = onRequest({cors: true}, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    try {
        const { jobFolder, filename } = req.body;

        if (!jobFolder || !filename) {
            res.status(400).json({
                success: false,
                message: "jobFolder and filename are required",
            });
            return;
        }

        // Construct the full path to the XYZ file
        const fullPath = `${jobFolder}/${filename}`;
        
        // Update job status from DRAFT to PENDING
        const { updateJobStatus } = require("../storageOperations");
        await updateJobStatus(fullPath, "PENDING", {
            confirmedTime: new Date().toISOString(),
        });

        res.status(200).json({
            success: true,
            message: "Job confirmed successfully",
            jobFolder: jobFolder,
            filename: filename,
        });
    } catch (error) {
        logger.error("Error confirming job", error);
        res.status(500).json({
            success: false,
            message: "Error confirming job",
        });
    }
});

exports.deleteJobHandler = onRequest({cors: true}, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    try {
        const { jobFolder, filename } = req.body;

        if (!filename) {
            res.status(400).json({
                success: false,
                message: "filename is required",
            });
            return;
        }

        // Construct the full path to the job file
        // For folder-based jobs: jobFolder/filename
        // For legacy jobs: just filename
        const fullPath = jobFolder ? `${jobFolder}/${filename}` : filename;
        
        // Delete the job and all files in its folder
        const { deleteJob } = require("../storageOperations");
        await deleteJob(fullPath);

        res.status(200).json({
            success: true,
            message: "Job deleted successfully",
            jobFolder: jobFolder || null,
            filename: filename,
        });
    } catch (error) {
        logger.error("Error deleting job", error);
        res.status(500).json({
            success: false,
            message: error.message || "Error deleting job",
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
        // Note: This assumes legacy .in files. For folder-based jobs with .xyz files,
        // the caller should pass the full path including folder (e.g., "job_20241201120001/molecule")
        // and the extension should match the actual file type (.xyz for new jobs, .in for legacy)
        // TODO: Make this handler support both .in and .xyz file types
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

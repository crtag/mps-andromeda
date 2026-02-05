const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const {
    listPendingAndDraftJobs,
    listCompletedAndRunningJobs,
    getAllJobJsonData,
    getJobFile,
    deleteJob,
    jobFolderExists,
    JOBS_PREFIX,
    RESULTS_PREFIX,
    getBucket,
} = require("../storageOperations");
const {extractMoleculeInput} = require("../outputOperations");

const fileViewerTemplate = fs.readFileSync(
    path.join(__dirname, "templates", "fileViewer.html"),
    "utf8"
);

exports.listPendingJobsHandler = onRequest({cors: true}, async (req, res) => {
    if (req.method !== "GET") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    try {
        const jobs = await listPendingAndDraftJobs();
        res.status(200).json(jobs);
    } catch (error) {
        logger.error("Error listing pending jobs", error);
        res.status(500).send("Internal Server Error");
    }
});

exports.listCompletedAndRunningJobsHandler = onRequest({cors: true}, async (req, res) => {
    if (req.method !== "GET") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    try {
        const limit = parseInt(req.query.limit) || 10;
        const jobs = await listCompletedAndRunningJobs(limit);
        res.status(200).json(jobs);
    } catch (error) {
        logger.error("Error listing completed jobs", error);
        res.status(500).send("Internal Server Error");
    }
});

exports.getAllJobJsonDataHandler = onRequest({cors: true}, async (req, res) => {
    if (req.method !== "GET") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    try {
        const limit = parseInt(req.query.limit) || 75;
        const jsonData = await getAllJobJsonData(limit);
        res.status(200).json(jsonData);
    } catch (error) {
        logger.error("Error getting all job JSON data", error);
        res.status(500).send("Internal Server Error");
    }
});

exports.getJobFileHandler = onRequest({cors: true}, async (req, res) => {
    if (req.method !== "GET") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    try {
        const {filename, type, view} = req.query;
        if (!filename || !type) {
            res.status(400).send("Missing required parameters");
            return;
        }

        const content = await getJobFile(filename, type);
        // Extract just the filename from path (e.g., "job_folder/file.xyz" -> "file.xyz")
        const downloadFilename = filename.includes('/') ? filename.split('/').pop() : filename;
        
        // If view=true, serve inline with whitespace preservation; otherwise force download
        if (view === 'true') {
            // Escape HTML entities to prevent XSS for display
            const escapedContent = content
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            
            // JSON-encode content and filename for JavaScript injection
            const fileContentJson = JSON.stringify(content);
            const filenameJson = JSON.stringify(downloadFilename);
            
            // Use template file
            const htmlContent = fileViewerTemplate
                .replace(/\{\{FILENAME\}\}/g, downloadFilename)
                .replace(/\{\{FILENAME_JSON\}\}/g, filenameJson)
                .replace(/\{\{FILE_CONTENT_JSON\}\}/g, fileContentJson)
                .replace(/\{\{CONTENT\}\}/g, escapedContent);
            
            res.set("Content-Type", "text/html; charset=utf-8");
            res.set("Content-Disposition", `inline; filename="${downloadFilename}"`);
            res.status(200).send(htmlContent);
        } else {
            res.set("Content-Disposition", `attachment; filename="${downloadFilename}"`);
            res.status(200).send(content);
        }
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

    let configContent;
    const files = {}; // Store decoded file contents by filename

    try {
        // Decode config file
        if (req.body.configContent) {
            configContent = atob(req.body.configContent);
            configContent = configContent.trim();
            configContent = configContent.replace(/\r\n/g, "\n");
        }
        
        // Decode all other files
        if (req.body.files && Array.isArray(req.body.files)) {
            for (const file of req.body.files) {
                if (file.filename && file.content) {
                    try {
                        let decodedContent = atob(file.content);
                        // Only trim/replace newlines for text files (XYZ, etc.)
                        if (file.filename.toLowerCase().endsWith('.xyz') || 
                            file.filename.toLowerCase().endsWith('.cfg')) {
                            decodedContent = decodedContent.trim();
                            decodedContent = decodedContent.replace(/\r\n/g, "\n");
                        }
                        files[file.filename] = decodedContent;
                    } catch (error) {
                        logger.warn(`Failed to decode file ${file.filename}:`, error);
                    }
                }
            }
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
        const batchTimestamp = req.body.batchTimestamp; // Shared timestamp for batch
        const batchIndex = req.body.batchIndex || "01"; // Index in batch (01, 02, etc.)

        if (!configContent || !configFilename) {
            res.status(400).send("Config content and filename are required");
            return;
        }
        
        // Find XYZ file (required for job creation)
        const xyzFilename = Object.keys(files).find(f => f.toLowerCase().endsWith('.xyz'));
        if (!xyzFilename) {
            res.status(400).send("XYZ file is required");
            return;
        }
        const xyzContent = files[xyzFilename];

        // Parse config to extract settings
        const configData = parseConfigFile(configContent);
        
        // Supported workers list
        const supportedWorkers = ["PySCF", "QUICK"]; //  "UMA"
        
        // Extract worker from config, trim whitespace and normalize
        const workerRaw = configData.worker ? configData.worker.trim() : null;
        const workerNormalized = workerRaw ? workerRaw.toLowerCase() : null;
        
        // Find matching worker (case-insensitive) - returns exact text from standard list
        const worker = workerNormalized 
            ? supportedWorkers.find(w => w.toLowerCase() === workerNormalized)
            : null;
        
        if (!worker) {
            res.status(400).json({
                success: false,
                message: `WORKER=${workerRaw || 'null'} not supported. Supported workers: ${supportedWorkers.join(", ")}`
            });
            return;
        }
        
        // Extract tags from config if present
        const tags = configData.tags || null;
        
        // Extract jobSpec based on worker type
        let jobSpec = null;
        if (worker === "QUICK") {
            jobSpec = configData.spec || null;
        } else if (worker === "PySCF") {
            const parts = [];
            if (configData?.task) parts.push(configData.task);
            if (configData?.functional) parts.push(configData.functional);
            if (configData?.basis) parts.push(configData.basis);
            parts.push(`CHARGE=${configData?.charge ?? 0}`);
            parts.push(`MULTIPLICITY=${configData?.multiplicity ?? 1}`);
            jobSpec = parts.length > 0 ? parts.join(" ") : null;
        }
        
        // Parse XYZ to extract geometry info
        const { atomCount } = parseXYZFile(xyzContent);

        // Generate folder name: job_{timestamp}{index}
        // If batchTimestamp not provided, generate one
        const timestamp = batchTimestamp || new Date().toISOString()
            .replace(/[^0-9]/g, "") // Remove non-digits
            .slice(0, 12); // Take first 12 digits
        
        // Start with provided batchIndex or 01
        let counter = parseInt(batchIndex) || 1;
        let jobFolderName;
        let exists = true;
        
        // Increment counter until we find an available folder name
        while (exists) {
            const index = counter.toString().padStart(2, "0");
            jobFolderName = `job_${timestamp}${index}`;
            exists = await jobFolderExists(jobFolderName);
            if (exists) {
                logger.info(`Job folder ${jobFolderName} already exists, incrementing counter`);
                counter++;
                if (counter > 99) {
                    throw new Error("Cannot find available job folder name (counter exceeded 99)");
                }
            }
        }
        
        logger.info(`Creating job folder: ${jobFolderName} (batchTimestamp: ${batchTimestamp}, batchIndex: ${batchIndex}, final counter: ${counter})`);

        // Use original filenames inside the folder
        const originalConfigFilename = configFilename;
        const originalXyzFilename = xyzFilename;

        // Collect all uploaded filenames
        const inputFiles = [originalConfigFilename, ...Object.keys(files)];

        // Create metadata for config file (main job file)
        const metadata = {
            status: "PENDING",
            submitTime: new Date().toISOString(),
            xyz: originalXyzFilename, // Reference to xyz file (original name)
            worker: worker, // Worker type extracted from config
            tags: tags, // Tags extracted from config
            jobSpec: jobSpec, // Job specifications (SPEC for QUICK, FUNCTIONAL BASIS TASK for PySCF)
            totalAtomNumber: atomCount,
            description: req.body.description || "",
            jobFolder: jobFolderName, // Store folder name in metadata
            inputFiles: JSON.stringify(inputFiles), // List of all uploaded files
            userEmail: req.body.userEmail || null,
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

        // Save config file copy with original name inside folder (main job file with metadata)
        await saveJobFileInFolder(jobFolderName, originalConfigFilename, configContent, metadata);

        // Save all other files (XYZ, CHK, etc.)
        for (const [filename, content] of Object.entries(files)) {
            if (filename !== originalConfigFilename) {
                await saveJobFileInFolder(jobFolderName, filename, content, {
                    timestamp: new Date().toISOString(),
                });
            }
        }

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

        // Construct the full path to the config file
        const configFilePath = `${JOBS_PREFIX}${jobFolder}/${filename}`;
        
        // Update job status from DRAFT to PENDING on config file
        const { updateJobStatus } = require("../storageOperations");
        await updateJobStatus(configFilePath, "PENDING", {});

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
        const { jobFolder } = req.body;        
        // Delete the job and all files in its folder
        await deleteJob(jobFolder);

        res.status(200).json({
            success: true,
            message: "Job deleted successfully",
            jobFolder: jobFolder,
        });
    } catch (error) {
        logger.error("Error deleting job", error);
        res.status(500).json({
            success: false,
            message: error.message || "Error deleting job",
        });
    }
});

/**
 * Update job metadata (tags, description)
 * POST with body: { jobFolder, tags, description }
 */
exports.updateJobMetadataHandler = onRequest({cors: true}, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    try {
        const { jobFolder, tags, description } = req.body;

        if (!jobFolder) {
            res.status(400).json({ success: false, error: "jobFolder is required" });
            return;
        }

        // Find the config file for this job
        // Try job-specs first (pending/running jobs)
        let configFile = null;
        const jobSpecPrefix = `${JOBS_PREFIX}${jobFolder}/`;
        const [specFiles] = await getBucket().getFiles({ prefix: jobSpecPrefix });
        configFile = specFiles.find(f => f.name.endsWith('.cfg'));

        // If not found, try job-results (completed jobs)
        if (!configFile) {
            const resultPrefix = `${RESULTS_PREFIX}${jobFolder}/`;
            const [resultFiles] = await getBucket().getFiles({ prefix: resultPrefix });
            configFile = resultFiles.find(f => f.name.endsWith('.cfg'));
        }

        if (!configFile) {
            res.status(404).json({ success: false, error: "Job not found" });
            return;
        }

        // Get existing metadata
        const [existingMetadata] = await configFile.getMetadata();

        // Optional: Check user ownership (if userEmail matches)
        // Uncomment when ready to enforce:
        // const userEmail = req.body.userEmail || null;
        // if (existingMetadata.metadata.userEmail && userEmail !== existingMetadata.metadata.userEmail) {
        //     res.status(403).json({ success: false, error: "Not authorized to edit this job" });
        //     return;
        // }

        // Build update object with only provided fields
        const updates = {};
        if (tags !== undefined) updates.tags = tags;
        if (description !== undefined) updates.description = description;
        updates.lastUpdate = new Date().toISOString();

        // Update metadata on config file
        await configFile.setMetadata({
            metadata: {
                ...existingMetadata.metadata,
                ...updates
            }
        });

        logger.info(`Updated metadata for job ${jobFolder}`, updates);

        // Also update result JSON if it exists (for completed jobs)
        try {
            const resultPrefix = `${RESULTS_PREFIX}${jobFolder}/`;
            const [resultFiles] = await getBucket().getFiles({ prefix: resultPrefix });
            const jsonFile = resultFiles.find(f => f.name.endsWith('.json'));

            if (jsonFile) {
                const [jsonContent] = await jsonFile.download();
                const parsedData = JSON.parse(jsonContent.toString('utf8'));

                // Update tags in JSON
                if (tags !== undefined) {
                    parsedData.tags = tags;
                }
                if (description !== undefined) {
                    parsedData.description = description;
                }

                // Save updated JSON
                await jsonFile.save(JSON.stringify(parsedData, null, 2), {
                    contentType: 'application/json'
                });

                logger.info(`Updated result JSON for job ${jobFolder}`);
            }
        } catch (error) {
            // Non-critical - result JSON might not exist yet
            logger.warn(`Could not update result JSON for ${jobFolder}:`, error.message);
        }

        res.status(200).json({
            success: true,
            message: "Job metadata updated successfully",
            jobFolder,
            updates
        });

    } catch (error) {
        logger.error("Error updating job metadata:", error);
        res.status(500).json({
            success: false,
            error: "Failed to update job metadata",
            details: error.message
        });
    }
});

exports.downloadJobFolderHandler = onRequest({cors: true}, async (req, res) => {
    if (req.method !== "GET") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    try {
        const { jobFolder } = req.query;
        if (!jobFolder) {
            res.status(400).json({
                success: false,
                message: "jobFolder parameter is required",
            });
            return;
        }

        const bucket = getBucket();
        const resultPrefix = `${RESULTS_PREFIX}${jobFolder}/`;

        const [resultFiles] = await bucket.getFiles({ prefix: resultPrefix });

        if (resultFiles.length === 0) {
            res.status(404).json({
                success: false,
                message: `No files found for job folder: ${jobFolder}`,
            });
            return;
        }

        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${jobFolder}.zip"`);

        const archive = archiver("zip", {
            zlib: { level: 9 },
        });

        archive.on("error", (err) => {
            logger.error("Archive error", err);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: "Error creating archive",
                });
            }
        });

        archive.pipe(res);

        for (const file of resultFiles) {
            const [content] = await file.download();
            const relativePath = file.name.includes("/") 
                ? file.name.split("/").slice(-2).join("/")
                : file.name;
            archive.append(content, { name: relativePath });
        }

        await archive.finalize();
    } catch (error) {
        logger.error("Error downloading job folder", error);
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: error.message || "Error downloading job folder",
            });
        }
    }
});


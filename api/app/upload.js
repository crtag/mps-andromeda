// ============================================
// UPLOAD MODULE
// Handles file upload, drag-and-drop, and job creation
// ============================================

const UploadModule = (function() {
    // ===================================================================
    // STATE
    // ===================================================================
    const fileState = {
        config: null,
        uploadedFiles: []
    };
    let isUploading = false;
    let API = null;
    let elements = null;
    let fetchJobs = null;
    let externalStatusCallback = null;
    
    // Track order counters per file type for default ordering
    const orderCounters = {};
    
    // Pin icon SVGs (base64 encoded)
    const PIN_ICON_UNPINNED = 'PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iNSIgeT0iMiIgd2lkdGg9IjYiIGhlaWdodD0iMiIgcng9IjAuNSIgZmlsbD0iIzAwNjZjYyIgc3Ryb2tlPSIjMDA2NmNjIiBzdHJva2Utd2lkdGg9IjAuNSIvPgo8cmVjdCB4PSI2LjUiIHk9IjQiIHdpZHRoPSIzIiBoZWlnaHQ9IjUiIGZpbGw9IiMwMDY2Y2MiIHN0cm9rZT0iIzAwNjZjYyIgc3Ryb2tlLXdpZHRoPSIwLjUiLz4KPHJlY3QgeD0iNCIgeT0iOSIgd2lkdGg9IjgiIGhlaWdodD0iMiIgZmlsbD0iIzAwNjZjYyIgc3Ryb2tlPSIjMDA2NmNjIiBzdHJva2Utd2lkdGg9IjAuNSIvPgo8cGF0aCBkPSJNNyAxMy41IEw5IDEzLjUgTDggMTYgWiIgZmlsbD0iIzAwNjZjYyIgc3Ryb2tlPSIjMDA2NmNjIiBzdHJva2Utd2lkdGg9IjAuNSIvPgo8cGF0aCBkPSJNNCA5IEw4IDYgTDEyIDkgWiIgZmlsbD0iIzAwNjZjYyIgc3Ryb2tlPSIjMDA2NmNjIiBzdHJva2Utd2lkdGg9IjAuNSIvPgo8cmVjdCB4PSI3IiB5PSIxMi41IiB3aWR0aD0iMiIgaGVpZ2h0PSIxLjUiIGZpbGw9IiMwMDY2Y2MiIHN0cm9rZT0iIzAwNjZjYyIgc3Ryb2tlLXdpZHRoPSIwLjUiLz4KPC9zdmc+';
    const PIN_ICON_PINNED = 'PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3QgeD0iNSIgeT0iNCIgd2lkdGg9IjYiIGhlaWdodD0iMiIgcng9IjAuNSIgZmlsbD0iIzAwNjZjYyIgc3Ryb2tlPSIjMDA2NmNjIiBzdHJva2Utd2lkdGg9IjAuNSIvPgo8cmVjdCB4PSI2LjUiIHk9IjYiIHdpZHRoPSIzIiBoZWlnaHQ9IjUiIGZpbGw9IiMwMDY2Y2MiIHN0cm9rZT0iIzAwNjZjYyIgc3Ryb2tlLXdpZHRoPSIwLjUiLz4KPHJlY3QgeD0iNCIgeT0iMTEiIHdpZHRoPSI4IiBoZWlnaHQ9IjIiIGZpbGw9IiMwMDY2Y2MiIHN0cm9rZT0iIzAwNjZjYyIgc3Ryb2tlLXdpZHRoPSIwLjUiLz4KPHBhdGggZD0iTTQgMTEgTDggOCBMMTIgMTEgWiIgZmlsbD0iIzAwNjZjYyIgc3Ryb2tlPSIjMDA2NmNjIiBzdHJva2Utd2lkdGg9IjAuNSIvPgo8cmVjdCB4PSI3IiB5PSIxMiIgd2lkdGg9IjIiIGhlaWdodD0iMS41IiBmaWxsPSIjMDA2NmNjIiBzdHJva2U9IiMwMDY2Y2MiIHN0cm9rZS13aWR0aD0iMC41Ii8+Cjwvc3ZnPg==';

    // ===================================================================
    // FILE HANDLING
    // ===================================================================
    function handleFile(file) {
        // Clear previous status when starting a new upload
        clearStatus();
        
        const filename = file.name.toLowerCase();
        const fileType = filename.endsWith('.cfg') ? 'config' : 
                        filename.endsWith('.xyz') ? 'xyz' : 'other';
        
        // Remove previous version if file with same name exists
        const existingIndex = fileState.uploadedFiles.findIndex(f => f.filename === file.name);
        if (existingIndex > -1) {
            const existingFile = fileState.uploadedFiles[existingIndex];
            // If it was a config file, clear the config state
            if (existingFile.type === 'config') {
                fileState.config = null;
            }
            fileState.uploadedFiles.splice(existingIndex, 1);
        }
        
        // Initialize order counter for this file type if needed
        if (!(fileType in orderCounters)) {
            orderCounters[fileType] = 0;
        }
        
        const fileObj = {
            filename: file.name,
            content: null,
            type: fileType,
            isExpected: false,
            pinned: false,
            autoPinned: false,
            order: orderCounters[fileType]++
        };
        
        fileState.uploadedFiles.push(fileObj);
        updateFileList();
        
        // After adding file, if config exists and there are other files of same type,
        // give new file lowest order to make it active
        const filesOfType = getMatchingFilesForFile(fileObj);
        if (filesOfType && filesOfType.length > 1) {
            const minOrder = Math.min(...filesOfType.map(f => f.order));
            if (fileObj.order > minOrder) {
                fileObj.order = minOrder - 1;
            }
        }
        
        // Check file size for large files (warn if > 50MB)
        const fileSizeMB = file.size / (1024 * 1024);
        if (fileSizeMB > 50) {
            showStatus(`Warning: ${file.name} is ${fileSizeMB.toFixed(1)}MB. Large files may take longer to process.`, '');
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            
            if (fileType === 'config') {
                // Config files - read as text and encode
                try {
                    fileObj.content = btoa(content);
                } catch (error) {
                    fileObj.content = btoa(unescape(encodeURIComponent(content)));
                }
                handleConfigContent(file.name, content);
            } else if (fileType === 'xyz') {
                // XYZ files - read as text and encode (needed for upload)
                try {
                    fileObj.content = btoa(content);
                } catch (error) {
                    fileObj.content = btoa(unescape(encodeURIComponent(content)));
                }
                validateFiles();
            } else {
                // Binary files (CHK, etc.) - encode as base64 for sending to server
                // Convert ArrayBuffer to base64
                const bytes = new Uint8Array(content);
                let binary = '';
                // Process in chunks to avoid blocking UI for very large files
                const chunkSize = 8192;
                for (let i = 0; i < bytes.length; i += chunkSize) {
                    const chunk = bytes.slice(i, Math.min(i + chunkSize, bytes.length));
                    binary += String.fromCharCode.apply(null, chunk);
                }
                fileObj.content = btoa(binary);
                validateFiles();
            }
        };
        reader.onerror = () => {
            const index = fileState.uploadedFiles.indexOf(fileObj);
            if (index > -1) {
                fileState.uploadedFiles.splice(index, 1);
                updateFileList();
            }
            showStatus(`Error reading ${file.name}`, 'error');
        };
        
        // Use ArrayBuffer for binary files to avoid memory issues with large files
        if (fileType === 'config' || fileType === 'xyz') {
            reader.readAsText(file);
        } else {
            // For large binary files, use ArrayBuffer (doesn't load full content into string)
            reader.readAsArrayBuffer(file);
        }
    }

    function handleConfigContent(filename, content) {
        // Find and update the config file object
        let configFileObj = fileState.uploadedFiles.find(f => f.type === 'config' && f.filename === filename);
        
        // If config file not found in list, create it (shouldn't happen, but handle race condition)
        if (!configFileObj) {
            if (!('config' in orderCounters)) {
                orderCounters['config'] = 0;
            }
            configFileObj = {
                filename: filename,
                content: btoa(content),
                type: 'config',
                isExpected: false,
                pinned: false,
                autoPinned: false,
                order: orderCounters['config']++
            };
        } else {
            configFileObj.content = btoa(content);
        }
        
        // Remove all other config files - only one config should be active at a time
        // The last one processed wins (handles race condition when multiple configs uploaded simultaneously)
        fileState.uploadedFiles = fileState.uploadedFiles.filter(f => f.type !== 'config' || f.filename === filename);
        
        // Ensure the current config file is definitely in the list (at the beginning)
        const exists = fileState.uploadedFiles.some(f => f === configFileObj || (f.type === 'config' && f.filename === filename));
        if (!exists) {
            fileState.uploadedFiles.unshift(configFileObj); // Add at beginning so config appears first
        }
        
        const {expectedFiles, info} = ConfigReader.getConfigInfo(content);
        
        fileState.config = {
            filename: filename,
            content: btoa(content),
            expectedFiles: expectedFiles,
            info: info,
        };
        
        validateFiles();
    }

    // ===================================================================
    // FILE MATCHING HELPER
    // ===================================================================
    function getFilesByExpectedType(expectedFiles) {
        const uploadedByType = {};
        
        fileState.uploadedFiles.forEach(file => {
            if (file.type === 'config') return;
            
            const fileExt = file.filename.toLowerCase().split('.').pop();
            const normalizedExt = fileExt === 'xyz' ? 'XYZ' : fileExt.toUpperCase();
            const fileNameLower = file.filename.toLowerCase().trim();
            
            for (const expected of expectedFiles) {
                const expectedLower = expected.toLowerCase().trim();
                
                if (expected === 'XYZ' && normalizedExt === 'XYZ') {
                    if (!uploadedByType['XYZ']) {
                        uploadedByType['XYZ'] = [];
                    }
                    uploadedByType['XYZ'].push(file);
                    break;
                } else {
                    const expectedFilename = expectedLower.split(/[/\\]/).pop();
                    if (expectedFilename === fileNameLower) {
                        if (!uploadedByType[expected]) {
                            uploadedByType[expected] = [];
                        }
                        uploadedByType[expected].push(file);
                        break;
                    }
                }
            }
        });
        
        return uploadedByType;
    }

    function validateFiles() {
        // Reset all file validation states
        fileState.uploadedFiles.forEach(file => {
            file.isExpected = false;
        });
        
        if (!fileState.config) {
            updateFileList();
            return;
        }

        const expectedFiles = fileState.config.expectedFiles || [];
        const uploadedByType = getFilesByExpectedType(expectedFiles);
        
        // Mark files as expected based on order (lowest order = active)
        expectedFiles.forEach(expectedType => {
            const files = uploadedByType[expectedType] || [];
            if (files.length === 0) {
                return;
            }
            
            // Sort by order (lower order = higher priority)
            const sorted = [...files].sort((a, b) => a.order - b.order);
            
            // Mark the file with lowest order as expected (active)
            sorted.forEach((file, index) => {
                file.isExpected = (index === 0);
                // Reset autoPinned when file becomes active
                if (index === 0 && file.autoPinned) {
                    file.autoPinned = false;
                }
            });
        });
        
        // Config files are always expected
        fileState.uploadedFiles.forEach(file => {
            if (file.type === 'config') {
                file.isExpected = true;
                // Reset autoPinned for config files too
                if (file.autoPinned) {
                    file.autoPinned = false;
                }
            }
        });
        
        updateFileList();
    }

    function removeFile(filename) {
        const index = fileState.uploadedFiles.findIndex(f => f.filename === filename);
        if (index > -1) {
            const file = fileState.uploadedFiles[index];
            fileState.uploadedFiles.splice(index, 1);
            
            if (file.type === 'config') {
                fileState.config = null;
            }
            
            validateFiles();
        }
    }

    function togglePin(filename) {
        const file = fileState.uploadedFiles.find(f => f.filename === filename);
        if (file) {
            file.pinned = !file.pinned;
            updateFileList();
        }
    }

    function getMatchingFilesForFile(file) {
        if (!fileState.config || file.type === 'config') {
            return null;
        }
        
        const expectedFiles = fileState.config.expectedFiles || [];
        const uploadedByType = getFilesByExpectedType(expectedFiles);
        
        // Find which expected type this file matches
        for (const expectedType of expectedFiles) {
            const files = uploadedByType[expectedType] || [];
            if (files.includes(file)) {
                return files.length > 1 ? files : null;
            }
        }
        
        return null;
    }

    function toggleFileActive(filename) {
        const file = fileState.uploadedFiles.find(f => f.filename === filename);
        if (!file) {
            return;
        }

        const filesOfType = getMatchingFilesForFile(file);
        if (!filesOfType) {
            return;
        }
        
        // Sort by order
        const sorted = [...filesOfType].sort((a, b) => a.order - b.order);
        
        if (file.isExpected) {
            // File is active - scratch it off and activate next in line
            const currentIndex = sorted.findIndex(f => f === file);
            if (currentIndex < sorted.length - 1) {
                // Swap with next file in order (activates next file)
                const nextFile = sorted[currentIndex + 1];
                const tempOrder = file.order;
                file.order = nextFile.order;
                nextFile.order = tempOrder;
            } else {
                // Last file - increase its order to scratch it off (no replacement available)
                const maxOrder = Math.max(...filesOfType.map(f => f.order));
                file.order = maxOrder + 1;
            }
        } else {
            // File is scratched - activate it by swapping with currently active file
            const activeFile = sorted[0]; // First one has lowest order
            const tempOrder = file.order;
            file.order = activeFile.order;
            activeFile.order = tempOrder;
        }
        
        validateFiles();
    }

    // ===================================================================
    // UI UPDATES
    // ===================================================================
    function updateFileList() {
        if (!elements || !elements.fileList) {
            return;
        }
        
        // Show/hide upload card based on whether files have been uploaded
        if (elements.uploadCard) {
            if (fileState.uploadedFiles.length > 0) {
                elements.uploadCard.style.display = 'block';
            } else {
                elements.uploadCard.style.display = 'none';
            }
        }
        
        // Update info string display
        if (elements.infoDisplay) {
            if (fileState.config && fileState.config.info) {
                elements.infoDisplay.textContent = fileState.config.info;
                elements.infoDisplay.style.display = 'block';
            } else {
                elements.infoDisplay.style.display = 'none';
            }
        }
        
        elements.fileList.innerHTML = '';
        
        // Sort files: config first, then others
        const sortedFiles = [...fileState.uploadedFiles].sort((a, b) => {
            if (a.type === 'config') return -1;
            if (b.type === 'config') return 1;
            return 0;
        });
        
        sortedFiles.forEach(file => {
            const fileItem = document.createElement('div');
            fileItem.style.display = 'flex';
            fileItem.style.alignItems = 'center';
            fileItem.style.marginBottom = '4px';
            fileItem.style.padding = '4px 8px';
            fileItem.style.borderRadius = '4px';
            
            let bgColor, textColor;
            
            if (!fileState.config) {
                bgColor = '#f5f5f5';
                textColor = '#666';
            } else if (file.isExpected) {
                bgColor = '#e8f5e9';
                textColor = '#2e7d32';
            } else {
                bgColor = '#ffebee';
                textColor = '#c62828';
            }
            
            fileItem.style.backgroundColor = bgColor;
            
            const fileName = document.createElement('span');
            fileName.textContent = file.filename;
            fileName.style.flex = '1';
            fileName.style.color = textColor;
            
            // Make files clickable (except config files)
            const filesOfType = getMatchingFilesForFile(file);
            if (filesOfType && filesOfType.length > 1) {
                // Multiple files of this type - make clickable
                fileName.classList.add('file-clickable');
                fileName.style.cursor = 'pointer';
                if (file.isExpected) {
                    fileName.title = 'Click to scratch off this file';
                } else {
                    fileName.classList.add('file-scratch');
                    fileName.title = 'Click to activate this file';
                }
                fileName.onclick = (e) => {
                    e.stopPropagation();
                    toggleFileActive(file.filename);
                };
            } else {
                // Single file, not matching expected type, no config, or config file - not clickable
                fileName.classList.remove('file-clickable');
                if (fileState.config && !file.isExpected) {
                    fileName.classList.add('file-scratch');
                } else {
                    fileName.classList.remove('file-scratch');
                }
                fileName.style.cursor = 'default';
                fileName.title = '';
                fileName.onclick = null;
            }
            
            const pinBtn = document.createElement('button');
            pinBtn.className = 'btn-clipboard';
            const isExcluded = fileState.config && !file.isExpected && file.type !== 'config';
            const showAsPinned = file.pinned || file.autoPinned || isExcluded;
            const isAutoPinned = file.autoPinned || (isExcluded && !file.pinned);
            pinBtn.title = showAsPinned ? (isAutoPinned ? 'Auto-pinned (excluded file)' : 'Pinned file') : 'Pin file';
            pinBtn.innerHTML = `<img src="data:image/svg+xml;base64,${showAsPinned ? PIN_ICON_PINNED : PIN_ICON_UNPINNED}" alt="${showAsPinned ? 'pinned' : 'pin'}">`;
            if (isAutoPinned) {
                pinBtn.disabled = true;
                pinBtn.style.opacity = '0.5';
                pinBtn.style.cursor = 'not-allowed';
            } else {
                pinBtn.disabled = false;
                pinBtn.style.opacity = '1';
                pinBtn.style.cursor = 'pointer';
                pinBtn.onclick = () => togglePin(file.filename);
            }
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-clipboard';
            removeBtn.title = 'Remove file';
            removeBtn.innerHTML = '<img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMTIgNEw0IDEyTTQgNEwxMiAxMiIgc3Ryb2tlPSIjMDA2NmNjIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+" alt="delete">';
            removeBtn.onclick = () => removeFile(file.filename);
            
            fileItem.appendChild(fileName);
            fileItem.appendChild(pinBtn);
            fileItem.appendChild(removeBtn);
            elements.fileList.appendChild(fileItem);
        });
        
        updateWaitingMessages();
        updateConfirmButton();
    }

    function updateWaitingMessages() {
        if (!elements || !elements.waitingMessages) {
            initializeElements();
            if (!elements || !elements.waitingMessages) {
                return;
            }
        }
        
        elements.waitingMessages.innerHTML = '';
        
        if (!fileState.config) {
            return;
        }
        
        const expectedFiles = fileState.config.expectedFiles || [];
        if (expectedFiles.length === 0) {
            return;
        }
        
        const uploadedByType = getFilesByExpectedType(expectedFiles);
        
        expectedFiles.forEach(expectedType => {
            const files = uploadedByType[expectedType] || [];
            const expectedFile = files.find(f => f.isExpected && f.content !== null);
            
            if (!expectedFile) {
                const waitingMsg = document.createElement('div');
                waitingMsg.textContent = `Waiting for: ${expectedType}`;
                waitingMsg.style.color = '#666';
                waitingMsg.style.fontSize = '0.9em';
                waitingMsg.style.marginTop = '4px';
                elements.waitingMessages.appendChild(waitingMsg);
            }
        });
    }

    function updateConfirmButton() {
        if (!elements || !elements.confirmButton) {
            return;
        }
        
        if (!fileState.config) {
            elements.confirmButton.style.display = 'none';
            return;
        }
        
        elements.confirmButton.style.display = 'block';
        
        const expectedFiles = fileState.config.expectedFiles || [];
        const uploadedByType = getFilesByExpectedType(expectedFiles);
        
        let allPresent = true;
        expectedFiles.forEach(expectedType => {
            const files = uploadedByType[expectedType] || [];
            const readyFiles = files.filter(f => f.content !== null);
            if (readyFiles.length === 0) {
                allPresent = false;
            }
        });
        
        elements.confirmButton.disabled = !allPresent || isUploading;
        if (!allPresent || isUploading) {
            elements.confirmButton.style.opacity = '0.5';
            elements.confirmButton.style.cursor = 'not-allowed';
        } else {
            elements.confirmButton.style.opacity = '1';
            elements.confirmButton.style.cursor = 'pointer';
        }
    }

    // ===================================================================
    // UPLOAD OPERATIONS
    // ===================================================================
    async function createJob() {
        if (isUploading || !fileState.config) {
            return;
        }
        
        const expectedFiles = fileState.config.expectedFiles || [];
        const uploadedByType = getFilesByExpectedType(expectedFiles);
        
        // Build request body with config and all expected files
        const requestBody = {
            configFilename: fileState.config.filename,
            configContent: fileState.config.content,
            files: []
        };
        
        // Add all expected files (XYZ, CHK, etc.) - use the file marked as expected
        expectedFiles.forEach(expectedType => {
            const files = uploadedByType[expectedType] || [];
            const expectedFile = files.find(f => f.isExpected && f.content && f.content !== 'loaded');
            if (expectedFile) {
                requestBody.files.push({
                    filename: expectedFile.filename,
                    content: expectedFile.content
                });
            }
        });
        
        if (requestBody.files.length === 0) {
            showStatus('No files ready to upload', 'error');
            return;
        }
        
        isUploading = true;
        elements.confirmButton.disabled = true;
        
        try {
            const fileNames = requestBody.files.map(f => f.filename).join(', ');
            showStatus(`Uploading job with files: ${fileNames}...`, '');
            
            const response = await fetch(API.UPLOAD, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.message || 'Upload failed');
            }
            
            showStatus(`Successfully created job ${data.jobFolder}`, 'success');
            
            resetFiles();
            fetchJobs();
        } catch (error) {
            showStatus(`Error uploading job: ${error.message}`, 'error');
        } finally {
            isUploading = false;
            updateConfirmButton();
        }
    }

    function resetFiles() {
        // Check for pinned config file BEFORE filtering
        const keptConfigFile = fileState.uploadedFiles.find(file => file.type === 'config' && file.pinned);
        
        const filesToKeep = fileState.uploadedFiles.filter(file => {
            if (file.pinned) {
                return true;
            }
            if (file.type === 'config') {
                return false;
            }
            const isExcluded = fileState.config && !file.isExpected;
            return isExcluded;
        });
        
        // Mark excluded files as auto-pinned before clearing config
        filesToKeep.forEach(file => {
            if (fileState.config && !file.isExpected && file.type !== 'config' && !file.pinned) {
                file.autoPinned = true;
            }
        });
        
        // Update file list first
        fileState.uploadedFiles = filesToKeep;
        
        // Clear config state
        fileState.config = null;
        
        // Re-process config if one was kept (this will call validateFiles and updateFileList)
        if (keptConfigFile && keptConfigFile.content) {
            try {
                const configContent = atob(keptConfigFile.content);
                handleConfigContent(keptConfigFile.filename, configContent);
            } catch (e) {
                console.error('Error re-processing config:', e);
                updateFileList();
            }
        } else {
            // No config - update list to show grey state
            updateFileList();
        }
    }

    // ===================================================================
    // EVENT HANDLERS
    // ===================================================================
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    function highlight() {
        if (elements && elements.dropZone) {
            elements.dropZone.classList.add('drag-over');
        }
    }

    function unhighlight() {
        if (elements && elements.dropZone) {
            elements.dropZone.classList.remove('drag-over');
        }
    }

    function handleDrop(e) {
        const files = Array.from(e.dataTransfer.files);
        files.forEach(file => handleFile(file));
    }

    function handleFileSelect(e) {
        const files = Array.from(e.target.files);
        files.forEach(file => handleFile(file));
        elements.fileInput.value = '';
    }

    function setupEventListeners() {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            elements.dropZone.addEventListener(eventName, preventDefaults);
        });

        ['dragenter', 'dragover'].forEach(eventName => {
            elements.dropZone.addEventListener(eventName, highlight);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            elements.dropZone.addEventListener(eventName, unhighlight);
        });

        elements.dropZone.addEventListener('drop', handleDrop);
        elements.dropZone.addEventListener('click', () => elements.fileInput.click());
        elements.fileInput.addEventListener('change', handleFileSelect);
        
        if (elements.confirmButton) {
            elements.confirmButton.addEventListener('click', createJob);
        }
    }

    // ===================================================================
    // INITIALIZATION
    // ===================================================================
    function initializeElements() {
        elements = {
            dropZone: document.getElementById('drop-zone'),
            fileInput: document.getElementById('fileInput'),
            status: document.getElementById('status'),
            infoDisplay: document.getElementById('info-display'),
            fileList: document.getElementById('file-list'),
            waitingMessages: document.getElementById('waiting-messages'),
            confirmButton: document.getElementById('confirm-button'),
            uploadCard: document.getElementById('upload-card')
        };
        return true;
    }

    function insertUploadSection() {
        const uploadSection = document.getElementById('upload-section');
        if (!uploadSection || uploadSection.innerHTML.trim() !== '') {
            return true;
        }

        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = createUploadSectionHTML();
        const newSection = tempDiv.firstElementChild;
        uploadSection.replaceWith(newSection);
        return true;
    }

    // ===================================================================
    // STATUS DISPLAY
    // ===================================================================
    function clearStatus() {
        if (elements && elements.status) {
            elements.status.style.display = 'none';
            elements.status.innerHTML = '';
            elements.status.className = 'status';
        }
    }

    function showStatus(message, type) {
        if (elements && elements.status) {
            const htmlMessage = message.replace(/\n/g, '<br>');
            elements.status.innerHTML = htmlMessage;
            elements.status.style.display = 'block';
            elements.status.className = 'status' + (type ? ` ${type}` : '');
        }
        if (externalStatusCallback) {
            externalStatusCallback(message, type);
        }
    }

    // ===================================================================
    // PUBLIC API
    // ===================================================================
    return {
        initialize(dependencies) {
            API = dependencies.API;
            fetchJobs = dependencies.fetchJobs;
            externalStatusCallback = dependencies.showStatus || null;

            if (!insertUploadSection()) {
                return false;
            }
            if (!initializeElements()) {
                return false;
            }
            setupEventListeners();
            return true;
        },

        isInitialized() {
            return API !== null && elements !== null && fetchJobs !== null;
        },

        updateFileStatuses: updateFileList
    };

    // ===================================================================
    // HTML TEMPLATE
    // ===================================================================
    function createUploadSectionHTML() {
        return `
            <section id="upload-section">
                <h2>Add New Job</h2>
                <div id="drop-zone" class="drop-zone">
                    Drag and drop files here or click to browse
                    <input type="file" id="fileInput" hidden multiple>
                </div>
                <div id="upload-card" class="job-item" style="display: none; margin-top: 10px; padding-bottom: 10px;">
                    <div id="info-display" class="job-spec" style="display: none; margin-top: 10px;"></div>
                    <div id="file-list" style="margin-top: 10px; min-height: 20px;"></div>
                    <div id="waiting-messages" style="margin-top: 8px;"></div>
                    <div class="job-actions">
                        <button id="confirm-button" class="btn-confirm" style="display: none;">Confirm</button>
                    </div>
                </div>
                <div id="status" class="status" style="display: none;"></div>
            </section>
        `;
    }
})();

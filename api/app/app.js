// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyCDqqYmJkRvm0nnDCSyw1YQGYeyj__YF68",
    authDomain: "mps-andromeda.firebaseapp.com",
    projectId: "mps-andromeda",
    storageBucket: "mps-andromeda.appspot.com",
    messagingSenderId: "691275468466",
    appId: "1:691275468466:web:67237ada893bfa8cde83ab"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const storage = firebase.storage();
const functions = firebase.functions();

// Constants
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const EMULATOR_BASE = 'http://localhost:5001/mps-andromeda/us-central1';

// Connect to emulators if running locally
if (IS_LOCAL) {
    console.log('Running locally - connecting to Firebase emulators...');
    functions.useEmulator('localhost', 5001);
    storage.useEmulator('localhost', 9199);
    console.log('Connected to Functions emulator on localhost:5001');
    console.log('Connected to Storage emulator on localhost:9199');
} else {
    console.log('Running in production mode');
}

const API = {
    UPLOAD: IS_LOCAL
        ? `${EMULATOR_BASE}/uploadJobSpec`
        : 'https://uploadjobspec-poloq3qrtq-uc.a.run.app',
    CONFIRM: IS_LOCAL
        ? `${EMULATOR_BASE}/confirmJob`
        : 'https://confirmjob-poloq3qrtq-uc.a.run.app',
    DELETE: IS_LOCAL
        ? `${EMULATOR_BASE}/deleteJob`
        : 'https://deletejob-poloq3qrtq-uc.a.run.app',
    JOBS: {
        PENDING_RUNNING: IS_LOCAL
            ? `${EMULATOR_BASE}/listPendingJobs`
            : 'https://listpendingjobs-poloq3qrtq-uc.a.run.app',
        COMPLETED: IS_LOCAL
            ? `${EMULATOR_BASE}/listCompletedJobs`
            : 'https://listcompletedjobs-poloq3qrtq-uc.a.run.app'
    },
    FILE: IS_LOCAL
        ? `${EMULATOR_BASE}/getJobFile`
        : 'https://getjobfile-poloq3qrtq-uc.a.run.app'
};

console.log('API URLs configured:', API);

const REFRESH_INTERVAL = 300000; // 300 seconds
const COMPLETED_JOBS_LIMIT = 75;

// DOM Elements
const elements = {
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('fileInput'),
    status: document.getElementById('status'),
    completedJobsSubtitle: document.getElementById('completed-jobs-subtitle'),
    configStatus: document.getElementById('config-status'),
    xyzStatus: document.getElementById('xyz-status')
};

// File upload state
const fileState = {
    config: null, // { filename, content }
    xyzFiles: []  // Array of { filename, content }
};

// Flag to prevent concurrent uploadAllJobs calls
let isUploading = false;

// Track pending file reads to avoid triggering uploadAllJobs while files are still being read
let pendingFileReads = 0;

// Event Listeners
function initializeUpload() {
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
}

// Event Handlers
function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight() {
    elements.dropZone.classList.add('drag-over');
}

function unhighlight() {
    elements.dropZone.classList.remove('drag-over');
}

function handleDrop(e) {
    const files = Array.from(e.dataTransfer.files);
    files.forEach(file => handleFile(file));
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    files.forEach(file => handleFile(file));
    // Reset input to allow selecting same files again
    elements.fileInput.value = '';
}

// File Processing
function handleFile(file) {
    const filename = file.name.toLowerCase();
    
    if (filename.endsWith('.cfg')) {
        handleConfigFile(file);
    } else if (filename.endsWith('.xyz')) {
        handleXYZFile(file);
    } else {
        showStatus('Please upload .cfg or .xyz files only', 'error');
        return;
    }
}

function handleConfigFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        const wasOverwrite = fileState.config !== null;
        const hadXYZFiles = fileState.xyzFiles.length > 0;
        
        fileState.config = {
            filename: file.name,
            content: btoa(content)
        };
        
        elements.configStatus.textContent = `✓ Config file: ${file.name}${wasOverwrite ? ' (overwritten)' : ''}`;
        elements.configStatus.style.color = '#28a745';
        
        // If config is uploaded and we have XYZ files, create jobs for all of them
        if (hadXYZFiles && !isUploading) {
            uploadAllJobs();
        }
    };
    reader.onerror = () => {
        showStatus('Error reading config file', 'error');
    };
    reader.readAsText(file);
}

function handleXYZFile(file) {
    pendingFileReads++;
    const reader = new FileReader();
    reader.onload = (e) => {
        const content = e.target.result;
        const xyzFile = {
            filename: file.name,
            content: btoa(content)
        };
        
        // Add to array (allow duplicates for now, user can upload same file multiple times)
        fileState.xyzFiles.push(xyzFile);
        
        updateXYZStatus();
        
        pendingFileReads--;
        
        // If config exists and we're not already uploading, and no files are still being read
        if (fileState.config && !isUploading && pendingFileReads === 0) {
            uploadAllJobs();
        }
    };
    reader.onerror = () => {
        pendingFileReads--;
        showStatus('Error reading geometry file', 'error');
    };
    reader.readAsText(file);
}

function updateXYZStatus() {
    const count = fileState.xyzFiles.length;
    if (count === 0) {
        elements.xyzStatus.textContent = 'Waiting for geometry files (.xyz)...';
        elements.xyzStatus.style.color = '#666';
    } else {
        const fileNames = fileState.xyzFiles.map(f => f.filename).join(', ');
        const statusText = fileState.config ? ' (jobs created)' : '';
        elements.xyzStatus.textContent = `✓ ${fileNames}${statusText}`;
        elements.xyzStatus.style.color = fileState.config ? '#28a745' : '#ffc107';
    }
}

async function uploadSingleJob(xyzFile, removeFromArray = true, batchTimestamp = null, batchIndex = null) {
    if (!fileState.config) {
        return;
    }

    try {
        showStatus(`Uploading job for ${xyzFile.filename}...`, '');
        const response = await fetch(API.UPLOAD, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                configFilename: fileState.config.filename,
                configContent: fileState.config.content,
                xyzFilename: xyzFile.filename,
                xyzContent: xyzFile.content,
                batchTimestamp: batchTimestamp,
                batchIndex: batchIndex
            })
        });

        const data = await response.json();
        
        if (!response.ok) throw new Error(data.message || 'Upload failed');
        
        // Remove uploaded file from array if requested (only used internally by uploadAllJobs)
        if (removeFromArray) {
            const index = fileState.xyzFiles.findIndex(f => f.filename === xyzFile.filename && f.content === xyzFile.content);
            if (index > -1) {
                fileState.xyzFiles.splice(index, 1);
                updateXYZStatus();
            }
        }
        
        fetchJobs();
        
        // Return job info for batch processing
        return {
            jobFolder: data.jobFolder,
            xyzFilename: data.xyzFilename
        };
    } catch (error) {
        showStatus(`Error uploading ${xyzFile.filename}: ${error.message}`, 'error');
        throw error; // Re-throw so uploadAllJobs can handle it
    }
}

async function uploadAllJobs() {
    // Prevent concurrent calls
    if (isUploading) {
        return;
    }
    
    if (!fileState.config || fileState.xyzFiles.length === 0) {
        return;
    }

    isUploading = true;

    try {
        // Create a copy of the array to avoid issues while iterating
        const xyzFilesToUpload = [...fileState.xyzFiles];
        
        // Clear the array immediately to prevent duplicate uploads
        fileState.xyzFiles = [];
        updateXYZStatus();
        
        // Generate shared batch timestamp for all jobs in this batch
        const batchTimestamp = new Date().toISOString()
            .replace(/[^0-9]/g, "") // Remove non-digits
            .slice(0, 12); // Take first 12 digits
        
        // Upload all jobs sequentially with batch index
        const createdJobs = [];
        let failCount = 0;
        let batchIndex = 1;
        
        for (const xyzFile of xyzFilesToUpload) {
            try {
                const indexStr = batchIndex.toString().padStart(2, "0"); // 01, 02, etc.
                console.log(`Uploading job ${indexStr} of batch ${batchTimestamp} for ${xyzFile.filename}`);
                const jobInfo = await uploadSingleJob(xyzFile, false, batchTimestamp, indexStr);
                if (jobInfo) {
                    createdJobs.push(jobInfo);
                }
                batchIndex++;
                // Small delay between uploads to avoid overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                failCount++;
                batchIndex++; // Still increment index even on failure
                // Continue with next file even if one fails
            }
        }
        
        // Reset config file after jobs are created
        fileState.config = null;
        elements.configStatus.textContent = 'Waiting for config file (.cfg)...';
        elements.configStatus.style.color = '#666';
        
        // Show summary with individual job messages
        if (createdJobs.length > 0 && failCount === 0) {
            const jobMessages = createdJobs.map(job => 
                `Successfully created draft ${job.jobFolder}/${job.xyzFilename}`
            ).join('\n');
            showStatus(jobMessages, 'success');
        } else if (createdJobs.length > 0 && failCount > 0) {
            const jobMessages = createdJobs.map(job => 
                `Successfully created draft ${job.jobFolder}/${job.xyzFilename}`
            ).join('\n');
            showStatus(`${jobMessages}\n${failCount} job${failCount > 1 ? 's' : ''} failed`, 'error');
        } else {
            showStatus(`Failed to upload ${failCount} job${failCount > 1 ? 's' : ''}`, 'error');
        }
    } finally {
        // Always reset upload flag, even if there's an error
        isUploading = false;
    }
}

function resetFileState() {
    fileState.config = null;
    fileState.xyzFiles = [];
    elements.configStatus.textContent = 'Waiting for config file (.cfg)...';
    elements.configStatus.style.color = '#666';
    elements.xyzStatus.textContent = 'Waiting for geometry files (.xyz)...';
    elements.xyzStatus.style.color = '#666';
}

// URL Helpers
function getFileUrl(filename, type) {
    return `${API.FILE}?filename=${encodeURIComponent(filename)}&type=${type}`;
}

function getDownloadLinks(job, isComplete) {
    const baseFilename = job.filename.replace('.in', '');
    const type = isComplete ? 'result' : 'spec';
    
    const links = [];
    
    if (isComplete) {
        links.push({
            url: getFileUrl(baseFilename + '.out', type),
            text: 'Output'
        });

        if (job?.jobSpec && job?.jobSpec.toUpperCase().includes('EXPORT=MOLDEN')) {
            links.push({
                url: getFileUrl(baseFilename + '.molden', type),
                text: 'Molden'
            });
        }

        if (job?.optimizedGeometrySaved === 'true') {
            links.push({
                url: getFileUrl(baseFilename + '.xyz', type),
                text: 'Optimized XYZ'
            });
        }
    } else if (job.status === 'RUNNING') {
        links.push({
            url: getFileUrl(baseFilename + '.out', 'result'), // exception for the running job
            text: 'Pending Output'
        });

    }

    return links;
}

// Jobs Management
async function fetchJobs() {
    try {
        // Fetch pending and running jobs
        const pendingResponse = await fetch(API.JOBS.PENDING_RUNNING);
        if (!pendingResponse.ok) throw new Error('Failed to fetch pending/running jobs');
        const activeJobs = await pendingResponse.json();
        
        // Backend already deduplicates jobs, so we can use them directly
        // Separate jobs by status
        const drafts = activeJobs.filter(job => job.status === 'DRAFT');
        const pending = activeJobs.filter(job => job.status === 'PENDING');
        const running = activeJobs.filter(job => job.status === 'RUNNING');
        
        updateJobsList('draft-jobs', drafts, false, true);
        updateJobsList('pending-jobs', pending);
        updateJobsList('running-jobs', running);

        // Fetch completed jobs
        const completedResponse = await fetch(`${API.JOBS.COMPLETED}?limit=${COMPLETED_JOBS_LIMIT}`);
        if (!completedResponse.ok) throw new Error('Failed to fetch completed jobs');
        const completed = await completedResponse.json();
        
        updateJobsList('completed-jobs', completed, true);
    } catch (error) {
        console.error('Error fetching jobs:', error);
    }
}

const confirmingJobs = new Set();

async function confirmJob(jobFolder, filename) {
    const jobKey = `${jobFolder}/${filename}`;
    
    if (confirmingJobs.has(jobKey)) {
        return;
    }
    
    confirmingJobs.add(jobKey);
    
    try {
        showStatus('Confirming job...', '');
        const response = await fetch(API.CONFIRM, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jobFolder: jobFolder,
                filename: filename
            })
        });

        const data = await response.json();
        
        if (!response.ok) throw new Error(data.message || 'Confirm failed');
        
        showStatus('Job confirmed successfully', 'success');
        // Small delay to ensure status update propagates before refreshing
        setTimeout(() => {
            fetchJobs(); // Refresh job list
        }, 500);
    } catch (error) {
        showStatus(`Error confirming job: ${error.message}`, 'error');
    } finally {
        confirmingJobs.delete(jobKey);
    }
}

// Make confirmJob globally accessible for onclick handlers
window.confirmJob = confirmJob;

const deletingJobs = new Set();

async function deleteJob(jobFolder, filename, skipConfirmation = false) {
    const displayPath = `${jobFolder}/${filename}`;
    const jobKey = `${jobFolder}/${filename}`;
    
    if (deletingJobs.has(jobKey)) {
        return;
    }
    
    if (!skipConfirmation && !confirm(`Are you sure you want to delete ${displayPath}?`)) {
        return;
    }
    
    deletingJobs.add(jobKey);
    
    try {
        showStatus('Deleting job...', '');
        const response = await fetch(API.DELETE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jobFolder: jobFolder,
                filename: filename
            })
        });

        const data = await response.json();
        
        if (!response.ok) throw new Error(data.message || 'Delete failed');
        
        showStatus('Job deleted successfully', 'success');
        setTimeout(() => {
            fetchJobs(); // Refresh job list
        }, 500);
    } catch (error) {
        showStatus(`Error deleting job: ${error.message}`, 'error');
    } finally {
        deletingJobs.delete(jobKey);
    }
}

async function cancelJob(jobFolder, filename) {
    await deleteJob(jobFolder, filename, true);
}

// Make deleteJob and cancelJob globally accessible for onclick handlers
window.deleteJob = deleteJob;
window.cancelJob = cancelJob;

function updateJobsList(sectionId, jobs, isCompleted = false, isDraft = false) {
    const section = document.getElementById(sectionId);
    const list = section.querySelector('.jobs-list');
    
    if (jobs.length === 0) {
        list.innerHTML = '<div class="no-jobs">No jobs</div>';
        return;
    }

    list.innerHTML = jobs.map(job => {
        const links = getDownloadLinks(job, isCompleted);
        const linksHtml = links.map(link => 
            `<a href="${link.url}" download target="_blank">${link.text}</a>`
        ).join('');

        // Build file path for folder-based jobs
        const filePath = job.jobFolder ? `${job.jobFolder}/${job.filename}` : job.filename;
        const fileUrl = getFileUrl(filePath, isCompleted ? 'result' : 'spec');

        return `
            <div class="job-item">
                <div class="job-filename">
                    
                    <a href="${fileUrl}" class="filename-link">${job.jobFolder ? `${job.jobFolder}/${job.filename}` : job.filename}</a>
                    
                    ${isCompleted && job?.normalTermination ?
                        job.normalTermination === 'true' ?  
                            `<span class="normal-termination true">&#10004; successful run</span>` :
                            `<span class="normal-termination false">&#9888; aborted run</span>` : ''
                    }

                    ${isCompleted && job?.normalTermination && job.normalTermination === 'false' ?
                        job?.lastOutputLine?.includes("Error Termination.") ?
                            `<div class="error-termination-reason">${job.lastOutputLine}</div>` :
                            `<div class="error-termination-reason">Unknown Termination Reason.</div>` : ''
                    }
                </div>
                
                <div class="job-time">
                    Status: <strong>${job.status}</strong>
                    ${job?.submitTime ? `<br>Submitted: ${new Date(job.submitTime).toLocaleString()}` : ''}    
                    ${!isCompleted && job?.startTime ? `<br>Started: ${new Date(job.startTime).toLocaleString()}` : ''}
                    ${isCompleted && job?.completionTime ? `&emsp; Completed: ${new Date(job.completionTime).toLocaleString()}` : ''}

                    ${!isCompleted && job?.lastUpdate ? `<br>Last updated: ${new Date(job.lastUpdate).toLocaleString()}` : ''}

                    ${(!isCompleted && job?.startTime && job?.lastUpdate) ? `<br>Run duration: 
                        ${luxon.Duration
                            .fromMillis(new Date(job.lastUpdate).getTime() - new Date(job.startTime).getTime())
                            .toFormat("d 'days' h 'hrs' m 'mins'")}` : ''}
                    
                </div>

                ${isDraft ? `
                <div class="job-actions">
                    <button class="btn-confirm" onclick='confirmJob(${JSON.stringify(job.jobFolder)}, ${JSON.stringify(job.filename)})'>Confirm</button>
                    <button class="btn-delete" onclick='cancelJob(${JSON.stringify(job.jobFolder)}, ${JSON.stringify(job.filename)})'>Cancel</button>
                </div>
                ` : ''}
                
                ${!isCompleted && !isDraft && job.status === 'PENDING' ? `
                <div class="job-actions">
                    <button class="btn-delete" onclick='deleteJob(${JSON.stringify(job.jobFolder)}, ${JSON.stringify(job.filename)})'>Delete</button>
                </div>
                ` : ''}

                ${job?.jobSpec ? 
                    `<div class="job-spec">${job.jobSpec}
                        ${isCompleted ? `
                            <button title="Copy to clipboard" class="btn-clipboard" onclick="(async () => await navigator.clipboard.writeText(\`${job.filename}, ${job.jobSpec.trim()}, ${job?.totalAtomNumber || ''}, ${job?.numberElectrons || ''}, ${job?.numberAlphaElectrons || ''}, ${job?.numberBetaElectrons || ''}, ${job?.minimizedEnergy || ''}, ${job?.totalTime || ''}\`))()">
                                <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAAACXBIWXMAAAsTAAALEwEAmpwYAAAALElEQVR4nGNgIAuknfmPF2MArIL4QBpUA9E2pSFpIGTosNEAA2RpICkCiQAAL4ZePPv+G+QAAAAASUVORK5CYII=" alt="copy">
                            </button>
                         `: ''
                        }
                    </div>` 
                    : ''
                }
                <div class="job-results">
                    ${job?.totalAtomNumber ? `TOTAL ATOM NUMBER: ${job.totalAtomNumber}` : ''}
                    ${job?.numberElectrons ? `<br>NUMBER OF ELECTRONS: ${job.numberElectrons}` : ''}
                    ${job?.numberAlphaElectrons ? `<br>NUMBER OF ALPHA ELECTRONS: ${job.numberAlphaElectrons}` : ''}
                    ${job?.numberBetaElectrons ? `<br>NUMBER OF BETA ELECTRONS: ${job.numberBetaElectrons}` : ''}
                    ${job?.minimizedEnergy ? `<br>MINIMIZED ENERGY: ${job.minimizedEnergy}` : ''}
                    ${job?.totalTime ? `<br>TOTAL TIME: ${job.totalTime}` : ''}
                </div>

                <div class="job-files">${linksHtml}</div>
            </div>
        `;
    }).join('');
}

// UI Updates
function showStatus(message, type) {
    // Replace newlines with <br> tags for proper display
    const htmlMessage = message.replace(/\n/g, '<br>');
    elements.status.innerHTML = htmlMessage;
    elements.status.style.display = 'block';
    elements.status.className = 'status' + (type ? ` ${type}` : '');
}

function startPolling() {
    // Show sections
    document.getElementById('draft-jobs').hidden = false;
    document.getElementById('pending-jobs').hidden = false;
    document.getElementById('running-jobs').hidden = false;
    document.getElementById('completed-jobs').hidden = false;
    
    // Initial fetch
    fetchJobs();
    
    // Start polling
    setInterval(fetchJobs, REFRESH_INTERVAL);
}

// Authentication Functions
function showAuthError(message) {
    const errorElement = document.getElementById('auth-error');
    errorElement.textContent = message;
}

function clearAuthError() {
    const errorElement = document.getElementById('auth-error');
    errorElement.textContent = '';
}

function showResetMessage(message, isSuccess) {
    const messageElement = document.getElementById('reset-message');
    messageElement.textContent = message;
    messageElement.className = 'reset-message ' + (isSuccess ? 'success' : 'error');
}

function clearResetMessage() {
    const messageElement = document.getElementById('reset-message');
    messageElement.textContent = '';
    messageElement.className = 'reset-message';
}

function showResetModal() {
    document.getElementById('reset-modal').style.display = 'flex';
    document.getElementById('reset-email').value = '';
    clearResetMessage();
}

function hideResetModal() {
    document.getElementById('reset-modal').style.display = 'none';
}

async function handlePasswordReset(email) {
    const resetBtn = document.getElementById('reset-btn');
    try {
        resetBtn.disabled = true;
        resetBtn.textContent = 'Sending...';
        clearResetMessage();

        // Configure action code settings to redirect back to the app
        const actionCodeSettings = {
            url: window.location.origin, // Redirect back to your app after reset
            handleCodeInApp: false
        };

        await auth.sendPasswordResetEmail(email, actionCodeSettings);

        showResetMessage('Password reset link sent! Check your email.', true);
        resetBtn.textContent = 'Send Reset Link';

        // Close modal after 2 seconds
        setTimeout(() => {
            hideResetModal();
            resetBtn.disabled = false;
        }, 2000);
    } catch (error) {
        console.error('Password reset error:', error);
        let errorMessage = 'Failed to send reset email. Please try again.';

        if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address.';
        } else if (error.code === 'auth/user-not-found') {
            errorMessage = 'No account found with this email.';
        }

        showResetMessage(errorMessage, false);
        resetBtn.disabled = false;
        resetBtn.textContent = 'Send Reset Link';
    }
}

async function handleLogin(email, password) {
    const loginBtn = document.getElementById('login-btn');
    try {
        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing in...';
        clearAuthError();

        await auth.signInWithEmailAndPassword(email, password);
        // User signed in - onAuthStateChanged will handle UI updates
    } catch (error) {
        console.error('Login error:', error);
        let errorMessage = 'Failed to sign in. Please try again.';

        if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address.';
        } else if (error.code === 'auth/user-not-found') {
            errorMessage = 'No account found with this email.';
        } else if (error.code === 'auth/wrong-password') {
            errorMessage = 'Incorrect password.';
        } else if (error.code === 'auth/invalid-credential') {
            errorMessage = 'Invalid email or password.';
        }

        showAuthError(errorMessage);
        loginBtn.disabled = false;
        loginBtn.textContent = 'Sign In';
    }
}

async function handleSignOut() {
    try {
        await auth.signOut();
        // onAuthStateChanged will handle UI updates
    } catch (error) {
        console.error('Sign out error:', error);
        alert('Failed to sign out. Please try again.');
    }
}

function showAuthUI() {
    document.getElementById('auth-container').style.display = 'flex';
    document.querySelector('main').style.display = 'none';

    // Reset login form state
    const loginBtn = document.getElementById('login-btn');
    loginBtn.disabled = false;
    loginBtn.textContent = 'Sign In';
    document.getElementById('login-form').reset();
    clearAuthError();
}

function showAppUI(user) {
    document.getElementById('auth-container').style.display = 'none';
    document.querySelector('main').style.display = 'block';
    document.getElementById('user-email').textContent = user.email;
}

// Authentication State Observer
auth.onAuthStateChanged((user) => {
    if (user) {
        // User is signed in
        console.log('User signed in:', user.email);
        showAppUI(user);

        // Initialize app only when authenticated
        if (!window.appInitialized) {
            initializeUpload();
            startPolling();
            elements.completedJobsSubtitle.textContent = `(last ${COMPLETED_JOBS_LIMIT} only)`;
            window.appInitialized = true;
        }
    } else {
        // User is signed out
        console.log('User signed out');
        showAuthUI();
        window.appInitialized = false;
    }
});

// document onload event handler
document.addEventListener('DOMContentLoaded', () => {
    // Set up login form handler
    document.getElementById('login-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        handleLogin(email, password);
    });

    // Set up sign out button handler
    document.getElementById('signout-btn').addEventListener('click', handleSignOut);

    // Set up forgot password link handler
    document.getElementById('forgot-password-link').addEventListener('click', (e) => {
        e.preventDefault();
        showResetModal();
    });

    // Set up password reset form handler
    document.getElementById('reset-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('reset-email').value;
        handlePasswordReset(email);
    });

    // Set up cancel reset button handler
    document.getElementById('cancel-reset-btn').addEventListener('click', () => {
        hideResetModal();
    });

    // Close modal when clicking outside
    document.getElementById('reset-modal').addEventListener('click', (e) => {
        if (e.target.id === 'reset-modal') {
            hideResetModal();
        }
    });

    // Auth state will be handled by onAuthStateChanged
});

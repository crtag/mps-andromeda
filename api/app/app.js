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
    DELETE: IS_LOCAL
        ? `${EMULATOR_BASE}/deleteJob`
        : 'https://deletejob-poloq3qrtq-uc.a.run.app',
    JOBS: {
        PENDING_DRAFT: IS_LOCAL
            ? `${EMULATOR_BASE}/listPendingJobs`
            : 'https://listpendingjobs-poloq3qrtq-uc.a.run.app',
        COMPLETED_RUNNING: IS_LOCAL
            ? `${EMULATOR_BASE}/listCompletedJobs`
            : 'https://listcompletedjobs-poloq3qrtq-uc.a.run.app'
    },
    FILE: IS_LOCAL
        ? `${EMULATOR_BASE}/getJobFile`
        : 'https://getjobfile-poloq3qrtq-uc.a.run.app',
    DOWNLOAD_FOLDER: IS_LOCAL
        ? `${EMULATOR_BASE}/downloadJobFolder`
        : 'https://downloadjobfolder-poloq3qrtq-uc.a.run.app'
};

console.log('API URLs configured:', API);

const REFRESH_INTERVAL = 300000; // 300 seconds
const COMPLETED_JOBS_LIMIT = 75;

// File extensions that should be viewed (not downloaded)
const VIEW_FILE_EXTENSIONS = ['xyz', 'cfg', 'log', 'out', 'json'];

// DOM Elements
const elements = {
    completedJobsSubtitle: null,
    status: null
};

// Initialize Upload Module
function initializeUpload() {
    if (!UploadModule.initialize({
        API,
        showStatus,
        fetchJobs
    })) {
        console.error('Failed to initialize upload module');
        return;
    }

    if (!elements.completedJobsSubtitle) {
        elements.completedJobsSubtitle = document.getElementById('completed-jobs-subtitle');
    }
}

// URL Helpers
function getFileUrl(filename, type, view = false) {
    const viewParam = view ? '&view=true' : '';
    return `${API.FILE}?filename=${encodeURIComponent(filename)}&type=${type}${viewParam}`;
}

function shouldViewFile(filename) {
    const extension = filename.split('.').pop()?.toLowerCase();
    return VIEW_FILE_EXTENSIONS.includes(extension);
}

function getDownloadLinks(job, isComplete) {
    const baseFilename = job.filename.replace('.in', '');
    const type = isComplete ? 'result' : 'spec';
    
    const oldStuff = !job.jobFolder;
    const inputLinks = [];
    const outputLinks = [];

    if (oldStuff) {
        if (isComplete) {
            const outFilename = baseFilename + '.out';
            const viewOut = shouldViewFile(outFilename);
            outputLinks.push({
                url: getFileUrl(outFilename, type, viewOut),
                text: 'Output',
                download: viewOut ? null : outFilename
            });
            if (job?.jobSpec && job?.jobSpec.toUpperCase().includes('EXPORT=MOLDEN')) {
                const moldenFilename = baseFilename + '.molden';
                const viewMolden = shouldViewFile(moldenFilename);
                outputLinks.push({
                    url: getFileUrl(moldenFilename, type, viewMolden),
                    text: 'Molden',
                    download: viewMolden ? null : moldenFilename
                });
            }
            if (job?.optimizedGeometrySaved === 'true') {
                const xyzFilename = baseFilename + '.xyz';
                const viewXyz = shouldViewFile(xyzFilename);
                outputLinks.push({
                    url: getFileUrl(xyzFilename, type, viewXyz),
                    text: 'Optimized XYZ',
                    download: viewXyz ? null : xyzFilename
                });
            }
        } else if (job.status === 'RUNNING') {
            const outFilename = baseFilename + '.out';
            const viewOut = shouldViewFile(outFilename);
            outputLinks.push({
                url: getFileUrl(outFilename, 'result', viewOut),
                text: 'Pending Output',
                download: viewOut ? null : outFilename
            });
        }
    } else {
        if (job.inputFiles && Array.isArray(job.inputFiles)) {
            job.inputFiles.forEach(filename => {
                const filePath = job.jobFolder ? `${job.jobFolder}/${filename}` : filename;
                const fileType = isComplete ? 'result' : 'spec';
                const view = shouldViewFile(filename);
                inputLinks.push({
                    url: getFileUrl(filePath, fileType, view),
                    text: filename,
                    download: view ? null : filename
                });
            });
        }
        if (job.outputFiles && Array.isArray(job.outputFiles)) {
            job.outputFiles.forEach(filename => {
                const filePath = job.jobFolder ? `${job.jobFolder}/${filename}` : filename;
                const fileType = 'result';
                const view = shouldViewFile(filename);
                outputLinks.push({
                    url: getFileUrl(filePath, fileType, view),
                    text: filename,
                    download: view ? null : filename
                });
            });
        }
    }

    return { inputLinks, outputLinks };
}

// Jobs Management
async function fetchJobs() {
    try {
        // Fetch pending jobs
        const pendingResponse = await fetch(API.JOBS.PENDING_DRAFT);
        if (!pendingResponse.ok) throw new Error('Failed to fetch pending jobs');
        const notStartedJobs = await pendingResponse.json();
        
        // Filter only PENDING jobs
        const pending = notStartedJobs.filter(job => job.status === 'PENDING');
        updateJobsList('pending-jobs', pending);

        // Fetch completed and running jobs
        const resultsResponse = await fetch(`${API.JOBS.COMPLETED_RUNNING}?limit=${COMPLETED_JOBS_LIMIT}`);
        if (!resultsResponse.ok) throw new Error('Failed to fetch completed/running jobs');
        const jobsWithResults = await resultsResponse.json();
        const completed = jobsWithResults.filter(job => job.status != 'RUNNING');
        const running = jobsWithResults.filter(job => job.status === 'RUNNING');

        updateJobsList('running-jobs', running);
        updateJobsList('completed-jobs', completed, true);
    } catch (error) {
        console.error('Error fetching jobs:', error);
    }
}


const deletingJobs = new Set();

async function deleteJob(jobFolder, filename, skipConfirmation = false) {
    const displayPath = `${jobFolder}/${filename}`;  
    if (!skipConfirmation && !confirm(`Are you sure you want to delete ${displayPath}?`)) {
        return;
    }
    
    deletingJobs.add(displayPath);
    try {
        showStatus('Deleting job...', '');
        const response = await fetch(API.DELETE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                jobFolder: jobFolder,
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
        deletingJobs.delete(displayPath);
    }
}

async function cancelJob(jobFolder, filename) {
    await deleteJob(jobFolder, filename, true);
}

// Make deleteJob and cancelJob globally accessible for onclick handlers
window.deleteJob = deleteJob;
window.cancelJob = cancelJob;

function updateJobsList(sectionId, jobs, isCompleted = false) {
    const section = document.getElementById(sectionId);
    const list = section.querySelector('.jobs-list');
    
    if (jobs.length === 0) {
        list.innerHTML = '<div class="no-jobs">No jobs</div>';
        return;
    }

    list.innerHTML = jobs.map(job => {
        const { inputLinks, outputLinks } = getDownloadLinks(job, isCompleted);
        const inputLinksHtml = inputLinks.map(link => 
            link.download 
                ? `<a href="${link.url}" download="${link.download}" target="_blank">${link.text}</a>`
                : `<a href="${link.url}" target="_blank">${link.text}</a>`
        ).join('');
        const outputLinksHtml = outputLinks.map(link => 
            link.download 
                ? `<a href="${link.url}" download="${link.download}" target="_blank">${link.text}</a>`
                : `<a href="${link.url}" target="_blank">${link.text}</a>`
        ).join('');

        return `
            <div class="job-item">
                <div class="job-filename">
                    ${isCompleted && job.jobFolder ? `
                        <a href="${API.DOWNLOAD_FOLDER}?jobFolder=${encodeURIComponent(job.jobFolder)}" class="btn-download-folder" title="Download folder" download="${job.jobFolder}.zip">
                            <img src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTUgMTlIMTkiIHN0cm9rZT0iIzAwNjZjYyIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPHBhdGggZD0iTTUgMTlWMTciIHN0cm9rZT0iIzAwNjZjYyIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPHBhdGggZD0iTTE5IDE5VjE3IiBzdHJva2U9IiMwMDY2Y2MiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CjxwYXRoIGQ9Ik0xMiA4VjE2IiBzdHJva2U9IiMwMDY2Y2MiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+CjxwYXRoIGQ9Ik05IDEzTDEyIDE2TDE1IDEzIiBzdHJva2U9IiMwMDY2Y2MiIHN0cm9rZS13aWR0aD0iMiIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+Cjwvc3ZnPg==" alt="download">
                        </a>
                    ` : ''}
                    ${job.jobFolder ? job.jobFolder : ''}
                    
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
                
                ${inputLinksHtml ? `<div class="job-files">${inputLinksHtml}</div>` : ''}
                
                <div class="job-time">
                    Status: <strong>${job.status}</strong>
                    ${job?.tags ? `<br>Tags: <strong>${job.tags}</strong>` : ''}
                    ${job?.submitTime ? `<br>Submitted: ${new Date(job.submitTime).toLocaleString()}` : ''}    
                    ${!isCompleted && job?.startTime ? `<br>Started: ${new Date(job.startTime).toLocaleString()}` : ''}
                    ${isCompleted && job?.completionTime ? `&emsp; Completed: ${new Date(job.completionTime).toLocaleString()}` : ''}

                    ${!isCompleted && job.status !== 'PENDING' && job?.lastUpdate ? `<br>Last updated: ${new Date(job.lastUpdate).toLocaleString()}` : ''}

                    ${(!isCompleted && job?.startTime && job?.lastUpdate) ? `<br>Run duration: 
                        ${luxon.Duration
                            .fromMillis(new Date(job.lastUpdate).getTime() - new Date(job.startTime).getTime())
                            .toFormat("d 'days' h 'hrs' m 'mins'")}` : ''}
                    
                </div>

                ${job?.jobSpec ? 
                    `<div class="job-spec">${job?.worker ? `${job.worker} ` : ''}${job.jobSpec}
                        ${isCompleted ? `
                            <button title="Copy to clipboard" class="btn-clipboard" onclick="(async () => await navigator.clipboard.writeText(\`${job.filename}, ${job.jobSpec.trim()}, ${job?.totalAtomNumber || ''}, ${job?.numberElectrons || ''}, ${job?.numberAlphaElectrons || ''}, ${job?.numberBetaElectrons || ''}, ${job?.minimizedEnergy || ''}, ${job?.totalTime || ''}\`))()">
                                <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAAACXBIWXMAAAsTAAALEwEAmpwYAAAALElEQVR4nGNgIAuknfmPF2MArIL4QBpUA9E2pSFpIGTosNEAA2RpICkCiQAAL4ZePPv+G+QAAAAASUVORK5CYII=" alt="copy">
                            </button>
                         `: ''
                        }
                    </div>` 
                    : ''
                }

                <div class="job-actions">
                    ${job.status === 'PENDING' ? `<button class="btn-delete" onclick='deleteJob(${JSON.stringify(job.jobFolder)}, ${JSON.stringify(job.filename)})'>Delete</button>` : ''}
                </div>

                <div class="job-results">
                    ${job?.totalAtomNumber ? `TOTAL ATOM NUMBER: ${job.totalAtomNumber}` : ''}
                    ${job?.numberElectrons ? `<br>NUMBER OF ELECTRONS: ${job.numberElectrons}` : ''}
                    ${job?.numberAlphaElectrons ? `<br>NUMBER OF ALPHA ELECTRONS: ${job.numberAlphaElectrons}` : ''}
                    ${job?.numberBetaElectrons ? `<br>NUMBER OF BETA ELECTRONS: ${job.numberBetaElectrons}` : ''}
                    ${job?.minimizedEnergy ? `<br>MINIMIZED ENERGY: ${job.minimizedEnergy}` : ''}
                    ${job?.totalTime ? `<br>TOTAL TIME: ${job.totalTime}` : ''}
                </div>

                ${outputLinksHtml ? `<div class="job-files">${outputLinksHtml}</div>` : ''}


            </div>
        `;
    }).join('');
}

// UI Updates
function showStatus(message, type) {
    // Replace newlines with <br> tags for proper display
    const htmlMessage = message.replace(/\n/g, '<br>');
    
    const statusElement = document.getElementById('status');
    if (statusElement) {
        statusElement.innerHTML = htmlMessage;
        statusElement.style.display = 'block';
        statusElement.className = 'status' + (type ? ` ${type}` : '');
        elements.status = statusElement;
    } else {
        console.warn('Status element not found, message:', message);
    }
}

function startPolling() {
    // Show sections
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
    
    // Ensure completedJobsSubtitle is set
    if (!elements.completedJobsSubtitle) {
        elements.completedJobsSubtitle = document.getElementById('completed-jobs-subtitle');
    }
    
    // File status messages will be initialized after UploadModule is initialized
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
            // Initialize file status messages after UploadModule is ready
            if (UploadModule.isInitialized && UploadModule.isInitialized()) {
                UploadModule.updateFileStatuses();
            }
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

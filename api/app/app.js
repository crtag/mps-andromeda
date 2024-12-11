// Constants
const API = {
    UPLOAD: 'https://uploadjobspec-poloq3qrtq-uc.a.run.app',
    JOBS: {
        PENDING_RUNNING: 'https://listpendingjobs-poloq3qrtq-uc.a.run.app',
        COMPLETED: 'https://listcompletedjobs-poloq3qrtq-uc.a.run.app'
    },
    FILE: 'https://getjobfile-poloq3qrtq-uc.a.run.app'
};

const REFRESH_INTERVAL = 300000; // 300 seconds
const COMPLETED_JOBS_LIMIT = 75;

// DOM Elements
const elements = {
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('fileInput'),
    status: document.getElementById('status'),
    completedJobsSubtitle: document.getElementById('completed-jobs-subtitle')
};

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
    const file = e.dataTransfer.files[0];
    handleFile(file);
}

function handleFileSelect(e) {
    const file = e.target.files[0];
    handleFile(file);
}

// File Processing
function handleFile(file) {
    if (!file.name.endsWith('.in')) {
        showStatus('Please upload a file with .in extension', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const content = e.target.result;
        await uploadFile(file.name, content);
    };
    reader.readAsText(file);
}

// URL Helpers
function getFileUrl(filename, type) {
    return `${API.FILE}?filename=${encodeURIComponent(filename)}&type=${type}`;
}

function getDownloadLinks(job, isComplete) {
    const baseFilename = job.filename.replace('.in', '');
    const type = isComplete ? 'result' : 'spec';
    
    const links = [];
    
    // Add output and molden links only for completed jobs
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
        
        const pending = activeJobs.filter(job => job.status === 'PENDING');
        const running = activeJobs.filter(job => job.status === 'RUNNING');
        
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

function updateJobsList(sectionId, jobs, isCompleted = false) {
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

        return `
            <div class="job-item">
                <div class="job-filename">
                    <a href="${getFileUrl(job.filename, 'spec')}" class="filename-link">${job.filename}</a>
                    
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
                    ${job?.submitTime ? `Submitted: ${new Date(job.submitTime).toLocaleString()}` : ''}    
                    ${!isCompleted && job?.startTime ? `<br>Started: ${new Date(job.startTime).toLocaleString()}` : ''}
                    ${isCompleted && job?.completionTime ? `&emsp; Completed: ${new Date(job.completionTime).toLocaleString()}` : ''}

                    ${!isCompleted && job?.lastUpdate ? `<br>Last updated: ${new Date(job.lastUpdate).toLocaleString()}` : ''}

                    ${(!isCompleted && job?.startTime && job?.lastUpdate) ? `<br>Run duration: 
                        ${luxon.Duration
                            .fromMillis(new Date(job.lastUpdate).getTime() - new Date(job.startTime).getTime())
                            .toFormat("d 'days' h 'hrs' m 'mins'")}` : ''}
                    
                </div>

                ${job?.jobSpec ? 
                    `<div class="job-spec">${job.jobSpec}
                        ${isCompleted ? `
                            <button title="Copy to clipboard: \n${job.filename}, ${job.jobSpec.trim()}, ${job?.totalAtomNumber || ''}, ${job?.minimizedEnergy || ''}, ${job?.totalTime || ''}" class="btn-clipboard" onclick="(async () => await navigator.clipboard.writeText(\`${job.filename}, ${job.jobSpec.trim()}, ${job?.totalAtomNumber || ''}, ${job?.minimizedEnergy || ''}, ${job?.totalTime || ''}\`))()">
                                <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAAACXBIWXMAAAsTAAALEwEAmpwYAAAALElEQVR4nGNgIAuknfmPF2MArIL4QBpUA9E2pSFpIGTosNEAA2RpICkCiQAAL4ZePPv+G+QAAAAASUVORK5CYII=" alt="copy">
                            </button>
                         `: ''
                        }
                    </div>` 
                    : ''
                }
                <div class="job-results">
                    ${job?.totalAtomNumber ? `TOTAL ATOM NUMBER: ${job.totalAtomNumber}` : ''}
                    ${job?.minimizedEnergy ? `<br>MINIMIZED ENERGY: ${job.minimizedEnergy}` : ''}
                    ${job?.totalTime ? `<br>TOTAL TIME: ${job.totalTime}` : ''}
                </div>

                <div class="job-files">${linksHtml}</div>
            </div>
        `;
    }).join('');
}

// API Calls
async function uploadFile(filename, content) {
    try {
        showStatus('Uploading...', '');
        const response = await fetch(API.UPLOAD, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ filename, content })
        });

        const data = await response.json();
        
        if (!response.ok) throw new Error(data.message || 'Upload failed');
        
        showStatus(`Upload successful: ${data.filename}`, 'success');
        elements.fileInput.value = '';
        fetchJobs();
    } catch (error) {
        showStatus(`Error: ${error.message}`, 'error');
    }
}

// UI Updates
function showStatus(message, type) {
    elements.status.textContent = message;
    elements.status.style.display = 'block';
    elements.status.className = 'status' + (type ? ` ${type}` : '');
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

// document onload event handler
document.addEventListener('DOMContentLoaded', () => {
    // Initialize
    initializeUpload();
    startPolling();

    // add content to completed jobs subtitle
    elements.completedJobsSubtitle.textContent = `(last ${COMPLETED_JOBS_LIMIT} only)`;
});

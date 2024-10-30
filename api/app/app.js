// Constants
const API = {
    UPLOAD: 'https://uploadjobspec-poloq3qrtq-uc.a.run.app',
    JOBS: {
        PENDING_RUNNING: 'https://listpendingjobs-poloq3qrtq-uc.a.run.app',
        COMPLETED: null
    }
};

const REFRESH_INTERVAL = 10000; // 10 seconds

// DOM Elements
const elements = {
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('fileInput'),
    status: document.getElementById('status')
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

// Jobs Management
async function fetchJobs() {
    try {
        const response = await fetch(API.JOBS.PENDING_RUNNING);
        if (!response.ok) throw new Error('Failed to fetch jobs');
        const jobs = await response.json();
        
        const pending = jobs.filter(job => job.status === 'PENDING');
        const running = jobs.filter(job => job.status === 'RUNNING');
        
        updateJobsList('pending-jobs', pending);
        updateJobsList('running-jobs', running);
    } catch (error) {
        console.error('Error fetching jobs:', error);
    }
}

function updateJobsList(sectionId, jobs) {
    const section = document.getElementById(sectionId);
    const list = section.querySelector('.jobs-list');
    
    if (jobs.length === 0) {
        list.innerHTML = '<div class="no-jobs">No jobs</div>';
        return;
    }

    list.innerHTML = jobs.map(job => `
        <div class="job-item">
            <div class="job-filename">${job.filename}</div>
            <div class="job-time">
                Submitted: ${new Date(job.submitTime).toLocaleString()}
                ${job.lastUpdate ? `<br>Updated: ${new Date(job.lastUpdate).toLocaleString()}` : ''}
            </div>
        </div>
    `).join('');
}

function startPolling() {
    // Show sections
    document.getElementById('pending-jobs').hidden = false;
    document.getElementById('running-jobs').hidden = false;
    
    // Initial fetch
    fetchJobs();
    
    // Start polling
    setInterval(fetchJobs, REFRESH_INTERVAL);
}

// Initialize
initializeUpload();
startPolling();
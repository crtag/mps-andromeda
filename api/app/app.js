// Constants
const API = {
    UPLOAD: 'https://uploadjobspec-poloq3qrtq-uc.a.run.app',
    // Placeholder for future endpoints
    JOBS: {
        PENDING: null,
        RUNNING: null,
        COMPLETED: null
    }
};

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

// Initialize
initializeUpload();
// Constants
const API = {
    UPLOAD: 'https://uploadjobspec-poloq3qrtq-uc.a.run.app',
};

// DOM Elements
const elements = {
    dropZone: document.getElementById('drop-zone'),
    fileInput: document.getElementById('file-input'),
    status: document.getElementById('status'),
    form: document.getElementById('trajectory-form'),
    directionInputs: document.getElementsByName('direction'),
    stepSizeInput: document.getElementById('step-size'),
    stepsInput: document.getElementById('steps-num'),
    steeredAtomsInput: document.getElementById('steered-atoms')
};

let jobFile = null;

// Event Listeners
function initializeHandling() {
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
    elements.form.addEventListener('submit', handleSubmit);
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

    jobFile = file;
    showStatus(`File selected: ${jobFile.name}`, 'success');
}

// Form Submission
async function handleSubmit(e) {
    e.preventDefault();

    if (!jobFile) {
        showStatus('Please select a file first', 'error');
        return;
    }

    const selectedDirection = Array.from(elements.directionInputs).find(input => input.checked);
    
    const reader = new FileReader();
    try {
        showStatus('Uploading...', '');
        
        // Read file content first
        let content = await new Promise((resolve, reject) => {
            reader.onload = e => resolve(e.target.result);
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsText(jobFile);
        });

        // safely encode the content string to be included into JSON
        content = btoa(content);

        const formData = {
            filename: `${jobFile.name}`,
            content,
            direction: selectedDirection?.value,
            stepSize: parseFloat(elements.stepSizeInput.value),
            numSteps: parseInt(elements.stepsInput.value, 10),
            steeredAtoms: elements.steeredAtomsInput.value.trim(),
        };

        console.log('Prepared job data:');
        console.log(formData);

        await uploadTrajectoryJob(formData);
        
    } catch (error) {
        showStatus(`Error: ${error.message}`, 'error');
    }
}

// API Calls
async function uploadTrajectoryJob(formData) {
    try {
        const response = await fetch(API.UPLOAD, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(formData),
        });

        const data = await response.json();
        
        if (!response.ok) throw new Error(data.message || 'Upload failed');
        
        showStatus(`Trajectory job created successfully: ${data.filename}`, 'success');
        elements.fileInput.value = '';
        jobFile = null;
        elements.form.reset();

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

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    initializeHandling();
});
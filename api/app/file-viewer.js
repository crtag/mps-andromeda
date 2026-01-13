// ============================================
// FILE VIEWER MODULE
// Handles displaying text files in a formatted view
// ============================================

const FileViewer = (function() {
    async function fetchAndDisplayFile(filename) {
        try {
            const response = await fetch(filename);
            if (!response.ok) throw new Error('Failed to load file');
            const content = await response.text();
            openFileInNewTab(filename, content);
        } catch (error) {
            console.error('Error loading file:', error);
        }
    }

    function openFileInNewTab(filename, content) {
        const escapedContent = content
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        
        const fileContentJson = JSON.stringify(content);
        const filenameJson = JSON.stringify(filename);
        
        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${filename}</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            font-family: 'Courier New', monospace;
            background-color: #f5f5f5;
        }
        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 15px;
        }
        .filename {
            font-size: 18px;
            font-weight: bold;
            color: #333;
        }
        .download-btn {
            padding: 8px 16px;
            background-color: #007bff;
            color: white;
            text-decoration: none;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            cursor: pointer;
            transition: background-color 0.2s;
        }
        .download-btn:hover {
            background-color: #0056b3;
        }
        pre {
            margin: 0;
            padding: 15px;
            background-color: white;
            border: 1px solid #ddd;
            border-radius: 4px;
            overflow-x: auto;
            white-space: pre;
        }
    </style>
    <script>
        const fileContent = ${fileContentJson};
        const fileName = ${filenameJson};
        
        function downloadFile() {
            const blob = new Blob([fileContent], { type: 'text/plain' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    </script>
</head>
<body>
    <div class="header">
        <div class="filename">${filename}</div>
        <button onclick="downloadFile()" class="download-btn">Download</button>
    </div>
    <pre>${escapedContent}</pre>
</body>
</html>`;
        
        const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
    }

    return {
        init() {
            // Use event delegation on document to handle dynamically added elements
            document.addEventListener('click', (e) => {
                if (e.target && e.target.id === 'config-link') {
                    e.preventDefault();
                    fetchAndDisplayFile('PySCF_default.cfg');
                }
            });
        }
    };
})();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => FileViewer.init());
} else {
    FileViewer.init();
}


// ============================================
// CONFIG PARSER MODULE
// Parses configuration files (.cfg) and extracts structured data
// ============================================

const ConfigReader = (function() {
    
    function parseConfig(configContent) {
        const lines = configContent.split("\n").map(line => line.trim());
        const config = {};
        
        lines.forEach(line => {
            if (!line || line.startsWith('#')) {
                return;
            }
            
            const kvMatch = line.match(/(\w+)\s*[:=]\s*(.+)/);
            if (kvMatch) {
                const key = kvMatch[1].toLowerCase();
                let value = kvMatch[2].trim();
                
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
                
                if ((value.startsWith('"') && value.endsWith('"')) || 
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.slice(1, -1);
                }
                
                config[key] = value;
            }
        });
        
        return config;
    }
    
    function getConfigInfo(configContent) {
        const parsedConfig = parseConfig(configContent);
                
        const expectedFiles = [];
        const infoParts = [];

        let worker = parsedConfig.worker?.trim();
        
        if (worker.trim().toLowerCase() === 'pyscf') {
            const task = parsedConfig.task?.trim().toUpperCase();
            const chkfile = parsedConfig.chkfile?.trim();
            if (task === 'OPTIMIZE') {
                expectedFiles.push('XYZ');
                if (chkfile) {
                    expectedFiles.push(chkfile);
                }
            }
            if (task === 'ENERGY') {
                expectedFiles.push('XYZ');
                if (chkfile) {
                    expectedFiles.push(chkfile);
                }
            }
            // Build info string
            infoParts.push('PySCF');
            infoParts.push(task);
            infoParts.push(parsedConfig?.basis);
            infoParts.push(parsedConfig?.functional);
            infoParts.push(`CHARGE=${parsedConfig?.charge ?? 0}`);
            infoParts.push(`MULTIPLICITY=${parsedConfig?.multiplicity ?? 1}`);

        } else if (worker && worker.toLowerCase() === 'quick') {
            expectedFiles.push('XYZ');
            // Use spec as info
            infoParts.push('QUICK');
            infoParts.push(parsedConfig.spec);
        } else if (worker && worker.toLowerCase() === 'uma') {
            expectedFiles.push('XYZ');
            infoParts.push('UMA');
            const task = parsedConfig.task?.trim().toUpperCase();
            if (task) infoParts.push(task);
            infoParts.push(`CHARGE=${parsedConfig?.charge ?? 0}`);
            infoParts.push(`MULTIPLICITY=${parsedConfig?.multiplicity ?? 1}`);
        } else {
            infoParts.push(`UNKNOWN_WORKER=${worker}`);
        }
        
        const info = {
            display: infoParts.join(' '),
            charge: parseInt(parsedConfig.charge, 10) || 0,
            multiplicity: parseInt(parsedConfig.multiplicity, 10) || 1,
        };

        return {
            expectedFiles,
            info
        };
    }
    
    return {
        getConfigInfo
    };
})();

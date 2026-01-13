// Column configuration for job table
// Defines display names, data types, and default visibility for all columns

const COLUMN_CONFIG = {
    // Core identifiers
    'job': {
        displayName: 'Job ID',
        type: 'string',
        visible: true,
        width: 200
    },
    'completed': {
        displayName: 'Completed',
        type: 'date',
        visible: true,
        width: 180
    },
    
    // Job specification fields
    'config': {
        displayName: 'Config',
        type: 'string',
        visible: false,
        width: 150
    },
    'xyz_file': {
        displayName: 'XYZ File',
        type: 'string',
        visible: true,
        width: 200
    },
    'charge': {
        displayName: 'Charge',
        type: 'number',
        visible: false,
        width: 80
    },
    'multiplicity': {
        displayName: 'Multiplicity',
        type: 'number',
        visible: true,
        width: 110
    },
    'task': {
        displayName: 'Task',
        type: 'string',
        visible: false,
        width: 100
    },
    'functional': {
        displayName: 'Functional',
        type: 'string',
        visible: false,
        width: 100
    },
    'basis': {
        displayName: 'Basis',
        type: 'string',
        visible: true,
        width: 120
    },
    'dispersion': {
        displayName: 'Dispersion',
        type: 'string',
        visible: false,
        width: 100
    },

    'atoms_num': {
        displayName: 'Atoms',
        type: 'number',
        visible: true,
        width: 80
    },
    'electrons_num': {
        displayName: 'Electrons',
        type: 'number',
        visible: false,
        width: 90
    },

        
    // Results - energies
    'energy': {
        displayName: 'Energy (Ha)',
        type: 'number',
        visible: true,
        width: 140
    },
    'dispersion_energy': {
        displayName: 'Dispersion Energy (Ha)',
        type: 'number',
        visible: false,
        width: 160
    },
    
    // Results - forces (geometry optimization)
    'max_force': {
        displayName: 'Max Force (Ha/Bohr)',
        type: 'number',
        visible: false,
        width: 140
    },
    'max_force_all': {
        displayName: 'Max Force all Atoms (Ha/Bohr)',
        type: 'number',
        visible: false,
        width: 200
    },
    'rms_force': {
        displayName: 'RMS Force (Ha/Bohr)',
        type: 'number',
        visible: false,
        width: 140
    },
    
    // Results - convergence and optimization
    'converged': {
        displayName: 'Converged',
        type: 'boolean',
        visible: true,
        width: 100
    },
    'step_count': {
        displayName: 'Optimization Steps',
        type: 'number',
        visible: false,
        width: 80
    },
    
    // Results - performance
    'computation_time': {
        displayName: 'Time (s)',
        type: 'number',
        visible: true,
        width: 100
    },
    //Information about the job
    'force_open_shell': {
        displayName: 'Force Open Shell',
        type: 'boolean',
        visible: false,
        width: 130
    },
    'freezexyz': {
        displayName: 'Freeze XYZ',
        type: 'string',
        visible: false,
        width: 100
    },
    'tags': {
        displayName: 'Tags',
        type: 'string',
        visible: true,
        width: 150
    },
    'comments': {
        displayName: 'Comments',
        type: 'string',
        visible: false,
        width: 250
    },
    


    
    // Error information (flattened object)
    'error': {
        displayName: 'Error',
        type: 'string',
        visible: false,
        width: 250
    },
    
    // Output files (flattened object)
    'output_files': {
        displayName: 'Output Files',
        type: 'string',
        visible: false,
        width: 250
    }
};

// Get configuration for a column, with fallback to auto-detection
function getColumnConfig(field, autoDetectedType = 'string') {
    if (COLUMN_CONFIG[field]) {
        return COLUMN_CONFIG[field];
    }
    
    // Return default config for unknown fields
    return {
        displayName: field.split('.').pop(), // Use last part of nested field name
        type: autoDetectedType,
        visible: false, // Unknown columns invisible by default
        width: null
    };
}

// Get default column order based on COLUMN_CONFIG definition order
function getDefaultColumnOrder() {
    return Object.keys(COLUMN_CONFIG);
}

// Check if a field is defined in the config
function isKnownColumn(field) {
    return COLUMN_CONFIG.hasOwnProperty(field);
}

// Export for use in Node.js or browser
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { COLUMN_CONFIG, getColumnConfig, getDefaultColumnOrder, isKnownColumn };
}


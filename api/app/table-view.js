const firebaseConfig = {
    apiKey: "AIzaSyCDqqYmJkRvm0nnDCSyw1YQGYeyj__YF68",
    authDomain: "mps-andromeda.firebaseapp.com",
    projectId: "mps-andromeda",
    storageBucket: "mps-andromeda.appspot.com",
    messagingSenderId: "691275468466",
    appId: "1:691275468466:web:67237ada893bfa8cde83ab"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();

const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const EMULATOR_BASE = 'http://localhost:5001/mps-andromeda/us-central1';

if (IS_LOCAL) {
    console.log('Running locally - connecting to Firebase emulators...');
}

const API = {
    GET_ALL_JSON: IS_LOCAL
        ? `${EMULATOR_BASE}/getAllJobJsonData`
        : 'https://getalljobjsondata-poloq3qrtq-uc.a.run.app'
};

const COLUMN_PREFERENCE_COOKIE = 'job_table_column_visibility';
const COLUMN_SORT_COOKIE = 'job_table_column_sort';
const COLUMN_ORDER_COOKIE = 'job_table_column_order';

let table = null;
let allColumns = [];
let columnVisibility = {};
let columnSort = []; // Store column sort preferences: [{field: 'fieldName', dir: 'asc'|'desc'}, ...]
let columnOrder = []; // Store column order preferences: ['field1', 'field2', ...]
let columnTypes = {}; // Store column types: 'number', 'boolean', 'string', etc.
let filterValues = {}; // Store filter values separately
let numericFilterOperators = {}; // Store operators separately for numeric filters
let originalData = []; // Store original unfiltered data
let currentLimit = 75;
let filterElements = {}; // Store references to filter elements to preserve focus

function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

function setCookie(name, value, days = 365) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

function loadColumnPreferences() {
    const saved = getCookie(COLUMN_PREFERENCE_COOKIE);
    if (saved) {
        try {
            columnVisibility = JSON.parse(saved);
        } catch (e) {
            console.warn('Failed to parse column preferences from cookie', e);
            columnVisibility = {};
        }
    }
    
    const savedSort = getCookie(COLUMN_SORT_COOKIE);
    if (savedSort) {
        try {
            columnSort = JSON.parse(savedSort);
        } catch (e) {
            console.warn('Failed to parse column sort preferences from cookie', e);
            columnSort = [];
        }
    }
    
    const savedOrder = getCookie(COLUMN_ORDER_COOKIE);
    if (savedOrder) {
        try {
            columnOrder = JSON.parse(savedOrder);
        } catch (e) {
            console.warn('Failed to parse column order preferences from cookie', e);
            columnOrder = [];
        }
    }
}

function saveColumnPreferences() {
    setCookie(COLUMN_PREFERENCE_COOKIE, JSON.stringify(columnVisibility));
}

function saveColumnSort() {
    if (table) {
        const sorters = table.getSorters();
        // Extract only field and dir from sorter objects
        columnSort = sorters.map(s => ({ field: s.field, dir: s.dir }));
        setCookie(COLUMN_SORT_COOKIE, JSON.stringify(columnSort));
    }
}

function saveColumnOrder() {
    if (table) {
        const columns = table.getColumns();
        columnOrder = columns.map(col => col.getField());
        setCookie(COLUMN_ORDER_COOKIE, JSON.stringify(columnOrder));
    }
}

function applyFilters() {
    if (!table || originalData.length === 0) {
        console.warn('applyFilters: table not ready or no data');
        return;
    }
    
    console.log('Applying filters:', filterValues);
    console.log('Original data count:', originalData.length);
    
    // Clear existing filters
    table.clearFilter();
    
    // Count active filters
    let filterCount = 0;
    
    // Add custom filters for each field with active filter
    allColumns.forEach(field => {
        const filterValue = filterValues[field];
        if (!filterValue || filterValue === '') return;
        
        filterCount++;
        const colType = columnTypes[field] || 'string';
        
        console.log(`Adding filter for ${field} (${colType}): ${filterValue}`);
        
        if (colType === 'number') {
            const operator = numericFilterOperators[field] || '=';
            const filterNum = parseFloat(filterValue);
            
            if (isNaN(filterNum)) return;
            
            // Use built-in Tabulator filter types for numbers
            table.addFilter(field, operator, filterNum);
        } else {
            // Use built-in "like" filter type for text (case-insensitive contains)
            table.addFilter(field, "like", filterValue);
        }
    });
    
    console.log(`Applied ${filterCount} filters`);
}

function getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => {
        if (current === null || current === undefined) return null;
        return current[key];
    }, obj);
}

function getColumnDefinitions(data) {
    if (!data || data.length === 0) return [];
    
    const sample = data[0];
    const columns = [];
    const processed = new Set();
    
    // Debug: log sample data to check timestamps
    console.log('Sample job data:', sample);
    
    function addColumn(field, title, formatter = null, width = null, colType = 'string') {
        if (processed.has(field)) return;
        processed.add(field);
        
        columnTypes[field] = colType;
        
        const def = {
            title: title || field,
            field: field,
            visible: columnVisibility[field] !== undefined ? columnVisibility[field] : true,
            headerSort: true,
            sorter: colType === 'number' ? 'number' : colType === 'date' ? 'date' : 'alphanum'
        };
        
        if (formatter) {
            def.formatter = formatter;
        }
        
        if (width) {
            def.width = width;
        }
        
        columns.push(def);
    }
    
    function traverse(obj, prefix = '') {
        for (const [key, value] of Object.entries(obj)) {
            const field = prefix ? `${prefix}.${key}` : key;
            
            if (value === null || value === undefined) {
                addColumn(field, key, null, null, 'string');
            } else if (Array.isArray(value)) {
                addColumn(field, key, (cell) => {
                    return Array.isArray(cell.getValue()) ? cell.getValue().join(', ') : cell.getValue();
                }, null, 'array');
            } else if (typeof value === 'object') {
                traverse(value, field);
            } else {
                if (typeof value === 'number') {
                    addColumn(field, key, null, 120, 'number');
                } else if (typeof value === 'boolean') {
                    addColumn(field, key, (cell) => {
                        const val = cell.getValue();
                        return val === true ? 'true' : val === false ? 'false' : '';
                    }, 100, 'boolean');
                } else {
                    // Check if it's a date string (ISO format)
                    if (field === 'completed' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value))) {
                        addColumn(field, key, (cell) => {
                            const val = cell.getValue();
                            if (!val) return '';
                            const date = new Date(val);
                            return isNaN(date.getTime()) ? val : date.toLocaleString();
                        }, 180, 'date');
                    } else {
                        addColumn(field, key, null, null, 'string');
                    }
                }
            }
        }
    }
    
    traverse(sample);
    
    allColumns = columns.map(col => col.field);
    
    // Apply saved column order if available
    if (columnOrder && columnOrder.length > 0) {
        // Reorder columns based on saved order
        const orderedColumns = [];
        const columnMap = new Map(columns.map(col => [col.field, col]));
        
        // Add columns in saved order (only if they exist in current data)
        columnOrder.forEach(field => {
            if (columnMap.has(field)) {
                orderedColumns.push(columnMap.get(field));
                columnMap.delete(field);
            }
        });
        
        // Add any new columns that weren't in saved order at the end
        columnMap.forEach(col => {
            orderedColumns.push(col);
        });
        
        return orderedColumns;
    }
    
    return columns;
}

function hasActiveFilter(field) {
    const filterValue = filterValues[field];
    return filterValue !== null && filterValue !== undefined && filterValue !== '';
}

function getFilterValue(field) {
    return filterValues[field] || '';
}

function setFilterValue(field, value, operator = null) {
    console.log(`setFilterValue called: field=${field}, value=${value}, operator=${operator}`);
    filterValues[field] = value || '';
    if (operator !== null && columnTypes[field] === 'number') {
        numericFilterOperators[field] = operator;
    }
    applyFilters();
    updateFilterIndicators();
}

function updateFilterIndicators() {
    // Update filter indicators without recreating the panel
    allColumns.forEach(field => {
        const row = filterElements[field];
        if (!row) return;
        
        const filterContainer = row.querySelector('.filter-container');
        if (!filterContainer) return;
        
        let filterIndicator = filterContainer.querySelector('.filter-indicator');
        if (hasActiveFilter(field)) {
            if (!filterIndicator) {
                const indicator = document.createElement('span');
                indicator.className = 'filter-indicator';
                indicator.textContent = ' ●';
                indicator.style.color = '#0066cc';
                indicator.style.fontWeight = 'bold';
                indicator.style.marginLeft = '5px';
                filterContainer.appendChild(indicator);
            }
        } else {
            if (filterIndicator) {
                filterIndicator.remove();
            }
        }
    });
    
    // Update active filters warning and button in top controls
    const activeFilters = allColumns.filter(field => hasActiveFilter(field));
    const activeFiltersControls = document.getElementById('active-filters-controls');
    const activeFiltersText = document.getElementById('active-filters-text');
    
    if (activeFilters.length > 0) {
        if (activeFiltersControls) {
            activeFiltersControls.style.display = 'flex';
        }
        if (activeFiltersText) {
            activeFiltersText.textContent = `Active filters: ${activeFilters.length} column(s)`;
        }
    } else {
        if (activeFiltersControls) {
            activeFiltersControls.style.display = 'none';
        }
    }
}

function updateColumnTogglePanel() {
    const panel = document.getElementById('column-toggle-panel');
    const activeElement = document.activeElement;
    const activeField = activeElement?.closest('[data-field]')?.getAttribute('data-field');
    const activeElementType = activeElement?.tagName === 'SELECT' ? 'select' : (activeElement?.tagName === 'INPUT' && activeElement?.type !== 'checkbox') ? 'input' : null;
    const activeValue = activeElement?.value || '';
    const activeSelectionStart = activeElement?.selectionStart || null;
    
    panel.innerHTML = '';
    filterElements = {};
    
    // Get column order from table if available, otherwise use allColumns
    let tableColumns = allColumns;
    if (table) {
        try {
            const cols = table.getColumns();
            if (cols && cols.length > 0) {
                tableColumns = cols.map(col => col.getField());
            }
        } catch (e) {
            console.warn('Failed to get table columns, using allColumns', e);
        }
    }
    
    tableColumns.forEach(field => {
        const row = document.createElement('div');
        row.setAttribute('data-field', field);
        row.setAttribute('draggable', 'true');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '10px';
        row.style.marginBottom = '8px';
        row.style.padding = '4px';
        row.style.borderRadius = '4px';
        row.style.cursor = 'move';
        filterElements[field] = row;
        
        // Drag and drop handlers
        row.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', field);
            row.style.opacity = '0.4';
        });
        
        row.addEventListener('dragend', (e) => {
            row.style.opacity = '1';
        });
        
        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            row.style.background = '#e0e0e0';
        });
        
        row.addEventListener('dragleave', (e) => {
            row.style.background = '';
        });
        
        row.addEventListener('drop', (e) => {
            e.preventDefault();
            row.style.background = '';
            
            const draggedField = e.dataTransfer.getData('text/plain');
            const targetField = field;
            
            if (draggedField !== targetField && table) {
                // Move column in table
                table.moveColumn(draggedField, targetField, false);
                // Save and update
                saveColumnOrder();
                updateColumnTogglePanel();
            }
        });
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = columnVisibility[field] !== false;
        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            columnVisibility[field] = e.target.checked;
            if (e.target.checked) {
                table.showColumn(field);
            } else {
                table.hideColumn(field);
            }
            saveColumnPreferences();
            updateFilterIndicators();
        });
        
        const fieldName = document.createElement('span');
        fieldName.textContent = field;
        fieldName.style.minWidth = '150px';
        fieldName.style.fontSize = '13px';
        
        const filterContainer = document.createElement('div');
        filterContainer.className = 'filter-container';
        filterContainer.style.display = 'flex';
        filterContainer.style.gap = '5px';
        filterContainer.style.alignItems = 'center';
        filterContainer.style.flex = '1';
        
        const colType = columnTypes[field] || 'string';
        const currentFilter = getFilterValue(field);
        const currentOperator = numericFilterOperators[field] || '=';
        
        if (colType === 'number') {
            const operatorSelect = document.createElement('select');
            operatorSelect.style.padding = '3px';
            operatorSelect.style.border = '1px solid #ccc';
            operatorSelect.style.borderRadius = '3px';
            operatorSelect.style.fontSize = '12px';
            operatorSelect.innerHTML = '<option value="=">=</option><option value=">">&gt;</option><option value=">=">&gt;=</option><option value="<">&lt;</option><option value="<=">&lt;=</option>';
            
            const valueInput = document.createElement('input');
            valueInput.type = 'number';
            valueInput.style.padding = '3px';
            valueInput.style.border = '1px solid #ccc';
            valueInput.style.borderRadius = '3px';
            valueInput.style.width = '70px';
            valueInput.style.fontSize = '12px';
            valueInput.placeholder = 'Value';
            
            if (currentFilter) {
                const match = currentFilter.match(/^([><=]+)(.+)$/);
                if (match) {
                    operatorSelect.value = match[1];
                    valueInput.value = match[2];
                    numericFilterOperators[field] = match[1];
                } else {
                    operatorSelect.value = currentOperator;
                    valueInput.value = '';
                }
            } else {
                operatorSelect.value = currentOperator;
            }
            
            // Restore focus if this was the active field
            if (activeField === field && activeElementType === 'select') {
                setTimeout(() => operatorSelect.focus(), 0);
            }
            if (activeField === field && activeElementType === 'input') {
                setTimeout(() => {
                    valueInput.focus();
                    valueInput.value = activeValue;
                    if (activeSelectionStart !== null) {
                        valueInput.setSelectionRange(activeSelectionStart, activeSelectionStart);
                    }
                }, 0);
            }
            
            let updateTimeout = null;
            function updateFilter() {
                clearTimeout(updateTimeout);
                updateTimeout = setTimeout(() => {
                    const operator = operatorSelect.value;
                    const value = valueInput.value;
                    numericFilterOperators[field] = operator;
                    if (value !== '') {
                        setFilterValue(field, value, operator);
                    } else {
                        setFilterValue(field, '', operator);
                    }
                }, 300);
            }
            
            function updateFilterImmediate() {
                clearTimeout(updateTimeout);
                const operator = operatorSelect.value;
                const value = valueInput.value;
                numericFilterOperators[field] = operator;
                if (value !== '') {
                    setFilterValue(field, value, operator);
                } else {
                    setFilterValue(field, '', operator);
                }
            }
            
            operatorSelect.addEventListener('change', (e) => {
                e.stopPropagation();
                updateFilterImmediate();
            });
            valueInput.addEventListener('input', updateFilter);
            valueInput.addEventListener('blur', updateFilterImmediate);
            
            filterContainer.appendChild(operatorSelect);
            filterContainer.appendChild(valueInput);
        } else {
            const filterInput = document.createElement('input');
            filterInput.type = 'text';
            filterInput.style.padding = '3px';
            filterInput.style.border = '1px solid #ccc';
            filterInput.style.borderRadius = '3px';
            filterInput.style.width = '120px';
            filterInput.style.fontSize = '12px';
            filterInput.placeholder = 'Filter...';
            filterInput.value = currentFilter || '';
            
            // Restore focus if this was the active field
            if (activeField === field && activeElementType === 'input') {
                setTimeout(() => {
                    filterInput.focus();
                    filterInput.value = activeValue;
                    if (activeSelectionStart !== null) {
                        filterInput.setSelectionRange(activeSelectionStart, activeSelectionStart);
                    }
                }, 0);
            }
            
            let updateTimeout = null;
            function updateFilter() {
                clearTimeout(updateTimeout);
                updateTimeout = setTimeout(() => {
                    setFilterValue(field, filterInput.value);
                }, 300);
            }
            
            function updateFilterImmediate() {
                clearTimeout(updateTimeout);
                setFilterValue(field, filterInput.value);
            }
            
            filterInput.addEventListener('input', updateFilter);
            filterInput.addEventListener('blur', updateFilterImmediate);
            filterInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    updateFilterImmediate();
                }
            });
                
            filterContainer.appendChild(filterInput);
        }
        
        row.appendChild(checkbox);
        row.appendChild(fieldName);
        row.appendChild(filterContainer);
        
        panel.appendChild(row);
    });
    
    updateFilterIndicators();
}

function initializeTable(data, preserveFilters = false) {
    const columns = getColumnDefinitions(data);
    originalData = data; // Store original data
    
    // Save current filters if preserving
    const savedFilters = preserveFilters ? {...filterValues} : {};
    const savedOperators = preserveFilters ? {...numericFilterOperators} : {};
    
    if (!preserveFilters) {
        filterValues = {}; // Reset filters
        numericFilterOperators = {}; // Reset operators
    }
    
    if (table) {
        table.destroy();
    }
    
    table = new Tabulator("#job-table", {
        data: data,
        columns: columns,
        layout: "fitDataStretch",
        movableColumns: true,
        resizableColumns: true,
        placeholder: "No job data available",
        autoColumns: false
    });
    
    // Listen for sort changes to save to cookie
    table.on("dataSorted", (sorters) => {
        console.log('Table sorted:', sorters);
        saveColumnSort();
    });
    
    // Debug: listen for header clicks
    table.on("headerClick", (e, column) => {
        console.log('Header clicked:', column.getField());
    });
    
    // Listen for column moves to update toggle panel and save order
    table.on("columnMoved", () => {
        saveColumnOrder();
        updateColumnTogglePanel();
    });
    
    // Wait for table to be built before hiding columns and applying sort
    table.on("tableBuilt", () => {
        columns.forEach(col => {
            if (columnVisibility[col.field] === false) {
                table.hideColumn(col.field);
            }
        });
        
        // Restore column sorting after table is built
        if (columnSort && columnSort.length > 0) {
            const validSorters = columnSort.filter(sorter => {
                return allColumns.includes(sorter.field);
            });
            if (validSorters.length > 0) {
                table.setSort(validSorters);
            }
        }
        
        // Update toggle panel AFTER table is built with correct column order
        updateColumnTogglePanel();
        
        // Reapply filters after toggle panel is updated (if preserving filters)
        if (preserveFilters) {
            const hasActiveFilters = allColumns.some(field => hasActiveFilter(field));
            if (hasActiveFilters) {
                applyFilters();
            }
        }
    });
    
    // Restore filters if preserving - only restore filters for columns that exist in new data
    if (preserveFilters) {
        const newFilterValues = {};
        const newNumericOperators = {};
        
        // Only restore filters for columns that exist in the new data
        allColumns.forEach(field => {
            if (savedFilters[field] !== undefined && savedFilters[field] !== '') {
                newFilterValues[field] = savedFilters[field];
            }
            if (savedOperators[field] !== undefined) {
                newNumericOperators[field] = savedOperators[field];
            }
        });
        
        filterValues = newFilterValues;
        numericFilterOperators = newNumericOperators;
    }
    
    // Don't update toggle panel here - wait for tableBuilt event
    
    // Show table and hide loading messages
    const tableContainer = document.getElementById('table-container');
    const jobTable = document.getElementById('job-table');
    const tableLoadingMsg = document.getElementById('table-loading-message');
    
    if (tableContainer) {
        tableContainer.style.display = 'block';
    }
    if (jobTable) {
        jobTable.style.display = 'block';
    }
    if (tableLoadingMsg) {
        tableLoadingMsg.style.display = 'none';
    }
    document.getElementById('loading-message').style.display = 'none';
}

function exportToCSV() {
    if (!table) return;
    
    const visibleColumns = table.getColumns().filter(col => col.isVisible()).map(col => col.getField());
    const filteredData = table.getData('visible'); // 'visible' respects both filters AND sort order
    
    if (filteredData.length === 0) {
        alert('No data to export');
        return;
    }
    
    function getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => {
            if (current === null || current === undefined) return null;
            return current[key];
        }, obj);
    }
    
    function escapeCSVValue(value) {
        if (value === null || value === undefined) return '';
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }
    
    const headers = visibleColumns;
    const rows = filteredData.map(row => {
        return headers.map(header => {
            const value = getNestedValue(row, header);
            if (value === null || value === undefined) return '';
            if (Array.isArray(value)) {
                return escapeCSVValue(value.join('; '));
            }
            if (typeof value === 'object') {
                return escapeCSVValue(JSON.stringify(value));
            }
            return escapeCSVValue(value);
        });
    });
    
    const csvContent = [
        headers.map(h => escapeCSVValue(h)).join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `job_data_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function loadJobData(preserveFilters = false) {
    try {
        const tableContainer = document.getElementById('table-container');
        const jobTable = document.getElementById('job-table');
        const tableLoadingMsg = document.getElementById('table-loading-message');
        const errorMsg = document.getElementById('error-message');
        
        // On initial load, show full loading message
        if (!tableContainer || tableContainer.style.display === 'none') {
            document.getElementById('loading-message').style.display = 'block';
            document.getElementById('error-message').style.display = 'none';
            document.getElementById('table-container').style.display = 'none';
        } else {
            // On refresh, keep container visible but show loading in table area
            tableLoadingMsg.style.display = 'block';
            jobTable.style.display = 'none';
            errorMsg.style.display = 'none';
        }
        
        const limit = parseInt(document.getElementById('row-limit-input').value) || 75;
        currentLimit = limit;
        
        const response = await fetch(`${API.GET_ALL_JSON}?limit=${limit}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch job data: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        if (!data || data.length === 0) {
            if (tableContainer && tableContainer.style.display !== 'none') {
                tableLoadingMsg.style.display = 'none';
                errorMsg.style.display = 'block';
                errorMsg.textContent = 'No job data available';
            } else {
                document.getElementById('loading-message').textContent = 'No job data available';
            }
            return;
        }
        
        initializeTable(data, preserveFilters);
    } catch (error) {
        console.error('Error loading job data:', error);
        const tableContainer = document.getElementById('table-container');
        const tableLoadingMsg = document.getElementById('table-loading-message');
        const errorMsg = document.getElementById('error-message');
        
        if (tableContainer && tableContainer.style.display !== 'none') {
            tableLoadingMsg.style.display = 'none';
            errorMsg.style.display = 'block';
            errorMsg.textContent = `Error loading job data: ${error.message}`;
        } else {
            document.getElementById('loading-message').style.display = 'none';
            document.getElementById('error-message').style.display = 'block';
            document.getElementById('error-message').textContent = `Error loading job data: ${error.message}`;
        }
    }
}

function showAuthUI() {
    document.getElementById('auth-container').style.display = 'flex';
    document.querySelector('main').style.display = 'none';
}

function showAppUI(user) {
    document.getElementById('auth-container').style.display = 'none';
    document.querySelector('main').style.display = 'block';
    loadColumnPreferences();
    loadJobData();
}

auth.onAuthStateChanged((user) => {
    if (user) {
        showAppUI(user);
    } else {
        showAuthUI();
    }
});

function clearAllFilters() {
    filterValues = {};
    numericFilterOperators = {};
    applyFilters();
    updateColumnTogglePanel();
    updateFilterIndicators();
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('export-csv-btn').addEventListener('click', (e) => {
        e.preventDefault();
        exportToCSV();
    });
    
    document.getElementById('toggle-columns-btn').addEventListener('click', (e) => {
        e.preventDefault();
        const panel = document.getElementById('column-toggle-panel');
        panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    });
    
    document.getElementById('clear-filters-btn').addEventListener('click', (e) => {
        e.preventDefault();
        clearAllFilters();
    });
    
    document.getElementById('refresh-btn').addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        loadJobData(true); // Preserve filters on refresh
    });
    
    document.getElementById('row-limit-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            loadJobData();
        }
    });
});


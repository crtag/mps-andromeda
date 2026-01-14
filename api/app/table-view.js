// Firebase Configuration is done via Firebase JS SDKs (from reserved Hosting URLs) - see table-view.html
const auth = firebase.auth();

const app = firebase.app();
const projectId = app.options.projectId;

// Constants
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const EMULATOR_BASE = `http://localhost:5001/${projectId}/us-central1`;

if (IS_LOCAL) {
    console.log('Running locally - connecting to Firebase emulators...');
} else {
    console.log('Running in Firebase Hosting mode');
}

const API = {
    GET_ALL_JSON: IS_LOCAL
        ? `${EMULATOR_BASE}/getAllJobJsonData`
        : `https://us-central1-${projectId}.cloudfunctions.net/getAllJobJsonData`
};

const COLUMN_PREFERENCE_COOKIE = 'job_table_column_visibility';
const COLUMN_SORT_COOKIE = 'job_table_column_sort';
const COLUMN_ORDER_COOKIE = 'job_table_column_order';

let table = null;
let tableReady = false; // Guard against accessing table before tableBuilt event
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
    if (table && tableReady) {
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
        } else if (colType === 'date') {
            // For dates, use custom filter function
            const dateFilterFunc = function(data, filterParams) {
                const rowValue = data[field];
                if (!rowValue) return false;
                const date = new Date(rowValue);
                if (isNaN(date.getTime())) {
                    return String(rowValue).toLowerCase().includes(filterValue.toLowerCase());
                }
                
                // Check against formatted date that user sees in the table
                const searchValue = filterValue.toLowerCase();
                const formattedDate = date.toLocaleString().toLowerCase();
                const isoDate = date.toISOString().toLowerCase();
                const yearMonthDay = date.toLocaleDateString().toLowerCase();
                
                // Also create MM/DD and M/D patterns for flexible matching
                const month = date.getMonth() + 1;
                const day = date.getDate();
                const monthDay = `${month}/${day}`;
                const monthDayPadded = `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}`;
                
                return formattedDate.includes(searchValue) || 
                       isoDate.includes(searchValue) || 
                       yearMonthDay.includes(searchValue) ||
                       monthDay.includes(searchValue) ||
                       monthDayPadded.includes(searchValue);
            };
            
            table.addFilter(dateFilterFunc);
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
    const knownColumns = new Map(); // Field -> column def
    const unknownColumns = new Map(); // Field -> column def
    const processed = new Set();
    
    // Debug: log sample data to check timestamps
    console.log('Sample job data:', sample);
    
    function addColumn(field, title, formatter = null, width = null, colType = 'string') {
        if (processed.has(field)) return;
        processed.add(field);
        
        // Get configuration from column config if available
        const config = getColumnConfig(field, colType);
        const isKnown = isKnownColumn(field);
        
        // Use config type if available (config overrides auto-detection)
        const finalType = (isKnown && config.type) ? config.type : colType;
        const finalTitle = title || config.displayName || field;
        const finalWidth = width || config.width || null;
        const finalVisible = columnVisibility[field] !== undefined 
            ? columnVisibility[field] 
            : (config.visible !== undefined ? config.visible : true);
        
        columnTypes[field] = finalType;
        
        const def = {
            title: finalTitle,
            field: field,
            visible: finalVisible,
            headerSort: true,
            sorter: finalType === 'number' ? 'number' : finalType === 'date' ? 'datetime' : 'alphanum'
        };
        
        // For date columns, add a custom sorter that properly handles date strings
        if (finalType === 'date') {
            def.sorter = function(a, b, aRow, bRow, column, dir, sorterParams) {
                const dateA = new Date(a);
                const dateB = new Date(b);
                
                // Handle invalid dates
                if (isNaN(dateA.getTime()) && isNaN(dateB.getTime())) return 0;
                if (isNaN(dateA.getTime())) return -1;
                if (isNaN(dateB.getTime())) return 1;
                
                return dateA.getTime() - dateB.getTime();
            };
        }
        
        if (formatter) {
            def.formatter = formatter;
        }
        
        if (finalWidth) {
            def.width = finalWidth;
        }
        
        // Add to appropriate map
        if (isKnown) {
            knownColumns.set(field, def);
        } else {
            unknownColumns.set(field, def);
        }
    }
    
    function traverse(obj, prefix = '') {
        for (const [key, value] of Object.entries(obj)) {
            const field = prefix ? `${prefix}.${key}` : key;
            
            // Get config to determine proper display name
            const config = getColumnConfig(field, 'string');
            const displayName = config.displayName;
            
            if (value === null || value === undefined) {
                addColumn(field, displayName, null, null, 'string');
            } else if (Array.isArray(value)) {
                addColumn(field, displayName, (cell) => {
                    return Array.isArray(cell.getValue()) ? cell.getValue().join(', ') : cell.getValue();
                }, null, 'string');
            } else if (typeof value === 'object') {
                // Flatten objects to comma-separated string of their leaf values
                addColumn(field, displayName, (cell) => {
                    const val = cell.getValue();
                    if (!val || typeof val !== 'object') return '';
                    return Object.values(val).filter(v => v != null).join(', ');
                }, null, 'string');
            } else {
                if (typeof value === 'number') {
                    addColumn(field, displayName, null, null, 'number');
                } else if (typeof value === 'boolean') {
                    addColumn(field, displayName, (cell) => {
                        const val = cell.getValue();
                        return val === true ? 'true' : val === false ? 'false' : '';
                    }, null, 'boolean');
                } else {
                    // Check if config explicitly defines this as a date
                    const config = getColumnConfig(field, 'string');
                    
                    // Check if it's a date string (ISO format or MM/DD/YYYY format)
                    const isISODate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value);
                    const isSlashDate = /^\d{2}\/\d{2}\/\d{4},?\s+\d{2}:\d{2}:\d{2}/.test(value);
                    const isDateByDetection = (typeof value === 'string' && (isISODate || isSlashDate));
                    const isDateByConfig = (config.type === 'date');
                    
                    if (isDateByDetection || isDateByConfig) {
                        addColumn(field, displayName, (cell) => {
                            const val = cell.getValue();
                            if (!val) return '';
                            const date = new Date(val);
                            return isNaN(date.getTime()) ? val : date.toLocaleString();
                        }, null, 'date');
                    } else {
                        addColumn(field, displayName, null, null, 'string');
                    }
                }
            }
        }
    }
    
    traverse(sample);
    
    // Order columns: known columns in config order, then unknown columns
    const defaultOrder = getDefaultColumnOrder();
    
    // Add any known columns from config that weren't in the sample data
    // This ensures columns like 'error' are available even if first row doesn't have them
    defaultOrder.forEach(field => {
        if (!processed.has(field)) {
            // Column is in config but not in data - add it anyway
            const config = getColumnConfig(field, 'string');
            const colType = config.type || 'string';
            
            // Add formatter to handle objects (flatten to comma-separated values)
            const formatter = (cell) => {
                const val = cell.getValue();
                if (!val) return '';
                if (typeof val === 'object') {
                    return Object.values(val).filter(v => v != null).join(', ');
                }
                return val;
            };
            
            addColumn(field, config.displayName, formatter, null, colType);
        }
    });
    
    // Add known columns in the order defined in COLUMN_CONFIG
    defaultOrder.forEach(field => {
        if (knownColumns.has(field)) {
            columns.push(knownColumns.get(field));
        }
    });
    
    // Add unknown columns at the end (alphabetically for consistency)
    const unknownFields = Array.from(unknownColumns.keys()).sort();
    unknownFields.forEach(field => {
        columns.push(unknownColumns.get(field));
    });
    
    allColumns = columns.map(col => col.field);
    
    // Apply saved column order if available (user preference overrides default)
    // Only apply if we actually have saved preferences (not just empty array)
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
    
    // Return columns in default config order (known columns first, then unknown)
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
    
    // Create drop indicator line (will be positioned dynamically)
    const dropIndicator = document.createElement('hr');
    dropIndicator.id = 'drop-indicator';
    dropIndicator.style.position = 'absolute';
    dropIndicator.style.left = '30px'; // Start after drag handle and checkbox
    dropIndicator.style.right = '10px'; // Small margin from right edge
    dropIndicator.style.height = '0';
    dropIndicator.style.border = 'none';
    dropIndicator.style.borderTop = '1px solid #ccc'; // Light gray line
    dropIndicator.style.margin = '0';
    dropIndicator.style.padding = '0';
    dropIndicator.style.display = 'none';
    dropIndicator.style.pointerEvents = 'none';
    dropIndicator.style.zIndex = '1000';
    panel.style.position = 'relative';
    panel.appendChild(dropIndicator);
    
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
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '10px';
        row.style.marginBottom = '4px';
        row.style.padding = '4px';
        row.style.borderRadius = '4px';
        filterElements[field] = row;
        
        // Create drag handle
        const dragHandle = document.createElement('div');
        dragHandle.className = 'drag-handle';
        dragHandle.innerHTML = '⋮⋮';
        dragHandle.style.cursor = 'grab';
        dragHandle.style.fontSize = '16px';
        dragHandle.style.color = '#999';
        dragHandle.style.userSelect = 'none';
        dragHandle.style.padding = '0 4px';
        dragHandle.style.lineHeight = '1';
        dragHandle.style.letterSpacing = '-2px';
        dragHandle.title = 'Drag to reorder';
        
        // Drag and drop handlers - only on drag handle
        dragHandle.addEventListener('mousedown', () => {
            row.setAttribute('draggable', 'true');
        });
        
        dragHandle.addEventListener('mouseup', () => {
            row.setAttribute('draggable', 'false');
        });
        
        row.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', field);
            row.style.opacity = '0.4';
            dragHandle.style.cursor = 'grabbing';
        });
        
        row.addEventListener('dragend', (e) => {
            row.style.opacity = '1';
            row.setAttribute('draggable', 'false');
            dragHandle.style.cursor = 'grab';
            
            const dropIndicator = document.getElementById('drop-indicator');
            if (dropIndicator) {
                dropIndicator.style.display = 'none';
            }
        });
        
        row.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            const dropIndicator = document.getElementById('drop-indicator');
            if (!dropIndicator) return;
            
            const rect = row.getBoundingClientRect();
            const panelRect = panel.getBoundingClientRect();
            const rowHeight = rect.height;
            const mouseY = e.clientY - rect.top; // Mouse position relative to row top
            
            // Create a deadzone in the middle 30% of the row to prevent flashing
            const topThreshold = rowHeight * 0.35;
            const bottomThreshold = rowHeight * 0.65;
            
            dropIndicator.style.display = 'block';
            
            if (mouseY < topThreshold) {
                // Position at the top gap (between previous row and this row)
                dropIndicator.style.top = (rect.top - panelRect.top - 2) + 'px';
            } else if (mouseY > bottomThreshold) {
                // Position at the bottom gap (between this row and next row)
                dropIndicator.style.top = (rect.bottom - panelRect.top + 2) + 'px';
            }
            // else: in deadzone, keep previous position (don't update)
        });
        
        row.addEventListener('dragleave', (e) => {
            // Don't hide indicator here - let panel dragover or dragend handle it
        });
        
        row.addEventListener('drop', (e) => {
            e.preventDefault();
            
            const dropIndicator = document.getElementById('drop-indicator');
            if (dropIndicator) {
                dropIndicator.style.display = 'none';
            }
            
            const draggedField = e.dataTransfer.getData('text/plain');
            const targetField = field;
            
            if (draggedField !== targetField && table) {
                // Determine if we should insert before or after based on drop position
                const rect = row.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                const insertAfter = e.clientY >= midpoint;
                
                // Move column in table
                table.moveColumn(draggedField, targetField, insertAfter);
                // Save and update
                saveColumnOrder();
                updateColumnTogglePanel();
            }
        });
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        // Check actual column visibility from table
        const column = table ? table.getColumn(field) : null;
        const isVisible = column ? column.isVisible() : false;
        checkbox.checked = isVisible;
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
        const config = getColumnConfig(field, columnTypes[field]);
        fieldName.textContent = config.displayName || field;
        fieldName.style.minWidth = '200px';
        fieldName.style.fontSize = '13px';
        fieldName.title = field; // Show technical field name on hover
        
        const filterContainer = document.createElement('div');
        filterContainer.className = 'filter-container';
        filterContainer.style.display = 'flex';
        filterContainer.style.gap = '5px';
        filterContainer.style.alignItems = 'center';
        filterContainer.style.flex = '1';
        
        const colType = columnTypes[field] || 'string';
        const currentFilter = getFilterValue(field);
        const currentOperator = numericFilterOperators[field] || '=';
        
        if (colType === 'date') {
            // Date filter - text search on formatted date
            const filterInput = document.createElement('input');
            filterInput.type = 'text';
            filterInput.style.padding = '3px';
            filterInput.style.border = '1px solid #ccc';
            filterInput.style.borderRadius = '3px';
            filterInput.style.width = '120px';
            filterInput.style.fontSize = '12px';
            filterInput.placeholder = 'Search date...';
            filterInput.value = currentFilter || '';
            filterInput.title = 'Search in formatted date (e.g., "Jan", "2026", "16:58")';
            
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
        } else if (colType === 'number') {
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
        
        row.appendChild(dragHandle);
        row.appendChild(checkbox);
        row.appendChild(fieldName);
        row.appendChild(filterContainer);
        
        panel.appendChild(row);
    });
    
    // Add dragover handler to panel to catch gaps between rows
    panel.addEventListener('dragover', (e) => {
        e.preventDefault();
        
        const dropIndicator = document.getElementById('drop-indicator');
        if (!dropIndicator) return;
        
        // Find the closest row to the cursor position
        const rows = Array.from(panel.querySelectorAll('[data-field]'));
        let closestRow = null;
        let closestDistance = Infinity;
        let insertBefore = true;
        
        rows.forEach(row => {
            const rect = row.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            const distance = Math.abs(e.clientY - midpoint);
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestRow = row;
                insertBefore = e.clientY < midpoint;
            }
        });
        
        // Position drop indicator in the gap with deadzone logic
        if (closestRow) {
            const rect = closestRow.getBoundingClientRect();
            const panelRect = panel.getBoundingClientRect();
            const rowHeight = rect.height;
            const mouseY = e.clientY - rect.top;
            
            // Create a deadzone in the middle 30% of the row
            const topThreshold = rowHeight * 0.35;
            const bottomThreshold = rowHeight * 0.65;
            
            dropIndicator.style.display = 'block';
            
            if (mouseY < topThreshold) {
                dropIndicator.style.top = (rect.top - panelRect.top - 2) + 'px';
            } else if (mouseY > bottomThreshold) {
                dropIndicator.style.top = (rect.bottom - panelRect.top + 2) + 'px';
            }
            // else: in deadzone, keep current position
        }
    });
    
    panel.addEventListener('dragleave', (e) => {
        // Hide indicator when leaving the panel
        if (e.target === panel) {
            const dropIndicator = document.getElementById('drop-indicator');
            if (dropIndicator) {
                dropIndicator.style.display = 'none';
            }
        }
    });
    
    panel.addEventListener('drop', (e) => {
        e.preventDefault();
        
        const dropIndicator = document.getElementById('drop-indicator');
        if (dropIndicator) {
            dropIndicator.style.display = 'none';
        }
        
        // Find the closest row
        const rows = Array.from(panel.querySelectorAll('[data-field]'));
        let closestRow = null;
        let closestDistance = Infinity;
        let insertAfter = false;
        
        rows.forEach(row => {
            const rect = row.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            const distance = Math.abs(e.clientY - midpoint);
            
            if (distance < closestDistance) {
                closestDistance = distance;
                closestRow = row;
                insertAfter = e.clientY >= midpoint;
            }
        });
        
        if (closestRow) {
            const draggedField = e.dataTransfer.getData('text/plain');
            const targetField = closestRow.getAttribute('data-field');
            
            if (draggedField !== targetField && table) {
                table.moveColumn(draggedField, targetField, insertAfter);
                saveColumnOrder();
                updateColumnTogglePanel();
            }
        }
    });
    
    // Add reset button at the end
    const resetButtonContainer = document.createElement('div');
    resetButtonContainer.style.marginTop = '15px';
    resetButtonContainer.style.textAlign = 'center';
    
    const resetButton = document.createElement('button');
    resetButton.textContent = 'Reset to Default View';
    resetButton.style.padding = '6px 16px';
    resetButton.style.background = '#0066cc';
    resetButton.style.color = 'white';
    resetButton.style.border = 'none';
    resetButton.style.borderRadius = '4px';
    resetButton.style.cursor = 'pointer';
    resetButton.style.fontSize = '14px';
    resetButton.style.fontWeight = 'bold';
    
    resetButton.addEventListener('mouseenter', () => {
        resetButton.style.background = '#0052a3';
    });
    resetButton.addEventListener('mouseleave', () => {
        resetButton.style.background = '#0066cc';
    });
    
    resetButton.addEventListener('click', () => {
        // Clear all cookies
        document.cookie = `${COLUMN_PREFERENCE_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        document.cookie = `${COLUMN_SORT_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        document.cookie = `${COLUMN_ORDER_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        
        // Reset in-memory state
        columnVisibility = {};
        columnSort = [];
        columnOrder = [];
        
        // Reload the table with default settings
        loadJobData(false);
    });
    
    resetButtonContainer.appendChild(resetButton);
    panel.appendChild(resetButtonContainer);
    
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
        tableReady = false;
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
        tableReady = true;
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


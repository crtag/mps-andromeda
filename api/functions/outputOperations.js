const {logger} = require("firebase-functions");

/**
 * Extract content between two separators
 * @param {string} content - Full text content
 * @param {string|null} startSep - Starting separator (null means start of string)
 * @param {string|null} endSep - Ending separator (null means end of string)
 * @param {boolean} includeSeparators - Include the separators in output
 * @return {string|null} Extracted content or null if not found
 */
function extractSection(content, startSep, endSep, includeSeparators = false) {
    if (!content) return null;

    let startIndex = 0;
    let endIndex = content.length;

    if (startSep) {
        startIndex = content.indexOf(startSep);
        if (startIndex === -1) return null;
        if (!includeSeparators) startIndex += startSep.length;
    }

    if (endSep) {
        endIndex = content.indexOf(endSep, startIndex);
        if (endIndex === -1) return null;
        if (includeSeparators) endIndex += endSep.length;
    }

    return content.slice(startIndex, endIndex).trim();
}

/**
 * Extracts the last section of content after the specified separator
 * @param {string} content - The input string to process
 * @param {string} [separator="\n\n"] - The separator to split on (defaults to double newline)
 * @return {string} The extracted content after last separator, empty string if not found or empty input
 */
function extractReverse(content, separator = "\n\n") {
    if (!content) return "";
    logger.info("Extracting content after last separator");
    logger.info(content);

    // Find the last occurrence of separator
    const lastSeparatorIndex = content.lastIndexOf(separator);

    // If no separator is found
    if (lastSeparatorIndex === -1) {
        logger.warn("Separator not found in content!");
        return "";
    }

    // Extract everything after the last blank line
    return content.slice(lastSeparatorIndex + separator.length).trim();
}

function extractMoleculeInput(content) {
    const startSep = "=========== Molecule Input ==========";
    const endSep = "-- INPUT GEOMETRY --";

    const section = extractSection(content, startSep, endSep, false);

    let totalAtomNumber = null;
    let numberElectrons = null;
    let numberAlphaElectrons = null;
    let numberBetaElectrons = null;

    if (section) {
        // create regex to extract total atom number and total electrons
        const atomMatch = section.match(/TOTAL ATOM NUMBER\s+=\s+(\d+)/);
        const electronsMatch = section.match(/NUMBER OF ELECTRONS\s+=\s+(\d+)/);
        const alphaElectronsMatch = section.match(/NUMBER OF ALPHA ELECTRONS\s+=\s+(\d+)/);
        const betaElectronsMatch = section.match(/NUMBER OF BETA ELECTRONS\s+=\s+(\d+)/);
        totalAtomNumber = atomMatch ? parseInt(atomMatch[1]) : null;
        numberElectrons = electronsMatch ? parseInt(electronsMatch[1]) : null;
        numberAlphaElectrons = alphaElectronsMatch ? parseInt(alphaElectronsMatch[1]) : null;
        numberBetaElectrons = betaElectronsMatch ? parseInt(betaElectronsMatch[1]) : null;
    }

    return {totalAtomNumber, numberElectrons, numberAlphaElectrons, numberBetaElectrons};
}

/**
 * Extracts simulation results from the given content.
 *
 * The content is expected to be the last section of the output file starting with the
 * "================ OPTIMIZED GEOMETRY INFORMATION ==============" separator.
 * This function extracts the final geometry, minimized energy value, and total time of the simulation.
 *
 * @param {string} content - The content of the output file.
 * @return {Object} An object containing the extracted simulation results:
 *   - {string} optimizedGeometry - The optimized geometry in Cartesian coordinates.
 *   - {number|null} minimizedEnergy - The minimized energy value.
 *   - {number|null} totalTime - The total time of the simulation.
 */
function extractSimulationResults(content) {
    // the content is the last section of the output file starting with the
    // "================ OPTIMIZED GEOMETRY INFORMATION ==============" separator
    // we need to extract the final geometry which starts like follows
    // make to strip off blank spaces on start and end of each line
    // the "FORCE" line is the first line of the next section
    // so we need all the lines in between
    /*
    OPTIMIZED GEOMETRY IN CARTESIAN
    ELEMENT      X              Y              Z
    C         -11.955388       4.422024      -0.357850
    C          -9.634206       2.630167       0.650537
    C         -10.432765       2.739222       1.903391
    ...
    FORCE
    */
    // then we need to extract minimized energy value
    // MINIMIZED ENERGY =   -840.694818961
    // and total time of simulation
    // | TOTAL TIME          =  3967.181602000
    let optimizedGeometry = null;
    let minimizedEnergy = null;
    let totalTime = null;

    // check content is not empty and start separator is present
    if (!content || !content.includes("OPTIMIZED GEOMETRY IN CARTESIAN")) {
        return {optimizedGeometry, minimizedEnergy, totalTime};
    }

    // extract geometry
    const startSep = "OPTIMIZED GEOMETRY IN CARTESIAN";
    const endSep = "FORCE";
    optimizedGeometry = extractSection(content, startSep, endSep, false);
    // strip off the first line with ELEMENT X Y Z
    // and for each line strip off starting and ending spaces
    optimizedGeometry = optimizedGeometry.split("\n")
        .slice(1)
        .map((line) => line.trim()).join("\n");

    // extract minimized energy with regex
    const energyMatch = content.match(/MINIMIZED ENERGY\s+=\s+([-\d.]+)/);
    if (energyMatch) {
        minimizedEnergy = parseFloat(energyMatch[1]);
    }

    // extract total time with regex
    const timeMatch = content.match(/\| TOTAL TIME\s+=\s+([\d.]+)/);
    if (timeMatch) {
        totalTime = parseFloat(timeMatch[1]);
    }

    return {optimizedGeometry, minimizedEnergy, totalTime};
}

/**
 * Parse compact HKL format without separators (e.g., "01-1", "011", "10-1").
 *
 * @param {string} compactStr - Compact HKL string like "01-1" or "011"
 * @return {string[]} Array of 3 component strings
 */
function parseCompactHKL(compactStr) {
    // Only attempt compact parsing if the string doesn't contain whitespace or commas
    if (compactStr.includes(' ') || compactStr.includes(',')) {
        throw new Error(`Invalid format: cannot parse as compact HKL due to separators`);
    }
    
    const components = [];
    let current = "";
    let expectingDigit = true;
    
    for (let i = 0; i < compactStr.length; i++) {
        const char = compactStr[i];
        
        if (char === '-') {
            if (current && !expectingDigit) {
                // End current component and start new negative component
                components.push(current);
                current = "-";
                expectingDigit = true;
            } else if (expectingDigit) {
                // Start of negative component
                current += "-";
                expectingDigit = true;
            } else {
                // Invalid: minus in middle of number
                throw new Error(`Invalid compact HKL format: unexpected '-' at position ${i + 1}`);
            }
        } else if (char >= '0' && char <= '9') {
            current += char;
            expectingDigit = false;
        } else {
            // Invalid character
            throw new Error(`Invalid compact HKL format: unexpected character '${char}' at position ${i + 1}`);
        }
        
        // Auto-split after each digit group for common patterns
        if (!expectingDigit && (i === compactStr.length - 1 || compactStr[i + 1] === '-' || 
            (current.length === 1 && char !== '-') || 
            (current.length === 2 && current[0] === '-'))) {
            components.push(current);
            current = "";
            expectingDigit = true;
        }
    }
    
    // Add final component if exists
    if (current) {
        components.push(current);
    }
    
    return components;
}

/**
 * Parse HKL Miller indices string to unit vector.
 *
 * @param {string} hklStr - Miller indices like "[1 1 0]", "10-1", "[2,0,-1]", "[01-1]", "[011]"
 * @return {number[]} Unit vector [ux, uy, uz]
 */
function parseHKLToUnitVector(hklStr) {
    const trimmed = hklStr.trim();

    // Strip optional square brackets
    const withoutBrackets = trimmed.replace(/^\[|\]$/g, "");

    // First try: Split by commas or whitespace (modern format)
    let tokens = withoutBrackets.split(/[,\s]+/).filter(token => token.length > 0);

    // If we don't get exactly 3 tokens, try compact format parsing
    if (tokens.length !== 3) {
        try {
            tokens = parseCompactHKL(withoutBrackets);
        } catch (error) {
            // If compact parsing also fails, fall through to the main error with original tokens
            console.error("Compact parsing failed:", error);
        }
    }

    if (tokens.length !== 3) {
        throw new Error(
            `Invalid HKL format '${hklStr}': Expected exactly 3 components, ` +
            `got ${tokens.length} from parsed tokens [${tokens.join(', ')}]. ` +
            `Supported formats: '[1 1 0]', '[1,1,0]', '[110]', '1 1 0', etc.`);
    }

    // Parse each token as integer
    const components = tokens.map((token, index) => {
        const num = parseInt(token, 10);
        if (!Number.isInteger(num)) {
            throw new Error(
                `Invalid HKL format '${hklStr}': Component '${token}' at position ${index + 1} ` +
                `is not a valid integer`
            );
        }
        return num;
    });

    const [h, k, l] = components;

    // Validate not all zero
    if (h === 0 && k === 0 && l === 0) {
        throw new Error(`Invalid HKL format '${hklStr}': Direction cannot be zero vector [0,0,0]`);
    }

    // Compute Euclidean norm
    const norm = Math.sqrt(h * h + k * k + l * l);

    // Return unit vector
    return [h / norm, k / norm, l / norm];
}

/**
 * Parse steered atoms selection string to array of indices.
 *
 * @param {string} selectionStr - Atom indices like "1 2 3" or "1,2,3"
 * @param {number} atomCount - Total number of atoms for bounds checking
 * @return {number[]} Array of one-based atom indices (deduplicated)
 */
function parseSteeredAtoms(selectionStr, atomCount) {
    // Split on non-digits and filter out empties
    const tokens = selectionStr.split(/\D+/).filter(token => token.length > 0);

    if (tokens.length === 0) {
        throw new Error("No atom indices found in selection string");
    }

    // Map to integers and validate
    const indices = tokens.map(token => {
        const num = parseInt(token, 10);
        if (!Number.isInteger(num)) {
            throw new Error(`Invalid atom index "${token}": must be integer`);
        }
        return num;
    });

    // De-duplicate while preserving order
    const uniqueIndices = [...new Set(indices)];

    // Range check: 1-based indexing
    for (const index of uniqueIndices) {
        if (index < 1 || index > atomCount) {
            throw new Error(`Atom index ${index} out of bounds. Expected in range 1 to ${atomCount}`);
        }
    }

    return uniqueIndices;
}

/**
 * Parse XYZ coordinate lines into structured records.
 *
 * @param {string} xyzStr - XYZ format lines "Type x y z"
 * @return {Array<{type: string, x: number, y: number, z: number}>} Parsed records
 */
function parseXYZ(xyzStr) {
    const lines = xyzStr.split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0);

    const records = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const tokens = line.split(/\s+/);

        if (tokens.length !== 4) {
            throw new Error(`Line ${i + 1}: Expected 4 tokens (type x y z), got ${tokens.length}`);
        }

        const [type, xStr, yStr, zStr] = tokens;

        const x = parseFloat(xStr);
        const y = parseFloat(yStr);
        const z = parseFloat(zStr);

        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
            throw new Error(`Line ${i + 1}: Invalid coordinates - must be finite numbers`);
        }

        records.push({type, x, y, z});
    }

    return records;
}

/**
 * Format XYZ records back to string format.
 *
 * @param {Array<{type: string, x: number, y: number, z: number}>} records - XYZ records
 * @return {string} Formatted XYZ string
 */
function formatXYZ(records) {
    return records.map(record => 
        `${record.type} ${record.x} ${record.y} ${record.z}`
    ).join("\n");
}

/**
 * Apply steering displacement to selected atoms.
 *
 * @param {Array<{type: string, x: number, y: number, z: number}>} records - XYZ records
 * @param {number[]} selectedIndices - One-based atom indices to steer
 * @param {number} stepSize - Total displacement magnitude in Angstroms
 * @param {number[]} unitDir - Unit direction vector [ux, uy, uz]
 * @return {Array<{type: string, x: number, y: number, z: number}>} New records with applied steering
 */
function applySteer(records, selectedIndices, stepSize, unitDir) {
    if (!Number.isFinite(stepSize) || stepSize === 0) {
        throw new Error("stepSize must be a finite non-zero number");
    }

    const [ux, uy, uz] = unitDir;

    // Compute per-axis deltas
    const dx = stepSize * ux;
    const dy = stepSize * uy;
    const dz = stepSize * uz;

    // Create new records array (don't mutate input)
    const newRecords = [...records];

    // Apply steering to selected atoms
    for (const oneBasedIndex of selectedIndices) {
        const zeroBasedIndex = oneBasedIndex - 1;
        const record = newRecords[zeroBasedIndex];

        // Create new record with steered coordinates
        newRecords[zeroBasedIndex] = {
            type: record.type,
            x: record.x + dx,
            y: record.y + dy,
            z: record.z + dz,
        };
    }

    return newRecords;
}

/**
 * Steer the XYZ coordinates of atoms in the given direction.
 *
 * Applies a displacement of magnitude stepSize along the Miller indices direction
 * to the specified atoms. The stepSize represents the total displacement length,
 * making diagonal movements physically consistent.
 *
 * @param {string} currentXYZ - XYZ format coordinates, one line per atom (Type x y z)
 * @param {string} steeredAtoms - One-based atom indices, space or comma separated
 * @param {number} stepSize - Total displacement magnitude in Angstroms (negative allowed for reverse)
 * @param {string} hkl - Miller indices direction like "[1 1 0]" or "2,0,-1"
 * @return {string} Updated XYZ coordinate string
 */
function steerXYZ(currentXYZ, steeredAtoms, stepSize, hkl) {
    const records = parseXYZ(currentXYZ);
    const unitDir = parseHKLToUnitVector(hkl);
    const selected = parseSteeredAtoms(steeredAtoms, records.length);
    const newRecords = applySteer(records, selected, stepSize, unitDir);
    return formatXYZ(newRecords);
}

module.exports = {extractSection, extractReverse, extractMoleculeInput, extractSimulationResults, steerXYZ};

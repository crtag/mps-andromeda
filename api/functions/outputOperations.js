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
 * Steer the XYZ coordinates of atoms in the given direction.
 *
 * @param {string} currentXYZ - The current all atoms XYZ format, one line per atom.
 * Type of atom, then X, Y, Z coordinates, all space-separated.
 * @param {string} steeredAtoms - The indices of the atoms to steer. Once-based list.
 * @param {number} stepSize - The step size to steer the atoms. In angstroms.
 * @param {string} hkl - The direction to steer the atoms. Miller indices in square brackets.
 * @return {string} The new XYZ formatted list.
 */
function steerXYZ(currentXYZ, steeredAtoms, stepSize, hkl) {
    // parse the direction string to get the vector, square brackets are optional
    // either of h k l can have a minus indicating the opposite direction
    const directionMatch = hkl.match(/^\[?([01-]+)\]?$/);
    if (!directionMatch) {
        throw new Error("Invalid direction format case 1, must match [hkl] with optional minus sign");
    }
    // find the minus sign and extract it
    const sign = directionMatch[1].indexOf("-") !== -1 ? -1 : 1;
    let direction = directionMatch[1].replace("-", "");
    // figure out direction by position of h, k, l in the string
    // we actually need only an index to use it to reference X Y or Z in the atom line
    // so we can use a simple switch statement
    direction = direction.indexOf("1");
    // if the direction is not found, it means the direction is not valid
    if (direction === -1) {
        throw new Error("Invalid direction format case 2, must match [hkl] with optional minus sign");
    }

    // split the atom list with coordinates into lines
    const xyzLines = currentXYZ.trim().split("\n");

    // split the list of atoms to steer into an array of integers, separator can be
    // anything that is not a digit
    const atoms = steeredAtoms.split(/\D+/).map((i) => parseInt(i));

    // steer the atoms, mind zero based lines list
    for (const atom of atoms) {
        const line = xyzLines[atom - 1];
        if (!line) {
            throw new Error(`Atom index ${atom} out of bounds. Expected in 1 to ${xyzLines.length} range.`);
        }
        const currentPos = line.split(/\s+/);
        // we need to add the step size to the current position
        currentPos[direction + 1] = parseFloat(currentPos[direction + 1].trim()) + sign * stepSize;

        // unfold back into string line
        xyzLines[atom - 1] = currentPos.join("    ");
    }

    return xyzLines.join("\n");
}

module.exports = {extractSection, extractReverse, extractMoleculeInput, extractSimulationResults, steerXYZ};

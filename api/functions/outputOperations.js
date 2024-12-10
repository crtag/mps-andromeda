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

module.exports = extractSection;

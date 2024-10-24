const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");

/**
 * The payload is expected in the following format
 *
 {
    "filename": "$file_key",
    "status": "$status",
    "new_content": "$new_lines",
    "offset": $current_offset
 }
 * Where
 * status is one of "RUNNING", "ENDED", "FAILED"
 * filename is the name of the file without the extension
 * new_content is the new content to be appended to the result file
 * offset is the current offset of the file, ie line number to consider when appending new content
 */
exports.handler = onRequest((req, res) => {
    if (req.method !== "POST") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    const payload = req.body;
    // check for undefined only, empty strings are allowed
    if (payload.filename === undefined ||
        payload.status === undefined ||
        payload.new_content === undefined ||
        payload.offset === undefined
    ) {
        res.status(400).send("Bad payload format");
        return;
    }

    logger.info("Received job status report", {structuredData: true, payload});

    res.status(204);
    res.send();
});

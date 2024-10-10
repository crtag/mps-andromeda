const {onRequest} = require("firebase-functions/v2/https");
const {logger} = require("firebase-functions");

exports.handler = onRequest((req, res) => {
    if (req.method !== "GET") {
        res.status(405).send("Method Not Allowed");
        return;
    }

    logger.info("Start checking pending jobs", {structuredData: true});

    res.status(204);
    res.send();
});

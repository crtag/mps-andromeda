const jobAssignment = require("./src/jobAssignment");
const jobStatusReport = require("./src/jobStatusReport");

exports.jobAssignment = jobAssignment.handler;
exports.jobStatusReport = jobStatusReport.handler;

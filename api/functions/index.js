const jobAssignment = require("./src/jobAssignment");
const jobStatusReport = require("./src/jobStatusReport");
const jobManagement = require("./src/jobManagement");

exports.jobAssignment = jobAssignment.handler;
exports.jobStatusReport = jobStatusReport.handler;
exports.listPendingJobs = jobManagement.listPendingJobsHandler;
exports.listCompletedJobs = jobManagement.listCompletedJobsHandler;
exports.getJobFile = jobManagement.getJobFileHandler;
exports.uploadJobSpec = jobManagement.uploadJobSpecHandler;
exports.previewJob = jobManagement.previewJobHandler;
exports.confirmJob = jobManagement.confirmJobHandler;
exports.deleteJob = jobManagement.deleteJobHandler;
exports.postTerminationScan = jobManagement.terminationPostScanHandler;
exports.postTerminationParse = jobManagement.terminationPostParseHandler;

const jobAssignment = require("./src/jobAssignment");
const jobStatusReport = require("./src/jobStatusReport");
const jobManagement = require("./src/jobManagement");

exports.jobAssignment = jobAssignment.handler;
exports.jobStatusReport = jobStatusReport.handler;
exports.listPendingJobs = jobManagement.listPendingJobsHandler;
exports.listCompletedJobs = jobManagement.listCompletedAndRunningJobsHandler;
exports.getAllJobJsonData = jobManagement.getAllJobJsonDataHandler;
exports.getJobFile = jobManagement.getJobFileHandler;
exports.uploadJobSpec = jobManagement.uploadJobSpecHandler;
exports.previewJob = jobManagement.previewJobHandler;
exports.confirmJob = jobManagement.confirmJobHandler;
exports.deleteJob = jobManagement.deleteJobHandler;
exports.updateJobMetadata = jobManagement.updateJobMetadataHandler;
exports.downloadJobFolder = jobManagement.downloadJobFolderHandler;
exports.postTerminationScan = jobManagement.terminationPostScanHandler;
exports.postTerminationParse = jobManagement.terminationPostParseHandler;

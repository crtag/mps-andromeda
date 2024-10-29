# Dockerfile for QUICK

Note: see the project GitHub repository for details.

[Official QUICK repository](https://github.com/merzlab/QUICK)

This Dockerfile used to build an image for the QUICK application.

[Docker Hub repository](https://hub.docker.com/r/crtag/quick-app/)

Job scheduler script requires some minimal environment configuration, here's an example of a direct shell execution

`STATUS_CHECK_INTERVAL="10" API_URL_JOB_ASSIGNMENT="https://jobassignment-poloq3qrtq-uc.a.run.app" API_URL_STATUS_REPORT="https://jobstatusreport-poloq3qrtq-uc.a.run.app" ./job_manager.sh`

# Andromeda Emulation Environment

This project emulates the Andromeda Cluster environment for local development and testing of the QUICK application.

## Platform Compatibility

**Important Note**: This emulation environment is primarily designed and tested for Linux systems, particularly Ubuntu. 

- **Linux (Ubuntu)**: Fully supported and recommended for the best experience.
- **macOS**: May work with some modifications, but is not tested. If you successfully run this environment on macOS, please share your experience with the project maintainers.
- **Windows**: Not currently supported. Windows users are recommended to use Windows Subsystem for Linux 2 (WSL2) with an Ubuntu distribution for the closest compatible experience. Access to GPU resources may be limited or unavailable on Windows.


## Application Image

This project uses a pre-built Docker image `crtag/quick-app:1.0.0` hosted on Docker Hub. 

## Development Environment Setup

Follow steps outlined in the [Development Environment Setup](./k8s/README.md) guide to set up the development environment.
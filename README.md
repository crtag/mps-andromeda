# Andromeda Emulation Environment

This project emulates the Andromeda Cluster environment for local development and testing of the QUICK application.

## Platform Compatibility

**Important Note**: This emulation environment is primarily designed and tested for Linux systems, particularly Ubuntu. 

- **Linux (Ubuntu)**: Fully supported and recommended for the best experience.
- **macOS**: May work with some modifications, but is not tested. If you successfully run this environment on macOS, please share your experience with the project maintainers.
- **Windows**: Not currently supported. Windows users are recommended to use Windows Subsystem for Linux 2 (WSL2) with an Ubuntu distribution for the closest compatible experience.

If you're using Windows, please set up WSL2 with Ubuntu before proceeding with this emulation environment.

## Prerequisites

- Docker (version 19.03 or later)
- Docker Compose (version 1.28.0 or later)
- NVIDIA GPU drivers (for GPU acceleration)
- Linux environment (Ubuntu recommended, or WSL2 for Windows users)

Ensure you have the correct versions installed to support GPU functionality.

## Application Image

This project uses a pre-built Docker image `crtag/quick-app:1.0.0` hosted on Docker Hub. 
The `start-environment.sh` script ensures the latest version of this image is pulled before starting the environment.

## Setup

1. Clone this repository and navigate to the project directory:
   ```
   git clone <repository-url>
   cd path/to/andromeda/emulation
   ```

2. Make the scripts executable:
   ```
   chmod +x scripts/*.sh
   ```

3. Start the environment:
   ```
   ./scripts/start-environment.sh
   ```
   This script will automatically pull the latest QUICK application image, 
   create necessary volumes, and start the environment.

## Managing the Environment

- To start the environment: `./scripts/start-environment.sh`
- To stop the environment: `./scripts/stop-environment.sh`
- To clean up the environment (remove all containers and volumes): `./scripts/cleanup-environment.sh`

Note: The start and stop scripts automatically handle orphaned containers.

## Workspace Structure

The `workspace` directory is mounted in the containers:
- Place your input files in the `workspace` directory.
- Output files will be generated in the `workspace` directory.

This structure allows easy file sharing between your host machine and the Docker containers.

## Running the QUICK Application

The quick-app container runs persistently. To run the QUICK application with an input file:

1. Ensure your input file is in the `workspace` directory.
2. Run the QUICK application using:
   ```
   docker compose exec quick-app quick /app/workspace/input-file
   ```
   Replace `input-file` with the name of your input file.

3. The output will be generated in the `workspace` directory.

Note: Use `docker compose exec` instead of `docker compose run` to utilize the persistent container.

## Accessing the Disk

To access the disk-access container, use:
```
docker compose exec disk-access bash
```

## Volume Management

The shared disk volume is automatically created and managed by Docker Compose. 
You don't need to create it manually. The volume persists between container 
restarts unless explicitly removed.

## Example run sequence
Note: `water.in` is included in the repository for testing purposes and will be available for use in the `workspace` directory.
Output will be generated in the same directory.

```
./scripts/start-environment.sh
docker compose exec quick-app quick /app/workspace/water.in

# Repeat the above command with different input files as needed
./scripts/stop-environment.sh
```

## GPU Support

This setup supports CUDA GPU acceleration. To use it:

1. Ensure you have NVIDIA GPU drivers installed on your host system.
2. The environment will automatically detect and use GPU acceleration if available.

## GPU Troubleshooting

If you encounter GPU-related issues:

1. Update NVIDIA drivers to the latest version.
2. Reboot your system.
3. Run `nvidia-smi --gpu-reset` to reset the GPU.
4. If issues persist, the application will run without GPU acceleration.

For persistent problems, consult NVIDIA support or consider hardware diagnostics.

## Updating NVIDIA Drivers

To ensure optimal performance and compatibility, keep your NVIDIA drivers up to date:

1. Check for recommended drivers:
   ```
   ubuntu-drivers devices
   ```
2. Install the recommended driver:
   ```
   sudo ubuntu-drivers autoinstall
   ```
3. Reboot your system after installation.
4. Verify the installation:
   ```
   nvidia-smi
   ```

## Note

This is a local emulation and may not perfectly reflect the actual Andromeda Cluster environment.

## Troubleshooting

- If you encounter permission issues when trying to run the scripts, ensure you've made them executable using the chmod command mentioned in the setup instructions.
- If containers are not running as expected, check the logs using `docker compose logs`.
- For Windows users experiencing issues, ensure you're running the environment within WSL2 with an Ubuntu distribution.
- For any persistent issues, refer to the Docker and NVIDIA documentation or consult the project maintainers.
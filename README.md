# Andromeda Emulation Environment

This project emulates the Andromeda Cluster environment for local development and testing of the QUICK application.

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

3. Pull the QUICK application image:
   ```
   docker pull crtag/quick-app:1.0.0
   ```

4. Create the disk:
   ```
   ./scripts/create-disk.sh
   ```

5. Start the environment:
   ```
   ./scripts/start-environment.sh
   ```

6. To stop the environment:
   ```
   ./scripts/stop-environment.sh
   ```

## Accessing the disk

To access the disk, use:
```
docker-compose exec disk-access bash
```

## Note

This is a local emulation and may not perfectly reflect the actual Andromeda Cluster environment.

## Troubleshooting

If you encounter permission issues when trying to run the scripts, ensure you've made them executable using the chmod command mentioned in the setup instructions.

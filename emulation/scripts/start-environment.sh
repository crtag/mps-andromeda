#!/bin/bash

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

cleanup() {
    echo "Cleaning up environment..."
    $compose_command down --remove-orphans
}

# Check for docker
if ! command_exists docker; then
    echo "Error: Docker is not installed. Please install Docker and try again."
    exit 1
fi

# Check for docker-compose or docker compose
if command_exists docker-compose; then
    compose_command="docker-compose"
elif docker compose version >/dev/null 2>&1; then
    compose_command="docker compose"
else
    echo "Error: Neither docker-compose nor docker compose is available."
    echo "Please install Docker Compose or update Docker to a version that includes Compose."
    echo "For installation instructions, visit: https://docs.docker.com/compose/install/"
    exit 1
fi

$compose_command pull

cleanup

echo "Starting QUICK application environment with GPU support..."
$compose_command up -d

if [ $? -eq 0 ]; then
    echo "Environment is ready."
    echo "To run the QUICK application, use: $compose_command run quick-app [arguments]"
    echo "To access the disk-access container, use: $compose_command exec disk-access bash"
    echo "Your workspace is mounted at /app/workspace in both containers"
else
    echo "Failed to start the environment. Please check your docker-compose.yml file and ensure all services are correctly configured."
fi

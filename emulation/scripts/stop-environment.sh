#!/bin/bash

# Function to check if a command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Check for docker-compose or docker compose
if command_exists docker-compose; then
    compose_command="docker-compose"
elif docker compose version >/dev/null 2>&1; then
    compose_command="docker compose"
else
    echo "Error: Neither docker-compose nor docker compose is available."
    exit 1
fi

echo "Stopping QUICK application environment..."
$compose_command down --remove-orphans

echo "Environment has been stopped and orphaned containers removed."
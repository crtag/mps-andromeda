# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MPS Andromeda is a cloud-based molecular simulation platform that emulates the Andromeda Cluster environment for QUICK computational chemistry application. The system consists of:

- **Firebase Cloud Functions** (api/functions) - Job management and molecular simulation processing
- **Frontend Web App** (api/app) - User interface for job submission and visualization

## Architecture

### Firebase Functions (api/functions)

- **index.js** - Main exports for Cloud Functions
- **outputOperations.js** - Molecular simulation result parsing and geometry manipulation
- **storageOperations.js** - Firebase Storage operations for job files
- **src/jobManagement.js** - Job lifecycle management (upload, list, retrieve)
- **src/jobAssignment.js** - Job assignment to compute nodes
- **src/jobStatusReport.js** - Job status reporting and completion tracking

### Key Data Flow

1. Users upload job specifications via web interface
2. Jobs are stored in Firebase Storage and queued for processing
3. Kubernetes pods execute QUICK/Terachem simulations
4. Results are parsed and stored back to Firebase Storage
5. Output operations extract geometry, energy, and timing data

## Development Commands

### Firebase Functions Development

```bash
# Install dependencies (run from api/functions)
npm install

# Start Firebase emulator for local development
npm run serve

# Deploy functions to Firebase
npm run deploy

# Run tests
npm test

# Lint code
npm run lint

# View function logs
npm run logs

# Open Firebase shell
npm run shell
```

### Firebase Project Setup

```bash
# Install Firebase CLI globally
npm install -g firebase-tools

# Login to Firebase
firebase login

# Switch to project
firebase use mps-andromeda
```

## Technology Stack

- **Runtime**: Node.js 22

- **Cloud Platform**: Firebase (Functions, Storage, Hosting)
- **Testing**: Jest
- **Linting**: ESLint with Google config
- **Simulation Software**: QUICK (CUDA/MPI), Terachem
- **GPU Computing**: NVIDIA GPU support via Kubernetes GPU Operator

## File Structure Patterns

- Functions follow Firebase v2 HTTP triggers pattern with `onRequest({cors: true})`
- Molecular data parsing uses regex patterns for extracting scientific values
- Job files use `.in` extensions for input specifications
- Output parsing handles QUICK format with specific separators and sections
- **Geometry manipulation**: XYZ coordinate format with enhanced Miller indices steering
  - Supports both legacy compact and modern separated HKL formats
  - Includes comprehensive error messages with format suggestions
- **Test files**: Isolated test suites for complex functions like `steerXYZ`

## Testing

### Test Organization
- **Test framework**: Jest with standard conventions
- **Test file naming**: `*.test.js` files co-located with source files or in dedicated test directories
- **Test structure**: Isolated test suites for complex functions, comprehensive coverage including edge cases, error handling, and format validation
- **Test patterns**: Helper functions, mock data, and tolerance-based assertions for scientific calculations

### Running Tests
```bash
# Run all tests
npm test

# Run specific test file
npx jest filename.test.js

# Run tests with coverage
npm test -- --coverage
```

### Interactive Testing
```bash
# Test functions interactively via Node.js REPL
node
> const { functionName } = require('./sourceFile');
> // Test function with sample data
```

## Trajectory Simulation Architecture

The platform supports trajectory simulations where molecular structures are systematically modified:

1. **Job Upload**: Initial geometry with trajectory parameters (direction, step size, atom selection)
2. **Iterative Processing**: Each step uses `steerXYZ()` to modify coordinates
3. **Continuation Logic**: Automatic generation of next iteration jobs
4. **Result Storage**: Trajectory files stored separately from single-point calculations

## Platform Compatibility

- **Primary**: Ubuntu Linux (fully supported)
- **Secondary**: macOS (may work with modifications)
- **Windows**: Use WSL2 with Ubuntu for compatibility
- **GPU Access**: Linux required for optimal GPU resource utilization

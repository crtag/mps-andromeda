# API

## Development setup

Install firebase CLI

`npm install -g firebase-tools`

Login into Firebase

`firebase login`

Change the folder to `api/`

Ensure you switch to the right project

`firebase use mps-andromeda`

Functions require dependencies, install them
`npm install` from the `functions/` folder

## Running emulators

**Start emulators with data persistence:**
```bash
TMPDIR=$HOME/.firebase-tmp firebase emulators:start --only functions,storage,hosting --import=./emulator-data --export-on-exit=./emulator-data
```
> Note: Firebase storage emulator uses a temp directory by default, which can lead to permission issues on shared machines. This will cause emulator startup failures with permission denined messages. 


This sets a user-specific temp directory to avoid conflicts on shared machines.

This command will:
- Import existing data from `./emulator-data/` on startup (if it exists)
- Export all data to `./emulator-data/` when you stop the emulator (Ctrl+C)

**Run specific emulators:**
- Functions only: `firebase emulators:start --only functions`
- Hosting only: `firebase emulators:start --only hosting`
- Storage only: `firebase emulators:start --only storage`

**First run setup:**

On first run, initialize the storage folder structure to create the required directories:
- `job-specs/`
- `job-results/`
- `job-trajectories/`

### Emulator data persistence

**Clear emulator data** (start fresh):
```bash
rm -rf ./emulator-data
```

**Manual export** (while emulator is running):
```bash
firebase emulators:export ./emulator-data
```

### Local vs Production

- **Authentication**: Uses production credentials (login with real accounts)
- **Functions & Storage**: Automatically use local emulators when accessing via `localhost` or `127.0.0.1`
- **Emulator UI**: Available at `http://localhost:4000`
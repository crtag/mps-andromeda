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

You can run all emulators with:
```bash
firebase emulators:start --only functions,storage,hosting
```

Or run specific emulators:
- Functions only: `firebase emulators:start --only functions`
- Hosting only: `firebase emulators:start --only hosting`
- Storage only: `firebase emulators:start --only storage`

On a first run you will need to create some initial storage structure, at least the following folders via local emulator UI:
    'job-specs',
    'job-results',
    'job-trajectories'

### Emulator data persistence

Emulator data (storage files, etc.) is automatically saved to `./emulator-data/` on exit and loaded on start. This allows you to maintain state between emulator sessions.

To manually export data:
```bash
firebase emulators:export ./emulator-data
```

To start with imported data:
```bash
firebase emulators:start --import=./emulator-data
```

To clear emulator data:
```bash
rm -rf ./emulator-data
```

### Local vs Production

- **Authentication**: Uses production credentials (login with real accounts)
- **Functions & Storage**: Automatically use local emulators when accessing via `localhost` or `127.0.0.1`
- **Emulator UI**: Available at `http://localhost:4000`
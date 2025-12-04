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

You can run all emaulators with
`firebase emulators:start --only functions,firestore,hosting`
Or you can run only functions with
`firebase emulators:start --only functions`
Or hosting with
`firebase emulators:start --only hosting`

The web application uses production authentication credentials, so you should be able to login normally.
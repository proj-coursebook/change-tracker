# Simple Example Usage For `@coursebook/change-tracker`

This is a minimal example showing how to use `@coursebook/change-tracker` package in a local project. The example demonstrates how to track changes to files and directories.

## Setup

```bash
npm install
```

## Run the Example

```bash
npm run start
``` 

## How does it work?

The `@coursebook/change-tracker` is a local package that is installed using the `file:` protocol; see the `dependencies` section in the `package.json` file:

```json
  "dependencies": {
    "@coursebook/change-tracker": "file:../../packages/change-tracker"
  },
```

If you want to use the package through NPM, you can do so by changing the `dependencies` section in the `package.json` file to:

```json
  "dependencies": {
    "@coursebook/change-tracker": "latest"
  },
```

Then install the dependencies again and it will be installed through NPM (assuming you have published the package to NPM).

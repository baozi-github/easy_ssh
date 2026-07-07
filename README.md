# XXLL SSH

Windows desktop SSH client built with Electron, React, Vite, and TypeScript.

## Features

- SSH connection tabs
- Saved connection history
- Local file browsing
- Windows installer generated with electron-builder

## Requirements

- Node.js 20 or newer
- npm
- Windows 10/11 for packaging the `.exe` installer

## Install dependencies

```powershell
npm install
```

## Run in development

```powershell
npm run dev
```

## Build the app

```powershell
npm run build
```

This command compiles the Electron main process and builds the Vite renderer app into `dist/`.

## Package Windows installer

```powershell
npm run dist
```

The installer will be generated in the `release/` directory:

```text
release/XXLL SSH-Setup-0.1.0.exe
```

## Download

Download the latest Windows installer from GitHub Releases:

[Download XXLL SSH for Windows](https://github.com/baozi-github/easy_ssh/releases/latest)

Direct download for version `0.1.0`:

[XXLL SSH-Setup-0.1.0.exe](https://github.com/baozi-github/easy_ssh/releases/download/v0.1.0/XXLL%20SSH-Setup-0.1.0.exe)

SHA256:

```text
2B7F1FEB03D66136FDE8D9ED63500F36394C28F66EEA8364A327FB88A9756382
```

## Project scripts

```text
npm run dev        Start the development app
npm run build      Build Electron main process and renderer
npm run dist       Build and package the Windows installer
npm run typecheck  Run TypeScript checks
npm start          Start Electron from the built files
```

## Notes

- `node_modules/`, `dist/`, `release/`, and log files are ignored by git.
- The installer is uploaded to GitHub Releases instead of being committed to git because GitHub blocks regular files larger than 100 MiB.

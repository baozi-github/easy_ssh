# EASY SSH

Windows desktop SSH client built with Electron, React, Vite, and TypeScript.

## Features

- SSH connection tabs
- Saved SSH connection history with groups
- Local terminal tabs with saved directory labels and groups
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
release/Easy-SSH-Setup-2.0.0.exe
```

## Download

Download the latest Windows installer from GitHub Releases:

[Download EASY SSH for Windows](https://github.com/baozi-github/easy_ssh/releases/latest)

Direct download for version `2.0.0`:

[Easy-SSH-Setup-2.0.0.exe](https://github.com/baozi-github/easy_ssh/releases/download/v2.0.0/Easy-SSH-Setup-2.0.0.exe)

SHA256:

```text
39510B8F50C15C2911CD3C9B8FE27100772409F6760A595DC566B76967D23DBE
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

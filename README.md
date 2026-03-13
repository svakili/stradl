# Stradl

[![CI](https://github.com/svakili/stradl/actions/workflows/ci.yml/badge.svg)](https://github.com/svakili/stradl/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

A single-user local task management app for multitasking. Tracks tasks with priorities (P0/P1/P2/Ideas), free-text statuses, blocking relationships, and staleness indicators. The same React UI can run as a browser/PWA build or as a packaged macOS desktop app with one-click updates.

> Project status: early-stage. Current contribution scope is intentionally narrow to docs and small fixes. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Prerequisites

- Node.js v18+

## Quick Start

```bash
npm install
npm run dev
```

This starts the Express API server on port 3001 and the Vite dev server on port 5173 with hot module replacement. Open http://localhost:5173.

## Platform Support

- Development workflow: cross-platform (macOS, Linux, Windows with Node 18+)
- Packaged desktop runtime: macOS-only
- Legacy LaunchAgent/runtime extras: macOS-only

## Production

```bash
npm run build
npm start
```

Builds the frontend and compiles the server TypeScript, then serves everything from http://localhost:3001.

## Desktop App (macOS)

Build a packaged desktop app:

```bash
npm run package:desktop
```

This produces:

- `release/Stradl-mac-arm64-v<version>.zip`
- `release/SHA256SUMS.txt`

Install the app by unzipping it and moving `Stradl.app` into `~/Applications`.

Desktop runtime notes:

- packaged desktop builds disable the PWA/service worker layer
- the Electron shell starts the same local Express API on a loopback port
- desktop self-update is only enabled for packaged apps installed in `~/Applications`
- update artifacts are downloaded from GitHub Releases and verified against `SHA256SUMS.txt`

## Moving Tasks Safely

The app keeps its canonical data file at:

`~/Library/Application Support/Stradl/tasks.json`

The Settings panel includes:

- `Export tasks` to download a full JSON backup
- `Import tasks` to replace the current data after creating an automatic backup

Automatic backups are written to:

`~/Library/Application Support/Stradl/backups/`

During desktop updates, Stradl creates a `pre-update` snapshot before replacing the app bundle.

## Releasing

This project includes one-command release scripts that:
- ensure you are on a clean `main` branch
- pull latest `origin/main`
- bump version + create tag via `npm version`
- build the packaged desktop zip and `SHA256SUMS.txt`
- push commit and tag
- create a GitHub release with generated notes and upload the desktop artifacts

Use one of:

```bash
npm run release:patch
npm run release:minor
npm run release:major
```

Notes:
- Requires `gh` authenticated (`gh auth status`)
- Release tags are `v<version>` and match `package.json` version
- Releases upload `release/Stradl-mac-*.zip` and `release/SHA256SUMS.txt`
- Intended for maintainers

## Legacy LaunchAgent Mode (macOS-only)

This mode keeps the old `http://localhost:3001` server running outside the packaged desktop app. It is still available for repo-based installs, but the packaged Electron app is now the primary runtime for one-click updates.

### Auto-Start on Login

```bash
npm run install-service
```

Creates a macOS Launch Agent that starts the production server on login and restarts it if it crashes. The app is then always available at http://localhost:3001.

To disable:

```bash
npm run uninstall-service
```

### Legacy In-App Self-Update

The Settings panel can check for updates and apply the latest `origin/main` automatically.

To enable one-click updates, set:

```bash
export STRADL_ENABLE_SELF_UPDATE=true
```

Requirements:
- `git` and `npm` must be available on PATH
- LaunchAgent must be installed (`npm run install-service`)
- Working tree must be clean (no uncommitted local changes)
- Update request must originate from localhost

When enabled, `Update now` runs:
- `git fetch origin main`
- `git pull --ff-only origin main`
- `npm ci --include=dev`
- `npm run build`
- `launchctl kickstart -k gui/$UID/com.stradl.server`

If preflight checks fail, the API returns a clear error:
- self-update disabled (`STRADL_ENABLE_SELF_UPDATE` not `true`)
- dirty repo (uncommitted changes)
- missing LaunchAgent plist
- another update already running

## Features

- **Priority tabs** -- Tasks (P0/P1/P2), Ideas (no priority), Blocked, Archive
- **Row colors** -- P0 red, P1 yellow, P2 green, Ideas gray, Stale purple
- **Inline editing** -- Click title or status to edit in place
- **Blocking** -- Block a task on another task or until a date; auto-unblocks when the condition is met
- **Staleness** -- Tasks not updated within the threshold turn purple
- **Vacation mode** -- Add offset hours so tasks don't go stale while you're away
- **Top N limiting** -- Only show the top N tasks in the Tasks tab
- **Task backup/import** -- Move tasks between installs or machines with explicit export/import
- **Desktop packaging** -- macOS Electron app with quit-install-relaunch updates
- **PWA** -- Browser install option for web/dev usage

## Contributing

- Contribution guide: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Code of conduct: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- Security policy: [SECURITY.md](./SECURITY.md)
- Support policy: [SUPPORT.md](./SUPPORT.md)

## Project Structure

```
server/           Express API + JSON file storage
electron/         Electron shell + desktop updater
src/              React frontend (Vite)
scripts/          release + packaging helpers
```

## Data Storage

By default on macOS, runtime data is stored in:

`~/Library/Application Support/Stradl/tasks.json`

You can override this with:

`STRADL_DATA_DIR=/custom/path`

Migration behavior:
- On first run with the new storage path, if no destination file exists, Stradl migrates from the newest legacy file:
  - `<project>/data/tasks.json`
  - `<project>/server/data/tasks.json`
- If the destination file already exists, Stradl keeps it and does not overwrite it.
- Persisted exports include `schemaVersion` so future migrations can be applied safely.

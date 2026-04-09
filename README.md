# Stradl

[![CI](https://github.com/svakili/stradl/actions/workflows/ci.yml/badge.svg)](https://github.com/svakili/stradl/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

A single-user local task management app for multitasking. Tracks tasks with priorities (P0/P1/P2/P3/Ideas), free-text statuses, blocking relationships, and staleness indicators. The same React UI can run as a browser/PWA build or as a managed local runtime on macOS with one-click updates.

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
- Managed local runtime installer: macOS-only
- Repo-based LaunchAgent mode: macOS-only

## Production

```bash
npm run build
npm start
```

Builds the frontend and compiles the server TypeScript, then serves everything from http://localhost:3001.

## Managed Runtime Installer (macOS)

Build the release artifacts:

```bash
npm run package:runtime
```

This produces:

- `release/Stradl-runtime-v<version>.tar.gz`
- `release/install-stradl.sh`
- `release/SHA256SUMS.txt`

Install from the release assets with:

```bash
bash install-stradl.sh
```

Installer/runtime notes:

- target machine must already have Node.js 18+ available on `PATH`
- runtime builds disable the PWA/service worker layer
- the installer places the managed runtime at `~/Library/Application Support/Stradl/runtime/current`
- the installer configures a macOS LaunchAgent so Stradl starts on login
- the installer opens Stradl in the default browser at `http://127.0.0.1:3001`
- in-app updates download the next runtime tarball from GitHub Releases and verify it against `SHA256SUMS.txt`

## Moving Tasks Safely

The app keeps its canonical data file at:

`~/Library/Application Support/Stradl/tasks.json`

The Settings panel includes:

- `Export tasks` to download a full JSON backup
- `Import tasks` to replace the current data after creating an automatic backup

Automatic backups are written to:

`~/Library/Application Support/Stradl/backups/`

During managed runtime updates, Stradl creates a `pre-update` snapshot before switching the active runtime.

## Releasing

This project includes one-command release scripts that:
- ensure you are on a clean `main` branch
- pull latest `origin/main`
- bump version + create tag via `npm version`
- build the managed runtime tarball, installer script, and `SHA256SUMS.txt`
- push commit and tag
- create a GitHub release with generated notes and upload the runtime artifacts

Use one of:

```bash
npm run release:patch
npm run release:minor
npm run release:major
```

Notes:
- Requires `gh` authenticated (`gh auth status`)
- Release tags are `v<version>` and match `package.json` version
- Releases upload `release/Stradl-runtime-v*.tar.gz`, `release/install-stradl.sh`, and `release/SHA256SUMS.txt`
- Intended for maintainers

## Repo-Based LaunchAgent Mode (macOS-only)

This mode keeps the old `http://localhost:3001` server running directly from a repo checkout. It is still useful for local development on a single machine, but the managed runtime installer above is now the primary install/update path.

### Auto-Start on Login

```bash
npm run install-service
```

Creates a macOS LaunchAgent that starts the production server on login and restarts it if it crashes. The app is then always available at http://localhost:3001.

To disable:

```bash
npm run uninstall-service
```

The repo-based LaunchAgent mode does not enable one-click self-update. The update UI is only active when Stradl is running from the managed runtime installer.

## Features

- **Priority tabs** -- Tasks (P0/P1/P2/P3), Ideas (no priority), Blocked, Archive
- **Row colors** -- P0 red, P1 yellow, P2 green, P3 blue, Ideas gray, Stale purple
- **Inline editing** -- Click title or status to edit in place
- **Blocking** -- Block a task on another task or until a date; auto-unblocks when the condition is met
- **Staleness** -- Tasks not updated within the threshold turn purple
- **Vacation mode** -- Add offset hours so tasks don't go stale while you're away
- **Top N limiting** -- Only show the top N tasks in the Tasks tab
- **Task backup/import** -- Move tasks between installs or machines with explicit export/import
- **Managed local runtime** -- macOS installer + LaunchAgent + browser-based one-click updates
- **PWA** -- Browser install option for web/dev usage

## Contributing

- Contribution guide: [CONTRIBUTING.md](./CONTRIBUTING.md)
- Code of conduct: [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md)
- Security policy: [SECURITY.md](./SECURITY.md)
- Support policy: [SUPPORT.md](./SUPPORT.md)

## Project Structure

```
server/           Express API + JSON file storage
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

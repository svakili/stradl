# Stradl

A single-user local task management web app for multitasking. Tracks tasks with priorities (P0/P1/P2/Ideas), free-text statuses, blocking relationships, and staleness indicators. Installable as a PWA.

## Prerequisites

- Node.js v18+

## Quick Start

```bash
npm install
npm run dev
```

This starts the Express API server on port 3001 and the Vite dev server on port 5173 with hot module replacement. Open http://localhost:5173.

## Production

```bash
npm run build
npm start
```

Builds the frontend and compiles the server TypeScript, then serves everything from http://localhost:3001.

## Auto-Start on Login (macOS)

```bash
npm run install-service
```

Creates a macOS Launch Agent that starts the production server on login and restarts it if it crashes. The app is then always available at http://localhost:3001.

To disable:

```bash
npm run uninstall-service
```

## Features

- **Priority tabs** -- Tasks (P0/P1/P2), Ideas (no priority), Blocked, Archive
- **Row colors** -- P0 red, P1 yellow, P2 green, Ideas gray, Stale purple
- **Inline editing** -- Click title or status to edit in place
- **Blocking** -- Block a task on another task or until a date; auto-unblocks when the condition is met
- **Staleness** -- Tasks not updated within the threshold turn purple
- **Vacation mode** -- Add offset hours so tasks don't go stale while you're away
- **Top N limiting** -- Only show the top N tasks in the Tasks tab
- **PWA** -- Installable from the browser for a native app feel

## Project Structure

```
server/           Express API + JSON file storage
src/              React frontend (Vite)
data/             Runtime data (tasks.json, created automatically)
scripts/          macOS Launch Agent install/uninstall helpers
```

## Data Storage

All data is stored in `data/tasks.json` -- no database required. The file is created automatically on first run.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server (Express on 3001 + Vite HMR on 5173) |
| `npm run build` | Build for production (Vite frontend + tsc server) |
| `npm start` | Run production build from port 3001 |
| `npx tsc --noEmit` | Type-check frontend code |
| `npx tsc -p tsconfig.server.json --noEmit` | Type-check server code |

| `node scripts/release.js <patch\|minor\|major>` | Create a full release (bump version, build, package runtime, push, create GitHub release with assets) |
| `npm run package:runtime` | Build and package runtime tarball + checksums into `release/` |

No test runner or linter is configured.

### Releasing

Use `node scripts/release.js patch` (or `minor`/`major`) from the `main` branch with a clean working tree. The script:

1. Bumps the version in `package.json` via `npm version`
2. Builds frontend and server (`npm run package:runtime`)
3. Generates `release/Stradl-runtime-v<version>.tar.gz`, `release/install-stradl.sh`, and `release/SHA256SUMS.txt`
4. Pushes the version commit and tag to `origin/main`
5. Creates a GitHub release with all three assets via `gh release create`

Do **not** create releases manually with `gh release create` — the assets will be missing. Always use the release script.

## Architecture

Stradl is a single-user local task management app with a React frontend and Express backend sharing a JSON file for storage.

### Data Flow

```
React Components → Custom Hooks (useTasks/useBlockers/useSettings)
    → API client (src/api.ts) → Express routes → JSON file (data/tasks.json)
```

- **Frontend** (Vite + React 18): SPA at `src/`, types mirrored in `src/types.ts`
- **Backend** (Express + tsx): API at `server/`, data types defined in `server/storage.ts`
- **Storage**: Single JSON file via `readData()`/`writeData()` in `server/storage.ts`
- **Dev proxy**: Vite proxies `/api` requests to Express on port 3001

### Tab System & Task Filtering

All tab filtering happens server-side in `server/routes/tasks.ts`:
- **Tasks**: Top N prioritized tasks (P0→P1→P2→P3, then by updatedAt)
- **Backlog**: Overflow beyond top N, same sort order
- **Ideas**: Tasks with `priority === null`
- **Blocked**: Tasks with unresolved blockers (auto-unblock runs on every GET)
- **Completed**: Tasks with `completedAt !== null`, sorted newest first
- **Archive**: Tasks with `isArchived === true`

The `getPrioritizedTasks()` helper in `server/routes/tasks.ts` is shared between Tasks and Backlog tabs.

### Key Patterns

- **Inline editing**: TaskRow uses local state (`useState`) for title/status editing, synced back via `onUpdate` prop
- **Status field**: Multi-line textarea with auto-resize, URL auto-linking via `src/utils/linkify.tsx`
- **Row coloring**: P0=red (`#fee2e2`), P1=yellow (`#fef9c3`), P2=green (`#dcfce7`), P3=blue (`#dbeafe`), Ideas=gray, Stale=purple (`#e9d5ff`)
- **Staleness**: `src/utils/staleness.ts` compares `updatedAt` against threshold + vacation offset
- **Counts refresh**: `App.tsx` loads counts for all 6 tabs after every mutation via `loadCounts()`

### TypeScript

Strict mode is enabled. `noUnusedLocals` and `noUnusedParameters` are enforced in the frontend tsconfig. The server has a separate `tsconfig.server.json` that compiles to `server/dist/`.

### PWA

Configured via `vite-plugin-pwa` in `vite.config.ts` with auto-update registration.

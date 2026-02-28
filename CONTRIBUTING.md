# Contributing to Stradl

Thanks for your interest in contributing.

## Project status and initial contribution scope

Stradl is early-stage and currently accepts:
- Documentation updates
- Small bug fixes
- Small UX polish fixes
- Small tests for existing behavior

For now, the following are out of scope unless explicitly requested by a maintainer:
- New major features
- Large refactors
- Architectural rewrites
- Release process changes

## Development setup

### Prerequisites
- Node.js 18+
- npm

### Run locally
```bash
npm install
npm run dev
```

The API runs on `http://localhost:3001` and the frontend dev server runs on `http://localhost:5173`.

## Validation before opening a PR

Run these commands before submitting:

```bash
npm run build
npm test
```

Or run:

```bash
npm run verify
```

## Branch, commit, and PR conventions

- Branch from `main`
- Use a short branch name like `docs/update-readme` or `fix/task-stale-label`
- Keep PRs focused and small
- Include test evidence in PR description (`npm run build` and `npm test` output summary)
- Link related issue(s) when applicable

## Pull request review expectations

- Maintainer first response target: within 3 business days
- Reviews focus on behavior, risk, and maintainability
- Maintainers may ask to split oversized PRs

## Platform support for contributors

Contributor workflow is cross-platform (macOS, Linux, Windows with a standard Node environment).

Operational runtime features are macOS-only:
- LaunchAgent auto-start scripts
- One-click self-update flow that restarts via `launchctl`

## Reporting bugs and requesting support

- Bug reports: use GitHub Issues
- Support and usage questions: see [SUPPORT.md](./SUPPORT.md)
- Security vulnerabilities: see [SECURITY.md](./SECURITY.md)

## Maintainer setup checklist (GitHub)

After publishing this repository, configure:

1. Branch protection for `main`
   - Require pull requests before merging
   - Require status checks to pass (`CI / test (18)`, `CI / test (20)`)
   - Dismiss stale pull request approvals when new commits are pushed
2. Label taxonomy
   - `type:bug`
   - `type:docs`
   - `good first issue`
   - `help wanted`
   - `needs-repro`
   - `scope:small-fix`

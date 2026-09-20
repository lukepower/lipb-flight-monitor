# Contributing

`main` is always deployable. Work on a short-lived branch and open a pull request against GitHub (`lukepower/lipb-flight-monitor`). Direct pushes and force-pushes to `main` are blocked.

## Setup

Needs Node 22+.

```bash
npm install
npm test
npm run dev
```

`npm install` also installs a Git **pre-push** hook (Husky) that runs `npm test` and `npm run lint`. A failing suite blocks the push.

## Checks

| Command | When |
| --- | --- |
| `npm test` | Unit tests (Vitest). Run locally; also on every push via the hook. |
| `npm run lint` | ESLint. Same hook. |
| `npm run typecheck` | `tsc --noEmit`. Required in CI. |
| `npm run validate:schedule` | SkyAlps JSON sanity. Required in CI. |
| `npm run test:e2e` | Playwright Chromium smokes against a production build. CI only on the hook path; run locally when you change pages or navigation. |
| `npm run build` | Production build. Required before local e2e if a server is not already running. |

GitHub Actions runs **quality** (lint, typecheck, Vitest, schedule) and **e2e** on every pull request. Both must be green before merge.

## Pull requests

1. Branch from `main` (`feature/…`, `fix/…`, `chore/…`).
2. Keep the change reviewable. Tests for new logic go next to the module (`*.test.ts`).
3. Push the branch to **GitHub** and open a PR targeting `main`.
4. Wait for CI. Merge when the checks pass.

Do not push to `main` on GitHub. The Cursor `origin` remote is a different host and does not enforce these rules.

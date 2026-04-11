# Wave 0 Implementation Review

Review date: 2026-04-10

Scope: Review of the implemented Wave 0 tasks from `docs/full-project-task-backlog.md`.

## Findings

### P0: Missing CI skeleton

`docs/full-project-task-backlog.md` requires OTH-014 to provide a CI skeleton that runs at least install, typecheck, lint, test, and build, with failures blocking merges. The repository currently has no tracked `.github/workflows/*` files; `git ls-files .github` is empty.

Impact: Wave 0 is not complete against the backlog acceptance criteria. Regressions in install/build/lint/typecheck/test can be merged without an automated gate.

References:

- `docs/full-project-task-backlog.md:52`

### P0: `packages/config` does not export shared configs

OTH-004 requires `packages/config` to output ESLint, Prettier, Vitest, Playwright, and TypeScript configuration. The current package only contains package metadata and has no config files or exports.

Impact: Later apps and packages cannot consume a single shared configuration package. Current ESLint, Prettier, Vitest, and Playwright configs are spread across root/app-level files instead of being provided by `@health-advisor/config`.

References:

- `docs/full-project-task-backlog.md:42`
- `packages/config/package.json:1`

### P1: Vitest coverage output is not configured

OTH-012 requires package-level and app-level unit tests to run and coverage output to be normal. Unit tests run, but coverage is not configured: only `apps/web/vitest.config.ts` exists as a minimal exclude config, agent-api has no tracked Vitest config, and package scripts run `vitest run` without coverage settings.

Impact: The test command passes, but the Wave 0 coverage acceptance criterion is not satisfied.

References:

- `docs/full-project-task-backlog.md:50`
- `apps/web/vitest.config.ts:1`

## Verification

Passed:

- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm format:check`
- `pnpm test:e2e`

Notes:

- `pnpm test:e2e` failed inside the default sandbox because Playwright needed local server and Chromium permissions. It passed when rerun outside the sandbox.
- `pnpm dev` could not start a new set of servers because ports 3000 and 3001 were already occupied by existing dev processes for this project. The existing processes returned expected runtime responses:
  - `GET http://localhost:3001/health` returned `{"status":"ok", ...}`.
  - `HEAD http://localhost:3000` returned `200 OK`.
- `pnpm build` passed, but Next.js warned that the Next.js ESLint plugin was not detected in the ESLint configuration. This is related to the shared config gap above.

## Open Question

`docs/superpowers/specs/2026-04-10-wave0-foundation-design.md` says CI is not configured for Wave 0, while `docs/full-project-task-backlog.md` requires OTH-014. This review uses the backlog as the acceptance baseline because the user asked to review Wave 0 of `docs/full-project-task-backlog.md`.

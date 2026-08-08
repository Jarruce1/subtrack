# E2E Critical Flow (Test-Plan Phase 2) — Plan Brief

**Change**: `e2e-critical-flow` · **Date**: 2026-08-09

## What & why

First Playwright suite, covering the two risks that need a real browser:
test-plan #4 (a new user cannot complete signup → add → dashboard; a gated
page stops redirecting) and #1 (totals/renewals drift apart across
dashboard views under mixed statuses/currencies). Internal boundaries
(auth, routing, API, DB) stay REAL — local Supabase stack; nothing external
to mock in this product.

## Shape

- `@playwright/test` + Chromium; `e2e/` as testDir; port 4406; project
  `setup` (UI signup of a fresh `e2e-*` user → `playwright/.auth/user.json`
  storageState) → project `chromium` (`dependencies: ["setup"]`).
- **Env swap**: `.dev.vars` and `.env` point at the CLOUD project and the
  Cloudflare adapter reads `.dev.vars` over any `env` passed to
  `webServer.command` — and Playwright 1.62 starts `webServer` BEFORE
  `globalSetup` (source-verified), so no `webServer` block at all:
  `globalSetup` preflights `127.0.0.1:54321`, backs both files up, writes
  local-stack values, then spawns and readiness-polls `astro dev --port
  4406` itself; `globalTeardown` kills the server and restores the files
  (backups are never overwritten, so a crashed run stays restorable).
- `seed.spec.ts`: the conventions exemplar (role/label locators, state
  waits, `Date.now()` ids, own cleanup, risk-tied name) — uses the
  storageState user.
- `north-star-flow.spec.ts` (risk #4): fresh-user UI signup (signup IS the
  flow under test) → add 43 PLN monthly, start 2026-07-15 → dashboard shows
  PLN 43.00 / PLN 516.00 + hand-derived next renewal; second test: signed-out
  `/dashboard` visit redirects to `/auth/signin`.
- `cross-view-consistency.spec.ts` (risk #1): own user via API signup, mixed
  fixture (monthly/yearly/custom-3; PLN+EUR; one paused) seeded via the
  app's API → dashboard totals = per-category sums per currency (hand
  constants), paused absent from renewals and sums; then Pause via the
  StatusActions UI → totals drop consistently.
- Verify: suite 2× green back-to-back; deliberate breaks (normalizeCost ×2
  → north-star red; drop paused-exclusion in summarizeActive → cross-view
  red), reverted. Docs: test-plan §3 Phase 2 → done, §6.3 cookbook,
  AGENTS.md "How we test" E2E line. `npm run test:e2e`. NOT in CI.

## Risks

- Env-swap teardown failure → backups + non-destructive setup + docs.
- Shared-user pollution → per-test users for exact-sum assertions; the
  storageState user is used only by the seed exemplar.

## Phases

1. Infra (deps, config, env swap, auth.setup, .gitignore, npm script)
2. Seed test (conventions exemplar)
3. Risk tests (#4 north-star + gating; #1 cross-view consistency)
4. Verify (2× runs + deliberate breaks) + docs (test-plan, AGENTS.md)

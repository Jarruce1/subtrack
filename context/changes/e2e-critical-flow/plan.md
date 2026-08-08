# E2E Critical Flow (Test-Plan Phase 2) Implementation Plan

## Overview

Stand up the project's first browser-level (Playwright) suite and use it
to pin the two `context/foundation/test-plan.md` risks that genuinely
need a real browser: **#4** (north-star flow regression: signup → add
subscription → dashboard; gated pages must redirect unauthenticated
visitors) and **#1** (cross-view consistency: totals and renewals must
not drift apart across the dashboard's views under mixed statuses and
currencies). Generation is governed by the `/10x-e2e` levers already in
CLAUDE.md (role-based locators, no `waitForTimeout`, independence +
cleanup) plus a `seed.spec.ts` exemplar created here.

## Current State Analysis

- 99 unit tests (`npm test`) + 22 integration tests
  (`npm run test:integration`); zero E2E, zero auth-flow coverage
  (test-plan test-base profile).
- Local Supabase stack running (API `127.0.0.1:54321`,
  `enable_confirmations = false` → UI signup yields a live session and a
  redirect to `/auth/confirm-email`).
- **Env gotcha**: `.dev.vars` AND `.env` point at the CLOUD Supabase
  project. With the Cloudflare adapter, `astro dev` resolves
  `astro:env/server` secrets from `.dev.vars` (platform proxy), which
  **overrides** any `env` passed via Playwright's `webServer` block.
  Passing local values through `webServer.env` alone does NOT work.
- Middleware gates `/dashboard` and `/subscriptions` (prefix) →
  `context.redirect("/auth/signin")` for anonymous visitors; API routes
  answer their own 401.
- UI surfaces the tests drive: `/auth/signup` (labels Email / Password /
  Confirm password; button "Create account"), `/subscriptions/new`
  (labels Name / Amount / Currency / Billing cycle / Start date /
  Category / Status; Radix selects are `combobox`es; button
  "Add subscription" → full navigation to `/dashboard`), `/dashboard`
  (regions "Active totals", "Costs by category", "Upcoming renewals",
  "Subscriptions"), `/subscriptions` (StatusActions buttons
  Pause/Resume/Cancel; Delete uses `window.confirm`).
- Money renders via `Intl.NumberFormat("en", { style: "currency" })`:
  `PLN 43.00`, `€3.33` (NBSP inside — Playwright text matching
  normalizes whitespace).

## Desired End State

- `npm run test:e2e` runs Playwright (Chromium) against a dev server on
  port 4406 wired to the LOCAL stack: setup project (fresh `e2e-*` user
  via UI signup → `playwright/.auth/user.json` storageState) + chromium
  project with 4 tests, all green, twice in a row (data isolation).
- Deliberate-break gate performed and documented: inverting each
  protected behavior in production code turns exactly the right test
  red; reverting restores green with an empty `git diff`.
- `.dev.vars`/`.env` byte-identical to their pre-run state after every
  run (cloud project never touched by tests).
- test-plan §3 Phase 2 → done; §6.3 cookbook filled; AGENTS.md "How we
  test" gains the E2E line. NOT wired into CI (that is test-plan
  Phase 4).

### Key Discoveries:

- `webServer.env` cannot beat `.dev.vars` (adapter reads the file), so
  the stable solution is a **file swap**: back up `.dev.vars` + `.env`,
  write local-stack values, restore afterwards. Swapping BOTH files
  sidesteps the dev-mode precedence question entirely. Backups are never
  overwritten (a crashed run stays restorable).
- **Playwright 1.62 starts `webServer` BEFORE `globalSetup`** (verified
  in `node_modules/playwright/lib/runner/index.js`:
  `createGlobalSetupTasks` = removeOutputDirs → plugin setup — where
  `WebServerPlugin.setup()` launches the process — → globalTeardown
  registration → globalSetup). A `webServer:` block would therefore boot
  the server with the CLOUD `.dev.vars` before any swap. Consequence:
  no `webServer` block — `globalSetup` itself performs preflight → swap
  → spawn `astro dev --port 4406` → readiness poll, and `globalTeardown`
  kills the server and restores the files. Same pattern, guaranteed
  ordering, and error paths clean up in our own try/catch.
- The local anon key is the standard supabase-demo JWT (public,
  committable); URL `http://127.0.0.1:54321`.
- Signup POST redirects to `/auth/confirm-email` with session cookies
  already set — `/dashboard` is reachable immediately after.
- Exact-sum assertions need an exclusive user: tests that assert totals
  create their own user (north-star: UI signup — it IS the flow under
  test; cross-view: POST `/api/auth/signup` — auth without UI); the
  storageState user backs the seed exemplar.

## What We're NOT Doing

- No CI wiring for E2E (test-plan §3 Phase 4 owns gates).
- No changes to production code (except transient, reverted
  deliberate-break edits — never committed).
- No cloud resources touched: tests run only against `127.0.0.1`;
  the env swap is what guarantees it.
- No vision/pixel assertions (functional risks only — test-plan §7).
- No mocking: this product has no expensive external API; auth, routing,
  API, and DB all stay real.
- No test-user teardown in local auth (users are `e2e-*`-prefixed;
  `npx supabase db reset` clears them; rows are cleaned per test).

## Implementation Approach

Playwright `@playwright/test` + Chromium only. `e2e/` as testDir.
`globalSetup` preflights the local stack (fail fast when Docker is
down), swaps env files; `webServer` starts `npx astro dev --port 4406`;
`globalTeardown` restores env files. Oracles are hand-derived from PRD
Business Logic §1–§4 and written as constants (or a tiny in-test
day-of-month helper for the renewal date) — never imported from
`src/lib/billing.ts`.

## Phase 1: Playwright infrastructure

### Overview

Deps, config with setup/chromium projects, env swap, storageState auth,
gitignore, npm script.

### Changes Required:

#### 1. `package.json` / lockfile

**Intent**: The runner and the gate command.
**Contract**: `npm install -D @playwright/test`;
`"test:e2e": "playwright test"`; `npx playwright install chromium`.

#### 2. `playwright.config.ts` (new)

**Intent**: One config encoding the whole local-stack pattern.
**Contract**: `testDir: "e2e"`; projects `setup`
(`testMatch: /auth\.setup\.ts/`) and `chromium` (Desktop Chrome,
`storageState: "playwright/.auth/user.json"`,
`dependencies: ["setup"]`); `baseURL: "http://localhost:4406"`;
`globalSetup`/`globalTeardown` from `e2e/support/`; NO `webServer` block
(Key Discovery #2 — it would boot before the env swap); list reporter.

#### 3. `e2e/support/env.ts` + `global-setup.ts` + `global-teardown.ts` (new)

**Intent**: The documented `.dev.vars`/`.env` swap + self-managed dev
server (Key Discoveries #1–#2).
**Contract**: `env.ts` holds constants (port 4406, local URL + standard
supabase-demo anon key — public) and swap/restore helpers (backup to
`*.e2e-backup`, never overwrite an existing backup — crashed-run
originals win; restore moves backups back). `global-setup.ts`: assert
`GET 127.0.0.1:54321/auth/v1/health` answers (diagnostic error
otherwise); refuse to run if port 4406 already answers (a foreign server
would carry cloud env); swap; spawn `node_modules/.bin/astro dev --port
4406` (detached, log to `test-results/astro-dev.log`); poll `/` until
ready; on any failure kill + restore before rethrowing.
`global-teardown.ts`: kill the server process group, restore files.

#### 4. `e2e/auth.setup.ts` (new)

**Intent**: storageState auth — tests never sign in through the UI.
**Contract**: UI signup of `e2e-shared-<Date.now()>@example.com` (fresh
per run), wait for `/auth/confirm-email`, `context.storageState({ path:
"playwright/.auth/user.json" })`.

#### 5. `.gitignore`

**Intent**: Runtime artifacts never committed.
**Contract**: add `playwright/.auth/`, `test-results/`,
`playwright-report/`, `.dev.vars.e2e-backup`, `.env.e2e-backup`.

### Success Criteria:

#### Automated Verification:
- [ ] `npm run test:e2e` runs the setup project green (storageState file
      created); `.dev.vars`/`.env` byte-identical after the run
- [ ] `npm test` still 99; `npm run lint`, `npx astro check`,
      `npm run build` clean

#### Manual Verification:
- [ ] none

## Phase 2: Seed test (conventions exemplar)

### Overview

`e2e/seed.spec.ts` — the quality lever every generated test is modeled
on (CLAUDE.md `/10x-e2e`).

### Changes Required:

#### 1. `e2e/seed.spec.ts` (new)

**Intent**: Demonstrate all four seed patterns on this app's real
routes: role/label locators, full setup–action–assert–cleanup cycle in
one test, state waits (`waitForURL`, `toBeVisible`), unique
`Date.now()` data, risk-tied name.
**Contract**: storageState user; create `e2e-seed-<ts>` via
`/subscriptions/new` UI; assert it renders on `/subscriptions` and
survives `page.reload()` (SSR persistence); cleanup via the UI Delete
(accept the `window.confirm` dialog); assert the row is gone.

### Success Criteria:

#### Automated Verification:
- [ ] `npx playwright test seed` green
- [ ] lint / astro check / build clean

#### Manual Verification:
- [ ] none

## Phase 3: Risk tests (#4 north-star, #1 cross-view)

### Overview

One reviewed test per risk (plus the gating check risk #4 names),
each through PLAN → GENERATE → REVIEW (five anti-patterns) → VERIFY.

### Changes Required:

#### 1. `e2e/north-star-flow.spec.ts` (new — risk #4)

**Intent**: Prove a brand-new user completes signup → add → dashboard
with hand-verifiable numbers, and gating still redirects.
**Contract**: file-level empty storageState. Test A: UI signup
(`e2e-north-star-<ts>@example.com` — signup IS the flow, documented
exception to auth-without-UI), add 43 PLN monthly starting 2026-07-15
via the form; assert Active totals shows `PLN 43.00` and `PLN 516.00`
(hand: 43 × 12 = 516, PRD §1) and the card + Upcoming renewals show the
next day-15 occurrence ≥ today (tiny in-test helper, PRD §2 — NOT
imported from billing.ts); cleanup via UI delete. Test B: signed-out
visit to `/dashboard` → `waitForURL(**/auth/signin**)` + signin heading
visible.

#### 2. `e2e/cross-view-consistency.spec.ts` (new — risk #1)

**Intent**: Prove the active-only aggregation rule holds identically
across Active totals, Costs by category, and Upcoming renewals, before
and after a UI status change.
**Contract**: own user via `POST /api/auth/signup` (API = auth without
UI); seed via `POST /api/subscriptions`: Streaming 30 PLN monthly
active, News & Media 120 PLN yearly active, Software 9.99 EUR custom-3
active, Health & Fitness 60 PLN monthly paused — all starting today.
Hand oracles (PRD §1/§3): PLN 40.00 / 480.00 (30+10 / 360+120), EUR
3.33 / 39.96; category rows News & Media PLN 10.00/120.00, Streaming
PLN 30.00/360.00, Software €3.33/€39.96; Health & Fitness absent
everywhere (paused ∉ sums: total is 40, not 100); paused name absent
from Upcoming renewals; active names present. Then Pause the Streaming
sub via StatusActions on `/subscriptions` → dashboard PLN drops to
10.00 / 120.00 in BOTH totals and category views, name leaves renewals,
EUR untouched. Cleanup: `afterEach` DELETEs seeded rows via API.

### Success Criteria:

#### Automated Verification:
- [ ] `npm run test:e2e` — 4 tests green
- [ ] Both specs pass the five-anti-pattern review (documented in
      Progress)
- [ ] lint / astro check / build clean

#### Manual Verification:
- [ ] none

## Phase 4: Verification gates + docs

### Overview

Prove the suite is isolated and can fail; then document the pattern.

### Changes Required:

#### 1. Isolation gate (no file changes)

**Intent**: Unique-id + cleanup discipline actually holds.
**Contract**: `npm run test:e2e` twice back-to-back, both green.

#### 2. Deliberate-break gate (transient edits, reverted — never committed)

**Intent**: Assertions protect the named risks, not decoration.
**Contract**: (a) `normalizeCost` monthly → `amount * 2`: north-star
test (and cross-view) MUST fail; revert. (b) remove the
`status !== "active"` exclusion in `summarizeActive`: cross-view test
MUST fail (paused leaks into sums); revert. `git diff` empty after each
revert; suite green again.

#### 3. `context/foundation/test-plan.md`

**Intent**: Phase 2 → done; cookbook filled.
**Contract**: §3 row 2 Status `done` + change folder; §4 e2e row updated;
§6.3 gains the pattern (seed, storageState, env swap, per-test users,
oracle rule, run command, data policy); §6.5 note on the `.dev.vars`
gotcha.

#### 4. `AGENTS.md`

**Intent**: Contributors discover the E2E gate without the test plan.
**Contract**: one **E2E** bullet in "How we test" (command, local stack
prereq, storageState pattern, not-in-CI note).

### Success Criteria:

#### Automated Verification:
- [ ] `npm run test:e2e` 2× green; `npm test` 99 green;
      lint / astro check / build clean

#### Manual Verification:
- [ ] Break gate: each inverted behavior reddens the RIGHT test; reverts
      leave `git diff` empty (recorded in Progress)

## Testing Strategy

The change IS the tests. Meta-verification: the Phase 4 double-run
(isolation) and deliberate-break gates (assertion power), mirroring the
Phase-1-change pattern that proved the integration suite can fail.

## Performance Considerations

Dev-server cold start dominates (~10–20 s); 4 tests keep the whole gate
under ~2 min — acceptable for a local ad hoc gate. E2E budget stays
tight per test-plan §1 (cost × signal): one test per risk + gating +
seed.

## Migration Notes

None — no schema or production-code changes. `.dev.vars`/`.env` are
mutated only for the duration of a run and restored by teardown; if a
run is killed hard, restore manually from `*.e2e-backup`.

## References

- `context/foundation/test-plan.md` §2 #4/#1, §3 Phase 2, §6.3
- CLAUDE.md `/10x-e2e` section + `.claude/skills/10x-e2e/references/`
- `context/changes/testing-api-rls-integration/` (Phase 1 pattern)
- PRD Business Logic §1–§4 (oracles)

## Progress

### Phase 1: Playwright infrastructure

#### Automated
- [x] 1.1 deps + config + env swap + auth.setup + gitignore + script;
      setup green; env files restored (checksums verified); e2e user
      confirmed in LOCAL auth.users; unit(99)/lint/check/build clean.
      Two discoveries: Playwright starts webServer BEFORE globalSetup
      (server lifecycle moved into globalSetup) and React islands need a
      hydration wait before form fills (e2e/support/hydration.ts) — 7987ef1

### Phase 2: Seed test (conventions exemplar)

#### Automated
- [x] 2.1 seed.spec.ts green (first run); lint + unit(99) clean; env
      files restored after run — aa75347

### Phase 3: Risk tests

#### Automated
- [x] 3.1 north-star-flow.spec.ts (risk #4: flow + gating) green.
      Note: `PLN 43.00` plain-space assertions match — Playwright text
      matching normalizes the NBSP Intl emits (plan-review O1 resolved)
- [x] 3.2 cross-view-consistency.spec.ts (risk #1) green. Discovery:
      Astro's CSRF checkOrigin 403s form-encoded API posts without an
      Origin header — the API-signup helper sends `origin: BASE_URL`
      (same value a browser sends; the protection stays exercised)
- [x] 3.3 five-anti-pattern review (all specs + auth.setup):
      1. hallucinated assertion — none: oracles are hand-derived PRD
         constants asserted on rendered text; absence asserted with
         toHaveCount(0); power proven by the Phase 4 break gate.
      2. brittle selector — none user-facing (getByRole/Label/Text
         only; grep for page.locator/css/xpath in specs: 0 hits).
         Accepted exception: hydration helper waits on
         `astro-island[ssr]` detaching — infrastructure readiness
         state, never element location; documented in the helper.
      3. shared state — none: per-test users (UI signup in north-star
         — the flow under test; API signup in cross-view), storageState
         user only backs the seed exemplar; suite passes fully
         parallel (2 workers).
      4. waitForTimeout — zero; waits are waitForURL / toBeVisible /
         toHaveCount / toContainText / toHaveValue.
      5. no cleanup — cross-view cleans in afterEach (runs on
         failure); seed/north-star clean via the UI delete they also
         exercise; unique per-test users make any crash leftovers
         collision-free; `e2e-` prefix marks users for db reset.

### Phase 4: Verification gates + docs

#### Automated
- [ ] 4.1 suite 2× green; all gates clean; docs updated (test-plan §3/§6,
      AGENTS.md)
#### Manual
- [ ] 4.2 deliberate-break gate: right test red per break, reverted,
      git diff empty, green again

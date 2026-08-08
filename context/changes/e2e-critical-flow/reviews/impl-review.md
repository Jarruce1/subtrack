<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: E2E Critical Flow (Test-Plan Phase 2)

- **Plan**: context/changes/e2e-critical-flow/plan.md
- **Scope**: Full plan (Phases 1–4)
- **Date**: 2026-08-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- **Plan drift**: every planned artifact exists as specified
  (`playwright.config.ts`, `e2e/support/{env,global-setup,global-teardown}.ts`,
  `e2e/auth.setup.ts`, `e2e/{seed,north-star-flow,cross-view-consistency}.spec.ts`,
  `.gitignore` entries, `test:e2e` script, test-plan §3/§4/§6.3/§6.5,
  AGENTS.md bullet). Two in-flight discoveries were folded back into the
  plan BEFORE implementation (webServer-before-globalSetup ordering;
  hydration wait) — no undocumented drift. One planned-but-added file:
  `e2e/support/hydration.ts` (EXTRA, benign, documented in Progress 1.1).
- **Scope discipline**: `git diff <base>..HEAD --stat -- src/ supabase/`
  = 0 lines — production code and migrations untouched, exactly per "What
  We're NOT Doing" (deliberate breaks were transient and never committed).
  No CI files touched. No cloud reference or privileged key in any
  committed test file (grep for the cloud host / `service_role` /
  `sb_secret`: 0 hits; the committed anon key is the public supabase-demo
  JWT every local stack prints).
- **Success criteria**: suite 2× green back-to-back (twice verified —
  once in Phase 4, once after the F1 fix); unit 99 green; lint 0
  problems; `astro check` 0 errors/0 warnings; build clean;
  `.dev.vars`/`.env` checksums identical after every run; break gate
  reddened exactly the owning tests (Progress 4.2).
- **Oracles**: every asserted number traces to a PRD §1–§3 hand
  derivation in a comment; `expectedNextMonthlyRenewal` re-derives the
  §2 rule independently (Date.UTC days-in-month, not billing.ts's table)
  — no import from the code under test anywhere in `e2e/`.

## Findings

### F1 — Teardown did not wait for the dev server to exit

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: e2e/support/global-teardown.ts
- **Detail**: SIGTERM was fire-and-forget; an immediately following run
  could hit the port-in-use guard while the old server was still dying
  (fails safe — a clear error, never cloud contamination — but a false
  failure).
- **Fix**: poll `kill(pid, 0)` up to 5 s after SIGTERM, escalate to
  SIGKILL on the process group, then restore env files. Re-verified: two
  consecutive `npm run test:e2e` runs green, lint clean.
- **Decision**: FIXED

### F2 — In-body cleanup in seed/north-star skips on mid-test failure

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: e2e/seed.spec.ts, e2e/north-star-flow.spec.ts
- **Detail**: Both clean up through the UI delete at the end of the test
  body (deliberate — deleting through the UI is itself exercised
  behavior). A mid-test failure leaves the row behind — on a user that is
  unique to that test/run, so no future run can collide (the anti-pattern
  #5 concern is collision, not residue). Cross-view, whose user could
  accumulate rows across its own retries, uses `afterEach` instead.
- **Fix**: none required; policy documented in test-plan §6.3.
- **Decision**: ACCEPTED

### F3 — `.env` swap hides `SUPABASE_DB_PASSWORD` during a run

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: e2e/support/env.ts
- **Detail**: While an E2E run is active, `.env` holds only the local
  URL/key, so a *concurrent* `npm run test:integration` or tool reading
  `SUPABASE_DB_PASSWORD` would not see it. Restoration is byte-identical
  after the run (checksum-verified every run in Phase 4). Solo-project
  concurrency risk is negligible; the alternative (partial rewrite
  preserving unrelated keys) adds parsing complexity for no present
  consumer.
- **Fix**: none now; revisit if a tool ever reads `.env` mid-run.
- **Decision**: ACCEPTED

## Summary

Implementation matches the reviewed plan phase-for-phase, the two risk
tests demonstrably fail when their risks materialize, production code is
untouched, and the environment-swap machinery leaves the working tree
byte-identical. One reliability warning found and fixed during triage
(teardown exit wait). **APPROVED**.

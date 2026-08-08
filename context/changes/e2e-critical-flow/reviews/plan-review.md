<!-- PLAN-REVIEW-REPORT -->
# Plan Review: E2E Critical Flow (Test-Plan Phase 2)

- **Plan**: context/changes/e2e-critical-flow/plan.md
- **Mode**: Deep
- **Date**: 2026-08-09
- **Verdict**: SOUND
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

6/6 paths ✓ (`src/pages/auth/signup.astro`, `src/pages/subscriptions/new.astro`,
`src/pages/dashboard.astro`, `src/pages/subscriptions/index.astro`,
`src/middleware.ts`, `.dev.vars`), 6/6 symbols ✓ (`PROTECTED_ROUTES` incl.
`/dashboard`; signup POST → `/auth/confirm-email` redirect with session
cookies; `enable_confirmations = false` in `supabase/config.toml`;
`formatMoney` via `Intl("en")`; StatusActions "Pause" without confirm /
Delete with `window.confirm`; `SUBSCRIPTION_CATEGORIES` values used by the
fixture are the real enum). Oracle spot-check by hand: 43×12=516;
30+120/12=40; 9.99/3=3.33, 9.99×12/3=39.96 — all per PRD §1/§3, no import
from `billing.ts`. Brief↔plan consistent. Local stack verified running.

## Findings

### O1 — NBSP inside Intl currency output is an assumption until first run

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 assertions
- **Detail**: `Intl.NumberFormat("en", …)` for PLN emits `PLN 43.00`.
  Playwright's `toContainText`/`getByText` normalize whitespace (incl.
  NBSP), so plain-space expectations should match — but this is verified
  empirically in Phase 2/3 first runs, and regex fallbacks are the
  documented escape hatch if a Chromium locale build differs.
- **Fix**: none needed up front; verify on first green run.
- **Decision**: ACCEPTED (verified during implementation)

### O2 — Hard-killed run leaves swapped env files

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 env swap
- **Detail**: If the runner dies before `globalTeardown`, `.dev.vars`/
  `.env` remain pointed at the local stack. Plan mitigates: backups are
  never overwritten by a subsequent setup (crashed-run originals win) and
  Migration Notes document the manual restore. Failure mode is benign
  (dev points at local, not the reverse).
- **Fix**: covered by the plan's backup-preservation rule.
- **Decision**: ACCEPTED

### O3 — `reuseExistingServer: false` conflicts with a manually running dev server

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 1 `playwright.config.ts`
- **Detail**: A dev server already listening on 4406 will fail the run
  instead of being silently reused with CLOUD env — that is the safe
  direction (an honest error beats tests mutating the cloud project).
  Port 4406 is non-default precisely to avoid colliding with a routine
  `npm run dev` (4321).
- **Fix**: none — behavior is intentional; the error message names the port.
- **Decision**: ACCEPTED

## Summary

The plan follows the proven Phase-1-change shape (infra → suites →
adversarial gate → docs), keeps E2E budget tight (4 tests for 2 risks +
gating + seed), grounds every UI claim in the actual components, and
resolves the one real environmental hazard (.dev.vars precedence) with a
documented, restorable file swap. No phase is removable without losing
the end state. **SOUND** — safe to implement.

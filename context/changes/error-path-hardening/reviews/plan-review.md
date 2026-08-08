<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Error-Path & Secret Hardening

- **Plan**: context/changes/error-path-hardening/plan.md
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

7/7 paths ✓ (signout.ts, dashboard.astro, src/tests/integration/, package.json,
test-plan.md, lessons.md, AGENTS.md), 4/4 symbols ✓ (`PGRST116` at
src/lib/services/subscriptions.ts:14; `createClient` seam imported by every
route; every `astro` import in src/pages/api is `import type` — routes are
invokable under Vitest; `z.uuid()` already in use, zod 4). brief↔plan ✓.
Progress↔Phase consistency ✓ (4 phases mirrored, plain bullets in Phase
blocks, single `## Progress`). Riskiest-claims verification: (1) route
modules carry no runtime Astro imports — confirmed by grep; (2) lint
coverage of a new `scripts/*.mjs` — confirmed safe (`allowJs: true` +
`include: **/*` in astro strict tsconfig, `no-console` is warn-level and
`npm run lint` has no --max-warnings); (3) lefthook cannot run the red
integration suite (unit config excludes `src/tests/integration/**`) —
confirmed in vitest.config.ts; (4) `dist/` splits into `client/` +
`server/` under the Cloudflare adapter — confirmed on the existing build
output, and the scanner exits 1 loudly if the layout changes.

## Findings

### F1 — Red suite exists on main between p1 and p2 commits

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 → Phase 2 boundary
- **Detail**: The failing-first commit (p1) leaves `npm run test:integration`
  red until p2 lands. Integration is a local-only gate (not CI), the two
  commits land in the same session, and the red state is the documented
  evidence artifact — but anyone bisecting later hits a red suite at p1.
- **Fix**: None needed beyond what the plan already does: p1 commit message
  says the suite is deliberately red, p2 follows immediately.
- **Decision**: ACCEPTED

### F2 — Sign-out failure with no session bounces via /dashboard to /auth/signin

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — signout.ts contract
- **Detail**: If `signOut()` errors because there is no session at all
  (e.g. AuthSessionMissingError on a stray POST), the fix redirects to
  `/dashboard`, whose middleware bounces the anonymous visitor to
  `/auth/signin`. Two hops, but never a fake success and never an error
  shown to someone who is in fact signed out.
- **Fix**: Accept — the extra hop is harmless and special-casing error
  types would add branching for no user-visible gain.
- **Decision**: ACCEPTED

### F3 — Scanner value-collection can be empty in a clean checkout

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — scripts/scan-secrets.mjs
- **Detail**: With no `.env`/`.dev.vars` and no env vars, the value scan
  has nothing to look for and only the pattern scan runs. The plan already
  requires a non-failing warning in that case so a hollow scan is visible.
- **Fix**: Covered by the plan's warning requirement; keep it.
- **Decision**: ACCEPTED

## Triage summary

All three findings are observations accepted with rationale recorded above
(autonomous run — no interactive triage). Verdict stands: **SOUND**, safe
to implement.

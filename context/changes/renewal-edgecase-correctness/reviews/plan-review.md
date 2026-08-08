<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Month-End and Leap-Year Renewal Correctness (S-02)

- **Plan**: context/changes/renewal-edgecase-correctness/plan.md
- **Mode**: Deep
- **Date**: 2026-08-08
- **Verdict**: SOUND (after fixes — initial verdict REVISE on F1/F2)
- **Findings**: 1 critical (fixed), 1 warning (fixed), 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS (after F2 fix) |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS (after F1 fix) |

## Grounding

7/7 paths ✓ (`package.json`, `src/lib/billing.ts`, `.github/workflows/ci.yml`, `src/pages/dashboard.astro`, `eslint.config.js`, `tsconfig.json`, `src/lib/validation/subscriptions.ts`; `vitest.config.ts` correctly absent — planned as new), 3/3 symbols ✓ (`nextRenewalDate`, `summarizeActive`, `occurrenceAtMonths` at billing.ts:43/79/160; ci.yml lint:20 → build:21 confirms step-placement claim), brief↔plan ✓ (phases, decisions, scope match).

External-claim verification (npm registry, 2026-08-08): `vitest` dist-tag latest = **4.1.10** ✓; `vitest@4.1.10` engines include node ^22 ✓ (repo: 22.14.0); `@fast-check/vitest@0.4.1` peerDependencies = `vitest: ^4.1.0` ✓; `fast-check` latest = **4.9.0** ✓. Codebase claims carry fresh file:line evidence from `research.md` (same session); PRD worked examples in Phase 2 hand-checked (2028 is a leap year; custom-3 chain Jan 31 → Apr 30 → Jul 31 → Oct 31; F1 fixture `0099-01-01` → `2026-08-13` matches the impl-review's empirical record). No separate verification sub-agent was spawned: the riskiest claims were external (verified above via registry) and the internal map was produced minutes earlier by a dedicated read-only agent.

## Findings

### F1 — Placeholder "(none)" bullets under Manual Verification break the Progress contract

- **Severity**: ❌ CRITICAL
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 1 and Phase 3 — Manual Verification
- **Detail**: Phases 1 and 3 listed `- (none — …)` as a bullet under `#### Manual Verification:`, with no matching `- [ ] N.M` row in `## Progress`. Per `references/progress-format.md` every Success Criteria bullet must have a Progress counterpart; a placeholder bullet is a parse hazard for `/10x-implement` and mechanical drift.
- **Fix**: Replace the placeholder bullets with plain prose ("None — …") so the sections carry no unmatched bullets; Phase 3's Manual section gained a real criterion via F2 instead.
- **Decision**: FIXED

### F2 — Desired End State promises a mutation check no phase delivers

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: End-State Alignment
- **Location**: Desired End State — "Verify" line
- **Detail**: The end state claimed "mutating any clamping/anchor line in billing.ts makes the suite fail", but no success criterion exercised that — a promise gap: all criteria could pass while the harness never proved it bites.
- **Fix**: Added Phase 3 manual criterion (and Progress row 3.4): temporarily invert the clamp (`Math.min` → `Math.max` in `occurrenceAtMonths`, `src/lib/billing.ts:164`), observe multiple failures, revert; reworded the Desired End State Verify line to reference it.
- **Decision**: FIXED

### F3 — CI-step grep criterion does not verify ordering

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Automated Verification (criterion 2.3)
- **Detail**: `grep -q "npm test" .github/workflows/ci.yml` passes regardless of where the step lands, though the criterion title says "ordered after lint". Ordering is specified in the change Contract and visually confirmed by manual criterion 2.4 (CI run shows test green before build).
- **Fix**: None required; ordering is double-covered by the Contract and criterion 2.4.
- **Decision**: ACCEPTED

### F4 — Wall-time bound "~10 s locally" is machine-dependent

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Automated Verification (criterion 3.2)
- **Detail**: A wall-clock bound is not a deterministic gate across machines. It is a smoke bound guarding against pathological property configuration (expected total ~700 pure-arithmetic runs, sub-second), not a CI gate — CI gates on exit code only.
- **Fix**: None; treat as an order-of-magnitude sanity bound.
- **Decision**: ACCEPTED

## Triage summary

- Fixed: F1, F2 (2)
- Accepted: F3, F4 (2)
- ► Verdict after fixes: SOUND

<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Upcoming Renewals List (S-05)

- **Plan**: context/changes/upcoming-renewals-list/plan.md
- **Mode**: Deep
- **Date**: 2026-08-08
- **Verdict**: SOUND
- **Findings**: 0 critical, 0 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS |
| Plan Completeness | PASS |

## Grounding

6/6 paths ✓ (`src/types.ts`, `src/lib/billing.ts`, `src/lib/billing.test.ts`, `src/pages/dashboard.astro`, `src/lib/format.ts`, `vitest.config.ts`), symbols ✓ (`parseIsoDate`/`formatIsoDate`/`addDays` at billing.ts:126/140/154 — module-private, same-file access confirmed; `summarizeActive` precedent at :79; dashboard sections at dashboard.astro:82-106/108-144), brief↔plan ✓ (phases, decisions, scope match).

Blast-radius sweep: `@/lib/billing` is imported only by `src/pages/dashboard.astro:5`, `src/lib/billing.test.ts:6`, `src/lib/billing.properties.test.ts:11` — all inside plan scope; adding an export breaks no caller. Window arithmetic hand-checked: 2026-08-08 + 30 = 2026-09-07 (day-30 in) / 2026-09-08 = day 31 (out); 2026-01-31 + 30 = 2026-03-02 across a 28-day February. Monthly anchor 2026-08-07 viewed 2026-08-08 → next 2026-09-07 confirms the upper-bound fixture. Sort stability: ES2019 guarantees stable `Array.prototype.sort` (Node 22 target). Progress↔Phase contract checked: one `## Progress`, both phase headings mirrored, every Success Criteria bullet has a numbered row, no checkboxes in phase blocks.

Consistency scans: no contradiction between Current State and phases; every Desired End State capability has a backing phase (function → Phase 1, section + both empty states + smoke → Phase 2); no "NOT doing" item reappears in a phase; no contract surfaces file in repo (skip).

## Findings

### F1 — `nextRenewalDate` computed twice per active subscription on the dashboard

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 2 — Dashboard section
- **Detail**: `dashboard.astro` already computes each active row's renewal date for the Subscriptions cards (rows map, :22-34); `upcomingRenewals` recomputes it internally. For ≤ 30 rows of integer date math this is negligible, and sharing the per-row result would couple the pure §4 function to the page's row shape or force a precomputed-input contract.
- **Fix**: None — accept the recompute; keeping `upcomingRenewals(subscriptions, today)` self-contained matches the `summarizeActive` precedent and keeps S-04/S-06 reuse trivial.
- **Decision**: ACCEPTED — self-contained pure function wins over micro-optimization at PRD scale (autonomous triage, parent-mandated).

## Triage summary

Fixed: — (0) · Accepted: F1 (1) · Verdict: SOUND — safe to implement, no plan edits required.

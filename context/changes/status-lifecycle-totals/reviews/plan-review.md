<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Status Lifecycle Quick Actions (S-04)

- **Plan**: `context/changes/status-lifecycle-totals/plan.md`
- **Mode**: Deep (single-session; grounding + direct codebase verification, no sub-agents — 3-file slice)
- **Date**: 2026-08-09
- **Verdict**: SOUND
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | PASS (2 observations) |
| Plan Completeness | PASS |

## Grounding

5/5 existing paths ✓ (`index.astro`, `DeleteSubscriptionButton.tsx`, `[id].ts`,
`validation/subscriptions.ts`, `billing.ts`; `lifecycle.ts`/`StatusActions.tsx`
correctly marked new), 3/3 symbols ✓ (`summarizeActive`/`summarizeByCategory`/
`upcomingRenewals` at billing.ts:88/120/148; `status: statusSchema` at
validation/subscriptions.ts:128; `subscriptionUpdateSchema` consumed at
[id].ts:46), brief↔plan ✓. Astro `security.checkOrigin` default `true`
verified in `node_modules/astro/dist/core/config/schemas/base.js:56` — the
plan's "curl smoke must send an `Origin` header" claim is accurate.

Key claim checks:

- "`{ status: 'paused' }` alone passes `subscriptionUpdateSchema`" — confirmed:
  `.partial()` + non-empty refine passes; the cycle/interval `superRefine` only
  fires when either of those keys is present. No API change needed.
- "All three aggregations already active-only" — confirmed at
  billing.ts:91 (`status !== "active"` skip), :132 (delegation), :152 (same
  skip). Adding aggregation tests would duplicate existing coverage.
- Blast radius: no other callers depend on the list page's row markup; the new
  module has no importers yet. No unlisted files affected.

## Findings

### F1 — "All row actions disabled" overstates the pending-state scope

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — StatusActions island, Intent
- **Detail**: The island can only disable its own buttons; `DeleteSubscriptionButton`
  is a separate island and stays clickable while a status PATCH is in flight.
  A concurrent delete+patch race is harmless (RLS-scoped row, full navigation
  follows, loser gets 404 → reload), but the plan text shouldn't promise a
  cross-island disable the architecture can't deliver.
- **Fix**: Reword to "both status buttons in the row disabled while a request is
  pending" and note the cross-island race is accepted (harmless, 404 → reload).
- **Decision**: FIXED — plan wording tightened 2026-08-09

### F2 — `outline` Button variant on a hand-rolled dark page

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — StatusActions island, Intent
- **Detail**: The list page's action cluster mixes raw-class `<a>` buttons with
  shadcn `Button` (destructive) already; `outline` uses theme tokens
  (`bg-background`) that render acceptably under the page's `dark` class (same
  coexistence as the delete button). Purely a visual-polish note.
- **Fix**: None needed; Phase 2 manual check 2.6 covers the visual pass.
- **Decision**: ACCEPTED — verified during smoke

## Triage summary

Fixed: F1 (1) · Accepted: F2 (1)

► Verdict after triage: SOUND — safe to implement.

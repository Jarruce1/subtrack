<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: First Subscription to Dashboard (S-01)

- **Plan**: context/changes/first-subscription-dashboard/plan.md
- **Scope**: Phases 1–3 of 3 (full plan) — commits 8bc513c (p1), 039b7c7 (p2), 79240ca (p3), 4a01aeb (epilogue), d3e2fdb (browser-smoke addendum, landed mid-review)
- **Date**: 2026-08-08
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning (fixed), 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING (F1 — fixed in review) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Review method

- Plan read in full; both accepted lessons checked (ACL lesson — no new tables here; Workers assets lesson — deploy config untouched). Neither is violated.
- Git scope: every file in the 8bc513c^..4a01aeb diff maps to a planned change or process bookkeeping (plan/change/roadmap status flips, package-lock). Nothing planned is missing; nothing unplanned landed. "What We're NOT Doing" boundaries hold: no PATCH/PUT/DELETE routes, no schema/migration changes, no service-layer changes, no currency conversion.
- `src/lib/billing.ts` read line by line against PRD Business Logic §1–§3 (AGENTS.md arithmetic hard rule). The floor-estimate bound in `nextRenewalDate` was proven by hand (occurrence at `kFloor−1` is ≥ `step+1` months before today's month, so the loop can never skip the answer) and the module was exercised with a 33-assertion scratch script covering the PRD worked examples plus adversarial edges (anchored clamping chains Jan 31 → Apr 30 → Jul 31 → Oct 31 for custom-3, Feb 29 anchors across leap boundaries, `today == occurrence` on both clamped and unclamped dates, December wrap, multi-year custom-18, long-lived weekly). All pass. Rounding rule verified: `billing.ts` returns unrounded values, totals sum unrounded, `formatMoney` (Intl) is the single rounding point.
- Endpoint authorization verified: 401 from `locals.user`, own RLS-scoped client per request (not stored in locals), `user_id` unreachable from the wire (zod strips unknown keys; `CreateSubscriptionInput` omits it; DB default `auth.uid()` + WITH CHECK). Astro's `checkOrigin` CSRF applies (`output: "server"`, confirmed empirically in Phase 2 notes).
- zod schemas verified field-by-field against `20260808210821_create_subscriptions.sql` CHECKs: name trim/1–120, amount > 0 with 2-decimal refine under the `numeric(12,2)` cap (`lt(1e10)`), currency `^[A-Z]{3}$` (uppercased first), interval int 1–120, note ≤ 500, real-calendar start date, pair-CHECK via transform, update schema with the F-01 F2 empty-patch refine plus cycle/interval pair rule. Both `AssertAssignable` compile guards active.
- Phase 3 (coordinator-completed after agent stop) checked for seam inconsistencies: form payload shape matches schema input, wire error contract `{errors: {formErrors, fieldErrors}}` matches `z.flattenError` on both sides, dashboard consumes `billing.ts`/`format.ts` exactly per contract, middleware/signin changes are the planned two-liners. No drift found at the handoff seam.
- Gates after fix: `npm run lint` exit 0, `npx astro check` 0 errors, `npm run build` exit 0.

## Findings

### F1 — Date.UTC maps anchor years 0–99 to 1900+year in weekly renewal math

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/billing.ts:146 (pre-fix `utcDayNumber`)
- **Detail**: `Date.UTC(year, ...)` treats years 0–99 as 1900+year. `start_date` validation (zod `\d{4}` + real-calendar check, and the HTML date input) accepts years below 100, so a typo like `0026-01-01` (for 2026) put a weekly subscription's renewal grid on a 1999-era base — a plausible-looking but silently wrong date, exactly the "silently wrong totals/dates" class AGENTS.md names the top product risk. Monthly/yearly/custom paths use pure integer month arithmetic and were unaffected. Verified empirically: weekly anchor `0099-01-01` returned `2026-08-14` (1999 grid) pre-fix, `2026-08-13` (literal-year grid) post-fix.
- **Fix**: Build the day number via `new Date(0)` + `setUTCFullYear(year, month-1, day)`, which takes the year literally. (Optional future hardening: a sane year floor on `start_date` in zod would surface the typo to the user instead of accepting it — left out here because the schema deliberately mirrors the DB CHECKs, and S-02's edge-case harness is the natural home for that decision.)
- **Decision**: FIXED — commit 815b17c; all PRD worked examples re-verified green, lint/check/build pass.

### F2 — "Normalize, don't reject" holds only for in-range stale intervals

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/validation/subscriptions.ts:53-57, 83
- **Detail**: The plan says a stale `billing_interval_months` on a non-custom cycle is "coerced to null — normalize, don't reject". Field-level validation runs before the normalizing transform, so an *out-of-range* stale value (e.g. `monthly` + interval 500) gets a 400 field error instead of being nulled. The plan's actual scenario (custom → typed 3 → switched to monthly) behaves exactly as planned — verified in Phase 2 (201, stored null) — and the form island additionally sends `null` for non-custom cycles, so the reject path is reachable only by non-form API callers sending out-of-range garbage.
- **Fix**: Move interval range validation inside the transform, conditional on `cycle === "custom"`, so any stale value is discarded first.
- **Decision**: SKIPPED — rejecting an out-of-range value a caller explicitly sent is stricter-correct, not a UX regression; the planned user path is fully covered. Restructuring the schema to silently discard invalid input would trade real validation for letter-of-plan compliance.

### F3 — Manual checks 3.6 and 3.9 marked done with partial deferral to M3

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/first-subscription-dashboard/plan.md:407,410
- **Detail**: Progress items 3.6 (browser-level client validation UX) and 3.9 (phone-viewport visual check) were checked `[x]` while their annotations deferred the browser/visual halves to E2E in M3 — the checkbox alone overstated coverage at the time this review started.
- **Fix**: Carry "client-side validation UX" and "375 px viewport" explicitly into the M3 E2E test list when that work is framed.
- **Decision**: RESOLVED DURING REVIEW — commit d3e2fdb (phase 3 browser-smoke addendum, landed mid-review) closed both caveats with a headless-Chromium walkthrough (375×812, real forms: client-side blocking with zero network POSTs, custom-N reveal/requirement, custom→monthly clean submit with exactly one POST and `billing_interval_months = null`, no horizontal scroll). No residual debt to carry into M3 beyond the normal E2E coverage that milestone adds anyway.

### F4 — Dashboard SSR has no degraded state for a failing store read

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro:16
- **Detail**: `listSubscriptions` throws on any PostgREST error, which bubbles to Astro's generic 500 page. The plan specified no degraded rendering, and an SSR 500 on a DB outage is conventional; flagged only because the dashboard is the product's core surface.
- **Fix**: None now; if a designed error state is ever wanted it belongs to a UI-polish slice, not S-01.
- **Decision**: SKIPPED — matches plan scope and the F-01 service contract (errors surface as throws).

## Fix commits

- 815b17c `fix(first-subscription-dashboard): take anchor years literally in weekly day math` (F1)

## Triage summary

- Fixed: F1 (1)
- Resolved during review (by d3e2fdb): F3 (1)
- Skipped: F2, F4 (2)
- Lessons recorded: none — F1 is a one-off runtime quirk already guarded by a code comment and (from S-02) tests; no recurring agent-behavior rule emerged.

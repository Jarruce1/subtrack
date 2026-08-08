<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Upcoming Renewals List (S-05)

- **Plan**: context/changes/upcoming-renewals-list/plan.md
- **Scope**: Full plan (Phases 1–2 of 2)
- **Date**: 2026-08-08
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations (both fixed)

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Evidence (independent sub-agent over `15aeb7d..HEAD` + direct re-runs):

- **Plan Adherence**: all four planned changes MATCH — `UpcomingRenewal` (src/types.ts:30-33), `upcomingRenewals` with validate-today-first, active-only skip, inclusive `<= windowEnd` bound, stable three-way comparator (src/lib/billing.ts:102-129, `UPCOMING_WINDOW_DAYS` :17), the plan's full 10-case §4 describe block (src/lib/billing.test.ts:232-299), dashboard section in the planned position, has-subscriptions branch only (src/pages/dashboard.astro:109-133). No MISSING, no EXTRA.
- **Scope Discipline**: diff touches only the four source files + context docs/roadmap status flip. S-03 files (`src/lib/services/subscriptions.ts`, `src/lib/validation/subscriptions.ts`), `/subscriptions/*` pages, and every existing billing function/test are byte-untouched; the only modified pre-existing source lines are the two import specifier lists.
- **Safety & Quality**: no `set:html` (Astro auto-escapes names); no nullable renders; `.sort` mutates only the locally-built array — caller input never reordered; paused/cancelled custom-cycle rows are skipped before `nextRenewalDate`, so a null interval cannot throw.
- **Architecture / Pattern Consistency**: §4 sits beside §1–§3 in the pure module (summarizeActive precedent); section markup is byte-idiomatic with the sibling "Active totals" card (aria-labelledby + h2 id, glass-card classes, muted empty line, divide-y list).
- **Success Criteria**: `npm test` 60/60 (10 new §4 cases; S-02 suites untouched and green), `npm run lint` exit 0, `npx astro check` 0 errors, `npm run build` complete — re-run after triage fixes. Manual rows 2.5–2.10 verified by an actual rendered-page smoke on :4402 against the local Supabase stack (users `s05-window-*`, `s05-emptywin-*`, `s05-nosubs-*`): soonest-first row order `2026-08-08 → 2026-08-15 → 2026-08-20 ×2 (stable) → 2026-09-07`, day-31 (`2026-09-08`) absent, paused/cancelled absent from the section but present in Subscriptions, quiet empty line, untouched global empty state, section order totals → upcoming → subscriptions.

## Findings

### F1 — Plan-internal contradiction on the dashboard import edit (sub-agent OBS-1)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/upcoming-renewals-list/plan.md — Critical Implementation Details vs Phase 2 Contract
- **Detail**: The Phase 2 contract says "frontmatter gains `upcomingRenewals` in the existing `@/lib/billing` import" (what was implemented), while Critical Implementation Details said "one added import line … no existing line modified". The implementation followed the more specific contract; the merge-hygiene risk is nil (S-03's planned edit is one markup link line, not the import).
- **Fix**: Amend the Critical Implementation Details wording to match the contract (extend the existing import specifier list), annotated as an OBS-1 fix.
- **Decision**: FIXED — plan wording corrected in the review commit (autonomous triage, parent-mandated).

### F2 — Stale suite-header comment "§1–§3" (sub-agent OBS-2)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/lib/billing.test.ts:1-2
- **Detail**: The file-header comment still claimed the suite is traceable to "Business Logic §1–§3"; the file now also pins §4.
- **Fix**: Update the header to "§1–§4".
- **Decision**: FIXED — one-line comment edit; full verification chain re-run green (autonomous triage, parent-mandated).

## Triage summary

Fixed: F1, F2 (2) · Skipped: — · Accepted: — · Verdict: APPROVED.

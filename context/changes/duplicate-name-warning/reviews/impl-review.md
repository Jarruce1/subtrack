<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Duplicate Name Warning (S-07)

- **Plan**: context/changes/duplicate-name-warning/plan.md
- **Scope**: Full plan (Phases 1-3)
- **Date**: 2026-08-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING → resolved (F2 fixed, F1 dismissed with evidence) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence base

- Drift agent: all five planned changes MATCH (duplicates.ts, duplicates.test.ts,
  listSubscriptionNames, duplicate-check.ts, SubscriptionForm.tsx). Save routes
  byte-for-byte unchanged (`git diff bc96841..HEAD` on index.ts + [id].ts = 0 bytes)
  — the "never blocks save" guarantee is structural. No "What We're NOT Doing"
  creep (no fuzzy match, no migrations, no modal, no dashboard/billing changes).
  One judgment call: the `isOwnUnchangedName` client-side skip is additive and
  implements the plan's stated intent (unchanged-name edit is not a rename);
  judged within-intent, not drift.
- Safety agent: fail-open contract verified on every enumerated path through
  `handleSubmit` — no path can permanently prevent the save. XSS inert (JSX text
  node), endpoint authn/RLS/error-hygiene match siblings, `duplicates.ts`
  client-safe (zero imports). Pattern compliance clean across endpoint, service,
  tests, and form.
- Success criteria re-run on the final tree: lint PASS, `astro check` 0 errors,
  87/87 tests, build PASS. 13-scenario curl smoke passed on :4404 against the
  local stack (see plan Progress 2.5/3.5).

## Findings

### F1 — Warning box "invisible in light theme"

- **Severity**: ⚠️ WARNING (as reported)
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/subscriptions/SubscriptionForm.tsx (warning div)
- **Detail**: Reviewer claimed amber-200 text is ~1.3:1 contrast because the app
  renders light theme. Verified false for the actual render surfaces: the form
  mounts only on `subscriptions/new.astro` and `subscriptions/[id]/edit.astro`,
  both of which wrap content in `class="bg-cosmic dark …"` — `bg-cosmic` is a
  dark gradient (`#0a0e1a → #0f1529`, global.css:113-115) with white text.
  Amber-200 on that backdrop is high-contrast, consistent with the sibling
  destructive alert.
- **Fix**: None required.
- **Decision**: DISMISSED — finding based on Layout.astro/global.css `:root`
  without the page-level `dark` cosmic wrappers.

### F2 — No timeout on the advisory fetch

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/subscriptions/SubscriptionForm.tsx (checkDuplicate)
- **Detail**: A hung duplicate-check response left `submitting=true` until the
  browser socket timeout — never a permanent block, but an advisory check could
  materially delay a save.
- **Fix**: `AbortSignal.timeout(2000)` on the fetch; the existing catch converts
  the abort into fail-open null.
- **Decision**: FIXED — 985eba8.

### F3 — Mid-flight name edit shows stale warning

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: SubscriptionForm.tsx (inputs editable while submitting)
- **Detail**: Editing the name during an in-flight check can surface a warning
  for the previously submitted name. Transient UX inconsistency; next submit
  re-checks the new name; never blocks.
- **Fix**: Optional (disable inputs while submitting / ignore stale resolution).
- **Decision**: ACCEPTED — advisory-only, self-correcting, 2s worst case after F2.

### F4 — No double-submit guard in handleSubmit

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: SubscriptionForm.tsx:handleSubmit
- **Detail**: Protection rested solely on the disabled button; the extra await
  widened the in-flight window.
- **Fix**: `if (submitting) return;` at the top of handleSubmit.
- **Decision**: FIXED — 985eba8.

### F5 — listSubscriptionNames has no ordering

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: src/lib/services/subscriptions.ts (listSubscriptionNames)
- **Detail**: With several rows sharing a normalized name, which match is
  reported is Postgres-order nondeterministic. Advisory-only; the warning text
  is equivalent either way.
- **Fix**: Optional `.order("created_at")`.
- **Decision**: ACCEPTED — no user-visible consequence; keeps the read lean.

### F6 — name param lacks a max length

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/subscriptions/duplicate-check.ts (nameParamSchema)
- **Detail**: Create schema caps name at 120; the check accepted longer values
  (harmless — bounded by URL limits — but asymmetric).
- **Fix**: `.max(120)` mirroring the create schema.
- **Decision**: FIXED — 985eba8.

### F7 — Conditionally mounted role="status" live region

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW
- **Dimension**: Pattern Consistency
- **Location**: SubscriptionForm.tsx (warning div)
- **Detail**: Some screen readers won't announce content arriving with a newly
  mounted live region. The sibling `role="alert"` error box shares the same
  pre-existing pattern.
- **Fix**: Optional (persistently mounted live region) — would diverge from the
  sibling pattern.
- **Decision**: ACCEPTED — pre-existing form-wide pattern; the "Save anyway"
  button label is a second, focusable signal.

## Triage summary

- Fixed: F2, F4, F6 (commit 985eba8)
- Dismissed: F1 (with file evidence)
- Accepted: F3, F5, F7

► Verdict after fixes: APPROVED

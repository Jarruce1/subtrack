<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Status Lifecycle Quick Actions (S-04)

- **Plan**: `context/changes/status-lifecycle-totals/plan.md`
- **Scope**: Phases 1–2 of 2 (full plan)
- **Date**: 2026-08-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS (1 observation — plan claim corrected, not code) |
| Scope Discipline | PASS (1 observation — benign one-token addition) |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- **Diff vs plan**: changed files are exactly the planned surface —
  `src/lib/lifecycle.ts` + `lifecycle.test.ts` (p1, `6bdc143`),
  `src/components/subscriptions/StatusActions.tsx` +
  `src/pages/subscriptions/index.astro` (p2, `0efaaa8`) — plus the change
  folder and the roadmap status flip. No planned item missing, no unplanned
  file touched.
- **Success criteria (automated, re-run at p2)**: `npm run lint` ✓ (pre-existing
  astro-parser warnings only), `npx astro check` ✓ (0 errors / 0 warnings),
  `npm run build` ✓, `npm test` ✓ 99/99 (94 existing + 5 new lifecycle tests).
- **Success criteria (manual, executed via curl smoke on :4405, local stack,
  user `s04-1786228162@example.com`)**: baseline PLN 120.00/mo + PLN 1,440.00/yr
  + renewal 2026-08-15 → **pause**: both totals sections show "No active
  subscriptions", renewals show "No renewals in the next 30 days", row stays
  listed as paused with Resume/Cancel → **resume**: totals + renewal restored →
  **cancel**: excluded again, row stays listed ("Gym", cancelled badge,
  Reactivate only) → **reactivate**: restored, Pause/Cancel back. Negative
  probes: unauthenticated PATCH → 401.
- **Safety scan**: no injection surface (fixed JSON body from a typed enum;
  `window.confirm` renders text, not HTML); auth enforced server-side (route
  401 + RLS scoping, verified by the 401 probe); no schema/data changes; both
  island buttons disabled while pending; error path resets state and announces
  via `role="alert"`.
- **Pattern check**: `StatusActions.tsx` mirrors `DeleteSubscriptionButton.tsx`
  line-for-line in contract (fetch → navigate; 401 → signin; 404 → reload;
  inline alert; no state reset on navigation paths; same comment style). The
  transition table follows the pure-module convention of `billing.ts` /
  `duplicates.ts` with hand-derived PRD oracles per test-plan §6.1.

## Findings

### F1 — Plan's CSRF claim was stronger than Astro's actual check

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence (plan flaw, not code flaw)
- **Location**: plan.md — Current State Analysis, Auth/CSRF bullet
- **Detail**: The plan stated Astro's origin check "applies to PATCH"
  unconditionally. Smoke disproved it for this route: a JSON PATCH without an
  `Origin` header returns 200 — Astro's `security.checkOrigin` only gates
  form-like content types (`application/x-www-form-urlencoded`,
  `multipart/form-data`, `text/plain`); JSON requests rely on the browser CORS
  preflight plus `SameSite=Lax` session cookies, which is the standard and
  sufficient protection here. No code change needed; the plan text should not
  overstate the mechanism for future readers.
- **Fix**: Correct the plan's Auth/CSRF bullet to describe the actual
  mechanism (checkOrigin = form content types; JSON = CORS preflight +
  SameSite cookie).
- **Decision**: FIXED — plan bullet corrected 2026-08-09

### F2 — Unplanned `flex-wrap` on the row actions cluster

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/pages/subscriptions/index.astro:92
- **Detail**: The plan said "one mount line"; the diff also changes
  `flex items-center` → `flex flex-wrap items-center` on the actions container.
  With up to four controls per row this prevents horizontal overflow on
  phone-sized screens (NFR: core flows work on a phone) — benign and necessary
  for the mount to work at the promised quality.
- **Fix**: Accept as an implementation detail of the wiring; documented here as
  the plan addendum.
- **Decision**: ACCEPTED — benign, mobile-NFR-serving

### F3 — `statusActions` returns `readonly StatusAction[]` vs planned `StatusAction[]`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/lifecycle.ts:36
- **Detail**: The implemented signature is strictly narrower (immutable) than
  the plan's contract — callers cannot mutate the shared table, which is safer
  for a module-level constant. The only consumer (`StatusActions.tsx`) maps
  over it; no friction introduced.
- **Fix**: None — keep the stricter type.
- **Decision**: ACCEPTED — stricter than contract, intentionally kept

## Triage summary

Fixed: F1 (1) · Accepted: F2, F3 (2)

► Overall: APPROVED — plan implemented as designed, all gates green, US-04
acceptance criteria proven end-to-end on the local stack.

<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Error-Path & Secret Hardening

- **Plan**: context/changes/error-path-hardening/plan.md
- **Scope**: Full plan (Phases 1–4)
- **Date**: 2026-08-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 6 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Drift agent: 8/10 files MATCH, 2 benign EXTRA (eslint.config.js scoped
block — authorized by criterion 3.3; change.md lifecycle stamp), 1 minor
DRIFT (test-plan §4 row outside the plan's literal freeze wording), 0
MISSING. Safety agent: no CRITICAL or WARNING — XSS (Astro escaping + no
`set:html` anywhere + `astro/no-set-html-directive` enforced), open
redirect (fixed literals only), scanner output leakage (needle names only,
verified on every output path), and test-file secrets (none) all clean.

Success criteria re-run during review: lint 0 problems, astro check 0
errors, unit 99/99, integration 34/34, `scan:secrets` exit 0 (15 files),
e2e 5/5, break-gates proven (value canary, sb_secret_ canary, service-role
JWT canary, unreadable-file canary → each exit 2; removal → exit 0).

## Findings

### F1 — test-plan §4 stack row edited outside the stated freeze

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md §4 (secret-scan row)
- **Detail**: Phase 4's Contract froze §1–§5 except the §3 Status cell; the
  §4 "none yet — see Phase 3" placeholder was also flipped to "Exists: …".
  Truthful and phase-consistent, but formally outside the freeze wording.
- **Fix**: Record in the plan as an addendum so the plan stays the source
  of truth.
- **Decision**: FIXED (plan Addendum section added)

### F2 — Phase 4 Progress boxes left unticked by the p4 commit

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: context/changes/error-path-hardening/plan.md Progress 4.1–4.3
- **Detail**: Evidence existed (commit message + Verification Evidence) but
  the mechanical Progress contract for Phase 4 was incomplete.
- **Fix**: Tick 4.1–4.3 with the closing SHA (8558ade).
- **Decision**: FIXED

### F3 — Scanner crashed (ambiguous exit 1) on an unreadable client file

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: scripts/scan-secrets.mjs (per-file read loop)
- **Detail**: An unreadable file/broken symlink under dist/client threw
  uncaught — Node exits 1, colliding with the documented "1 = setup error"
  and skipping remaining files. An unscanned file is an unverified file.
- **Fix**: try/catch per read; record the path as a finding
  ("unreadable file (fail-closed)") and exit 2.
- **Decision**: FIXED (canary verified: chmod-000 file → exit 2 naming it)

### F4 — Sign-out null-client branch redirects "/" without signing out

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/auth/signout.ts (null-client guard)
- **Detail**: With env unconfigured there is no client to sign out with;
  the middleware cannot validate sessions either, so the cookie is inert
  and "/" is honest — but the branch looked like the pattern the new
  lessons rule targets.
- **Fix**: Document the accepted degenerate state with a comment so a
  future refactor doesn't inherit a silent branch unknowingly.
- **Decision**: FIXED (comment added)

### F5 — signin/signup forward raw `error.message` into redirect URLs

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/signin.ts:16, signup.ts:16 (out of diff)
- **Detail**: Unchanged files, but the lessons.md rule this change
  establishes ("no backend detail in URLs") makes them non-compliant.
  Changing them here would exceed scope ("minimal fix" was a plan pillar).
- **Fix**: Queue follow-up: map auth failures to fixed generic messages,
  pin with error-contract tests.
- **Decision**: QUEUED (follow-ups/review-fixes.md #1)

### F6 — `?error=` renders attacker-choosable free text (content spoofing)

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/dashboard.astro (and pre-existing signin/signup)
- **Detail**: XSS-safe (escaped), but a crafted link can display arbitrary
  text inside a trusted page. Pre-existing pattern; only one legitimate
  producer exists, emitting one fixed string.
- **Fix**: Queue follow-up: switch to short error codes mapped server-side
  across all three pages in one sweep.
- **Decision**: QUEUED (follow-ups/review-fixes.md #2)

## Triage summary

Fixed: F1 (plan addendum), F2 (Progress ticked), F3 (fail-closed scanner,
canary-verified), F4 (comment). Queued: F5, F6 →
`context/changes/error-path-hardening/follow-ups/review-fixes.md`.
Post-triage re-verification: lint 0 problems, integration 34/34,
scanner clean exit 0 / unreadable-canary exit 2.

**Verdict: APPROVED.**

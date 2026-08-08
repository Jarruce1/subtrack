<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Manage the Subscription List (S-03)

- **Plan**: context/changes/manage-subscription-list/plan.md
- **Scope**: Full plan (Phases 1–3 of 3)
- **Date**: 2026-08-08
- **Verdict**: APPROVED (after 2 fixes applied in 7c5c8f2)
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS (7 MATCH, 1 documented benign DRIFT) |
| Scope Discipline | PASS (no unplanned files; "not doing" list intact) |
| Safety & Quality | PASS (0 critical; F1 fixed) |
| Architecture | PASS (service-layer-only DB access, RLS-scoped, islands only where interactive) |
| Pattern Consistency | PASS after F1 fix (WARNING pre-fix) |
| Success Criteria | PASS (all automated re-run green post-fix; manual rows evidenced in Progress notes) |

## Evidence summary

- **Drift agent**: `[id].ts`, schema tests, delete island, list page, dashboard link, `SubscriptionForm`, `new.astro` — all MATCH against the plan's Intent/Contract. `edit.astro` is the one DRIFT: `Astro.response.status = 404` + rendered not-found body instead of the planned `return new Response(404)` — documented in the plan's Phase 3 verification notes (astro-eslint-parser crashes on a top-level frontmatter return under `no-misused-promises`); the wire contract (404 for malformed/foreign/nonexistent, indistinguishable) is preserved and smoke-verified. No scope creep: diff = planned source files + change-folder docs + the roadmap status flip.
- **Safety agent**: clean on IDOR (RLS + identical 404s + uuid pre-check), XSS (Astro/React auto-escaping, serialized island props), client-bundle secrets (validation module imports only zod + erased types), injection (zod-uuid + parameterized builders), double-submit races, error boundaries, and endpoint/page/test pattern compliance.
- **Success criteria re-run post-fix**: `npm run lint` 0, `npx astro check` 0 errors, `npm run build` 0, `npm test` 61/61. Manual criteria carry per-phase verification notes in the plan's Progress section (curl/SSR smoke on the local stack); two browser-only interactions (confirm-dialog cancel, client-side pre-validation without network) are verified by code inspection against the S-01-proven identical wiring, deferred to E2E (module 3) — flagged in the notes, not rubber-stamped.

## Findings

### F1 — List page missing `dark` class breaks island theme tokens

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/subscriptions/index.astro:27
- **Detail**: Wrapper used `bg-cosmic min-h-screen …` without the `dark` class that both sibling island-hosting pages (`new.astro`, `edit.astro`) add. The page hosts a shadcn island (`variant="destructive"` button, `text-destructive` error), whose tokens resolved to light-mode values on the dark background — poor contrast on the inline error text.
- **Fix**: Add `dark` to the wrapper div, matching the form pages' convention.
- **Decision**: FIXED — 7c5c8f2

### F2 — Full Subscription row serialized into edit-island props

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/subscriptions/[id]/edit.astro:48 (+ SubscriptionForm.tsx prop type)
- **Detail**: Astro serializes the whole row — including unused `user_id`, `created_at`, `updated_at` — into the page HTML. It is the caller's own data (RLS holds; no cross-user exposure), so this is hygiene, not a vulnerability.
- **Fix**: Narrow the prop to `Pick<Subscription, …>` of the nine form fields + id.
- **Decision**: SKIPPED — own-user data only, no security boundary crossed; narrowing the type ripples through the form's prefill mapping for zero user-visible gain. Revisit if the row ever grows sensitive fields.

### F3 — Delete button re-enables mid-navigation; stale 404 asks user to refresh

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability polish)
- **Location**: src/components/subscriptions/DeleteSubscriptionButton.tsx:28-46
- **Detail**: `finally { setDeleting(false) }` briefly re-enabled the button after a successful 204 while navigation was in flight (a fast second click round-trips through confirm → DELETE → 404 — harmless but sloppy), and the 404 branch told the user to "refresh the page" instead of reloading for a fresh SSR list.
- **Fix**: Keep `deleting` true on navigation paths; `window.location.reload()` on stale 404.
- **Decision**: FIXED — 7c5c8f2

### F4 — Cookie-auth PATCH/DELETE without CSRF token

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/subscriptions/[id].ts (whole file)
- **Detail**: Item routes rely on cookie auth with no CSRF token — same posture as the existing POST route. Mitigated in practice: non-form-submittable methods + JSON content type force a CORS preflight cross-origin, Astro's `security.checkOrigin` rejects mismatched Origins, and Supabase SSR cookies are SameSite=Lax.
- **Fix**: None required; consistent accepted posture.
- **Decision**: ACCEPTED — consistent with the S-01 collection route; Astro checkOrigin + SameSite=Lax cover the CSRF classes these methods are exposed to.

### F5 — edit.astro 404 mechanism deviates from the plan text

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/subscriptions/[id]/edit.astro:17-22
- **Detail**: Plan specified `return new Response("Not found", { status: 404 })`; implementation sets `Astro.response.status = 404` and renders a minimal not-found body, because the top-level frontmatter `return` crashes astro-eslint-parser (`no-misused-promises`: "Expected node to have a parent"). Status contract identical; small UX gain; not the excluded custom `404.astro`.
- **Fix**: None — deviation already documented in the plan's Phase 3 verification notes.
- **Decision**: ACCEPTED — documented adaptation, wire contract preserved and smoke-verified.

## Triage summary

Fixed: F1, F3 (commit 7c5c8f2). Accepted: F4, F5. Skipped: F2.

**Verdict: APPROVED** — no criticals; the one warning fixed and re-verified (lint/check/build/61 tests green post-fix).

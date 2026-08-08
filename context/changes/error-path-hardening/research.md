---
date: 2026-08-09T00:00:00+02:00
researcher: Claude (Fable 5)
git_commit: 631d01c82db2451fd792771e4fb9ff22a2039bcc
branch: main
repository: subtrack (10xdevs app)
topic: "Swallowed-error audit across src/ (test-plan §2 risks #3 and #6)"
tags: [research, codebase, error-handling, api-routes, auth, secrets]
status: complete
last_updated: 2026-08-09
last_updated_by: Claude (Fable 5)
---

# Research: Swallowed-error audit (risks #3 and #6)

**Date**: 2026-08-09
**Git Commit**: 631d01c82db2451fd792771e4fb9ff22a2039bcc
**Branch**: main

## Research Question

Audit all of `src/` — API routes (auth signin/signup/signout, subscriptions
index/[id]/duplicate-check), SSR pages (dashboard, subscriptions/*),
middleware, the service layer, and the React form islands — for:

- (a) try/catch that logs-and-drops without propagating to the response,
- (b) database/auth errors ignored (destructuring `{ data }` without checking `error`),
- (c) responses that read as success when the operation failed,
- (d) `console.log/error` that could leak a secret or token into logs.

## Summary

The JSON API surface (subscriptions routes + service layer) is already
honest: every Supabase call checks `error` and throws; every route catch
translates to a non-2xx `{ error }` body; every island navigates only on
the exact success status. Exactly **one real swallowed error** exists:

- **`src/pages/api/auth/signout.ts:7` — the `signOut()` result is
  discarded.** `supabase.auth.signOut()` returns `{ error }`; on a server
  failure supabase-js returns early WITHOUT removing the local session
  cookies, yet the route unconditionally redirects to `/` — the user
  believes they are signed out while their session cookie is still live.
  Classification: (b) + (c). This is the risk-#3 pattern (failure reads as
  success) applied to auth, with a #6 flavor (a live token survives on a
  shared machine after an apparent sign-out).

One further (b)-shaped pattern is **fail-closed and accepted, no fix**:

- `src/middleware.ts:14-16` — `const { data: { user } } = await
  supabase.auth.getUser()` ignores `error`. Any auth-backend failure yields
  `user = null` → protected pages redirect to sign-in and API routes answer
  401. It never fakes success; a transient backend outage surfaces as
  "authentication required" instead of a 500, which is the safe direction.
  Documented here as an accepted deviation, not a swallow to fix.

No `console.*` statement exists anywhere in `src/`, `e2e/`, or scripts
(verified by grep) — finding class (d) is empty; the mechanical guarantee
for risk #6 therefore comes from the build-output scan (this phase) rather
than from removing log lines.

## Detailed Findings

### API routes — subscriptions (honest, to be pinned)

- `src/pages/api/subscriptions/index.ts:43-49` — POST wraps
  `createSubscription` in try/catch → `{ error: "Could not create subscription" }`
  with 500. Propagates; DB details deliberately stay server-side (no leak).
- `src/pages/api/subscriptions/[id].ts:53-62` (PATCH) and `:80-88`
  (DELETE) — same pattern: catch → 500 `{ error }`; service `null`/`false`
  → 404 `{ error: "Not found" }`. Propagates.
- `src/pages/api/subscriptions/duplicate-check.ts:50-57` — catch → 500
  `{ error: "Could not check for duplicates" }`. Propagates.
- All three return `{ error: "Supabase is not configured" }` 500 when the
  client factory yields null, and own their 401 with `{ error }`.

### Service layer (honest)

- `src/lib/services/subscriptions.ts:17-21, 28-32, 37-41, 48-52, 61-68,
  73-77` — every query destructures `{ data, error }` AND checks `error`,
  throwing `new Error(error.message)`; `updateSubscription` maps only
  `PGRST116` (no rows) to `null`, `deleteSubscription` returns
  `data.length > 0`. No ignored `error` anywhere.

### API routes — auth

- `src/pages/api/auth/signin.ts:13-17` / `signup.ts:13-17` — `{ error }`
  checked, propagated as `?error=<message>` redirect rendered by
  `ServerError` on the form pages. Honest.
- **`src/pages/api/auth/signout.ts:7` — REAL SWALLOW.** `await
  supabase.auth.signOut();` — return value discarded, unconditional
  `redirect("/")`. supabase-js (`GoTrueClient.signOut`) ignores only
  401/403/404 from the logout endpoint (session already invalid — sign-out
  is effectively done) but returns early with `{ error }` on network/5xx
  failures WITHOUT clearing the local session — so the cookie remains a
  valid credential while the UI shows the signed-out landing page.
  Sign-out buttons live at `src/pages/dashboard.astro:72-79` and
  `src/components/Topbar.astro` (form POST → follow redirect; no island
  handles a failure today). No e2e test exercises sign-out (grep of `e2e/`).

### SSR pages (honest — throw → Astro 500)

- `src/pages/dashboard.astro:16` and `src/pages/subscriptions/index.astro:19`
  — `listSubscriptions` throws on DB error → Astro renders its 500 page;
  never a fake-empty dashboard. The `supabase === null` branch renders
  "Supabase is not configured" (visible messaging), not fake data.
- `src/pages/subscriptions/[id]/edit.astro:17-22` — service throw → 500;
  malformed/foreign/missing id → 404 + not-found body. Honest.

### React islands (honest — success only on exact status)

- `src/components/subscriptions/SubscriptionForm.tsx:157-179` — navigates
  only on 200 (edit) / 201 (add); 401 → signin, 404 → message, 400 → field
  errors, anything else → "Something went wrong while saving.", network
  catch → "Could not reach the server.". Never reports success on failure.
- `src/components/subscriptions/DeleteSubscriptionButton.tsx:30-47` —
  navigates only on 204; else error message. Honest.
- `src/components/subscriptions/StatusActions.tsx:44-61` — reloads only on
  `response.ok` (PATCH route emits 200 only on success); else message. Honest.
- `src/components/subscriptions/SubscriptionForm.tsx:98-117`
  (`checkDuplicate`) — catch → `null` is **deliberate fail-open** for the
  FR-014 advisory check ("the warning must never block a save", US-03);
  documented contract, not a swallow: the subsequent save still hits the
  real POST/PATCH and its honest statuses.

### Class (d) — console/log leakage

- `grep -rn 'console\.' src e2e scripts` → zero matches. ESLint
  `no-console` warns project-wide. Nothing can currently print
  `SUPABASE_KEY`/tokens to logs. Secrets are `astro:env/server`
  (`astro.config.mjs` schema, `access: "secret"`), imported only by
  `src/lib/supabase.ts:3` and `src/lib/config-status.ts:1` — both
  server-only modules; no client component imports them.

## Code References

- `src/pages/api/auth/signout.ts:7` — the one real swallowed error (fix target)
- `src/middleware.ts:14-16` — fail-closed ignored `getUser()` error (accepted, documented)
- `src/pages/api/subscriptions/index.ts:43-49` — honest catch → 500 `{ error }` (pin with tests)
- `src/pages/api/subscriptions/[id].ts:53-62,80-88` — honest catch → 500 `{ error }` (pin)
- `src/pages/api/subscriptions/duplicate-check.ts:50-57` — honest catch → 500 `{ error }` (pin)
- `src/lib/services/subscriptions.ts:16-78` — every `{ data, error }` checked
- `src/components/subscriptions/SubscriptionForm.tsx:157-183` — UI success only on 200/201
- `src/pages/dashboard.astro:72-79`, `src/components/Topbar.astro` — sign-out forms (POST + redirect)

## Architecture Insights

- Error contract of the JSON API: non-2xx + `{ error: string }` (single
  message) for auth/config/500/404; `{ errors: { formErrors, fieldErrors } }`
  for zod 400s. The fix and the new tests must preserve exactly this shape.
- Form-post auth routes use a different (navigation) contract: 3xx redirect
  with `?error=<message>` rendered by the target page. The sign-out fix
  should follow this sibling pattern, not the JSON one — a browser form
  POST that lands on raw JSON would trade one dishonesty for another.
- `createClient` (`src/lib/supabase.ts`) is the single seam between routes
  and Supabase — mocking this module in route-level tests induces failures
  without touching the real-DB RLS suites (whose no-mocks policy, test-plan
  §6.2, is about proving RLS, not about route translation).
- Astro API routes are plain functions of `APIContext` — they can be
  imported and invoked directly under Vitest as long as `@/lib/supabase`
  (the only transitive `astro:env/server` import) is mocked.

## Historical Context (from prior changes)

- `context/changes/testing-api-rls-integration/` — Phase 1 integration
  suite + helpers; established the no-DB-mocks policy for RLS proofs.
- `context/changes/e2e-critical-flow/` — Phase 2; e2e never exercises
  sign-out, so the signout fix has no e2e blast radius.
- `context/foundation/test-plan.md` §2 risk #3/#6, §3 Phase 3 — this change.

## Open Questions

- None blocking. The exact worker-bundle layout of the Cloudflare adapter
  (`dist/_worker.js` file vs directory) is resolved empirically by the scan
  script at build time.

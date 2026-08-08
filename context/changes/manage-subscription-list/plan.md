# Manage the Subscription List (S-03) Implementation Plan

## Overview

Give the user management over their subscription store: a `/subscriptions` list page showing every subscription with its status and normalized costs (FR-005), an edit page that prefills the existing form pattern and saves any field via `PATCH /api/subscriptions/[id]` (FR-006), and delete-with-confirmation via `DELETE /api/subscriptions/[id]` (FR-007). Foreign and nonexistent ids answer 404. This slice consumes the F-01 service functions (`updateSubscription` / `deleteSubscription` / `getSubscription` / `listSubscriptions`) and the `subscriptionUpdateSchema` that S-01 pre-defined for exactly this endpoint — closing the F-01 impl-review F2 handoff (empty-patch guard) end-to-end.

## Current State Analysis

- **Service layer complete (F-01).** `src/lib/services/subscriptions.ts` already exposes everything this slice needs: `listSubscriptions` (ordered by `created_at` desc), `getSubscription` (→ `null` on missing/foreign — RLS makes them indistinguishable, deliberate), `updateSubscription` (→ `null` via `PGRST116`), `deleteSubscription` (→ `false` when nothing deleted). No service changes required.
- **Update schema complete (S-01).** `src/lib/validation/subscriptions.ts:119-164` defines `subscriptionUpdateSchema`: partial field set, **rejects the empty patch** (F-01 review F2 — PostgREST answers `PATCH {}` with `200 []`, which `updateSubscription` would misreport as not-found), and requires `billing_cycle`/`billing_interval_months` to be patched together and consistently. It has **no consumer and no tests yet**.
- **Only the collection route exists.** `src/pages/api/subscriptions/index.ts` implements POST only, with the endpoint conventions this slice must follow: `locals.user` 401 guard, own `createClient` per request, `json()` helper, zod errors via `z.flattenError` in the `{ errors: { formErrors, fieldErrors } }` wire shape, generic 500s.
- **Add form is single-purpose.** `src/components/subscriptions/AddSubscriptionForm.tsx` is the only island form: controlled string state, client pre-validation with `subscriptionCreateSchema`, JSON POST, per-field server errors, full navigation on success. It hardcodes the POST endpoint and `/dashboard` redirect — needs generalization, not duplication, for edit.
- **Middleware already gates the new pages.** `src/middleware.ts` `PROTECTED_ROUTES = ["/dashboard", "/subscriptions"]` prefix-matches `/subscriptions`, `/subscriptions/[id]/edit` — no change needed. `/api/subscriptions/*` is not prefix-matched; item routes own their 401 (established F-01/S-01 decision).
- **Dashboard renders the read-only list** but has no path to any management surface. **S-05 (upcoming renewals) is being built in parallel against `dashboard.astro`** — this slice's only permitted touch there is a single added link line (merge-conflict avoidance, coordinated).
- **Test harness exists (S-02).** Vitest + fast-check, `npm test` runs `src/lib/*.test.ts`. Validation schemas have zero coverage; the F2 empty-patch guard is exactly the kind of contract the harness should pin.
- **Astro CSRF**: server output enables `security.checkOrigin` by default — POST/PATCH/DELETE requests must carry a matching `Origin` header (affects curl smoke checks, not browsers).
- **No 404 page exists** (`src/pages/404.astro` absent); returning `new Response(..., { status: 404 })` from a page yields a bare 404.
- **`lessons.md` checked**: ACL lesson (new tables — none here), Workers `not_found_handling` lesson (deploy config — untouched). Neither adds S-03 work.

## Desired End State

A signed-in user can: open the dashboard → follow a "Manage subscriptions" link → see every subscription (any status) with its status badge, raw cost + cycle, and normalized monthly/yearly cost → edit one (form arrives prefilled, any field can change, save returns to the list showing the new values) → delete one (confirmation first, row disappears from the fresh SSR render). Requests targeting another user's subscription id — page or API — answer 404, indistinguishable from a nonexistent id. `PATCH {}` answers 400 with "Provide at least one field to update".

Concretely:

1. `PATCH /api/subscriptions/[id]` — 401 unauthenticated; 404 malformed/foreign/nonexistent id; 400 with zod field errors (including the empty-patch and cycle/interval-pair guards); 200 with the updated row.
2. `DELETE /api/subscriptions/[id]` — 401 unauthenticated; 404 malformed/foreign/nonexistent id; 204 on success.
3. `/subscriptions` — SSR list of all the user's subscriptions with status visible and costs normalized; per-row Edit link and Delete button (confirm dialog); explanatory empty state; links back to dashboard and to add.
4. `/subscriptions/[id]/edit` — SSR-prefilled form; save PATCHes and returns to the list; 404 response for foreign/nonexistent/malformed ids.
5. Dashboard header carries a link to `/subscriptions` (one line).
6. `subscriptionUpdateSchema` contract pinned by unit tests; `npm run lint`, `npx astro check`, `npm run build`, `npm test` all pass.

### Key Discoveries:

- `src/lib/services/subscriptions.ts:44-58,60-67` — `updateSubscription` → `null` and `deleteSubscription` → `false` are the not-found signals; the routes map them to 404 without distinguishing foreign from nonexistent (RLS anonymity preserved).
- `src/lib/services/subscriptions.ts:62` — a **malformed** (non-UUID) id makes Postgres throw `invalid input syntax for type uuid`, which the service surfaces as a thrown Error → the route would answer 500. Routes must pre-check the id shape and answer 404 before calling the service.
- `src/lib/validation/subscriptions.ts:119-164` — `subscriptionUpdateSchema` accepts a full field set (all keys present is a valid partial); a full-field PATCH payload with `billing_interval_months: null` for non-custom cycles passes the pair rule. The edit form can therefore send the complete field set — always non-empty, always pair-consistent — while the schema still guards arbitrary API clients.
- `src/components/subscriptions/AddSubscriptionForm.tsx:55-68` — `buildPayload()` already produces exactly the full-field shape the PATCH path needs; client pre-validation with `subscriptionCreateSchema` normalizes stale intervals to `null`, which the update schema accepts. One form component can serve both modes.
- `src/pages/api/subscriptions/index.ts:13-18` — the `json()` helper and error-shape conventions to replicate in the item route.
- `src/pages/dashboard.astro:22-34` — the list-row cost computation (`normalizeCost` per row) to reuse on `/subscriptions`; renewal dates are the dashboard's concern, not the list's (S-05 owns the renewal surface).
- zod v4: `z.uuid()` is the current uuid validator (string `.uuid()` is deprecated); `z.flattenError` replaces `.flatten()`.

## What We're NOT Doing

- **No duplicate-name warning on rename** (S-07 — explicitly out even though the edit path is where it would land).
- **No status-lifecycle quick actions** (S-04) — status is editable only as a form field on the edit page, same as the add form already offers; no pause/cancel buttons on the list.
- **No renewal dates or totals on the list page** — the dashboard (and S-05's upcoming-renewals work, in flight in a parallel worktree) own those surfaces. The list shows status + raw and normalized costs.
- **No dashboard changes beyond one added link line** — S-05 is editing `dashboard.astro` in parallel; anything more risks a merge conflict.
- **No `GET /api/subscriptions/[id]`** — no consumer; the edit page reads via the service server-side.
- **No custom 404 page** (`src/pages/404.astro`) — a bare 404 response satisfies the slice; a styled 404 page is unowned polish.
- **No service or schema changes** — F-01's service contract and S-01's schemas are consumed as-is (the whole point of the F2 handoff).
- **No migrations, no deploy config changes, no E2E tests** (module 3 covers E2E separately).

## Implementation Approach

Three phases along the dependency chain: item API routes (+ pin the schema contract with tests) → list page with delete → edit page with the generalized form.

- **Item route mirrors the collection route.** `src/pages/api/subscriptions/[id].ts` follows `index.ts` conventions exactly (401 guard, per-request client, `json()` helper, `z.flattenError` wire shape, generic 500). A `z.uuid()` pre-check turns malformed ids into 404s instead of Postgres-driven 500s.
- **Full-field PATCH from the form; partial PATCH remains a valid API contract.** The edit form submits the complete field set (reusing the add form's `buildPayload` and client-side `subscriptionCreateSchema` validation unchanged); `subscriptionUpdateSchema` on the server still enforces the empty-patch and pair guards for any other client.
- **One form component, two modes.** `AddSubscriptionForm.tsx` is renamed/generalized to `SubscriptionForm.tsx` taking optional `subscription` (prefill source; presence = edit mode). Add mode: POST → `/dashboard` (unchanged behavior). Edit mode: PATCH → `/subscriptions`. No duplication of the 300-line field markup.
- **Delete is a small island with native confirmation.** `DeleteSubscriptionButton.tsx` wraps `window.confirm` + `fetch DELETE` + full navigation on success (fresh SSR — the established "no stale aggregates" mechanism). Native confirm is accessible, dependency-free, and satisfies FR-007's confirmation requirement; a styled dialog is S-04-adjacent polish if ever needed.
- **List and edit pages are SSR Astro** (React only where interactivity demands it — the delete button and the form). 404s are returned before rendering.

## Phase 1: Item API routes (PATCH + DELETE) and schema contract tests

### Overview

The write paths for FR-006/FR-007: `PATCH` and `DELETE` on `/api/subscriptions/[id]`, plus unit tests pinning `subscriptionUpdateSchema`'s guards (the F2 handoff becomes enforced, tested behavior).

### Changes Required:

#### 1. Item API route

**File**: `src/pages/api/subscriptions/[id].ts` (new)

**Intent**: Authenticated, validated update and delete for a single subscription, delegating to the F-01 service; 404 for anything the caller can't see (foreign, nonexistent, malformed id — indistinguishable by design).

**Contract**: Both handlers share the `index.ts` conventions (`locals.user` → 401; `createClient` `null` → 500; `json()` helper). Id from `context.params.id` is checked with `z.uuid()` — failure → `404 {"error": "Not found"}` before any service call.

- `PATCH`: unparsable JSON → `400 {"error": "Invalid JSON body"}`; `subscriptionUpdateSchema.safeParse` failure → `400 { errors: z.flattenError(...) }` (same wire shape as POST — the empty-patch guard surfaces here as a formError); `updateSubscription` → `null` → `404 {"error": "Not found"}`; success → `200` with the updated `Subscription` row; service throw → `500 {"error": "Could not update subscription"}`.
- `DELETE`: no body parsing; `deleteSubscription` → `false` → `404 {"error": "Not found"}`; success → `204` (empty body); service throw → `500 {"error": "Could not delete subscription"}`.

#### 2. Update-schema unit tests

**File**: `src/lib/validation/subscriptions.test.ts` (new)

**Intent**: Pin the S-01-defined update contract now that it has a consumer: the empty-patch rejection (F2), the cycle/interval pairing rules, and representative accept cases. Follows the S-02 Vitest example-based style in `src/lib/billing.test.ts`.

**Contract**: `npm test` covers at least: `{}` rejected with "Provide at least one field to update"; cycle without interval (and interval without cycle) rejected; `custom` + `null` interval rejected; non-custom + numeric interval rejected; single-field patch (`{ name }`) accepted; full-field payload (as the edit form sends, non-custom + `null` interval) accepted; `custom` + interval accepted; unknown-key-only payload (e.g. `{ id: … }`) does not count as a non-empty patch (zod strips unknown keys before the refine — this is load-bearing: without it, `{"id": "…"}` would pass the guard and PostgREST would get an empty patch).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npx astro check` passes
- `npm run build` passes
- `npm test` passes (new schema tests green)

#### Manual Verification:

Curl against local Supabase + dev server (Origin header required by Astro CSRF), fresh `s03-*` users:

- No cookie → PATCH and DELETE both 401
- `PATCH {}` → 400 with "Provide at least one field to update" (F2 guard live on the wire)
- `PATCH {"name": "Renamed"}` → 200, row shows new name and unchanged other fields
- `PATCH {"billing_cycle": "custom"}` (no interval) → 400 naming `billing_interval_months`
- PATCH/DELETE with a second user's subscription id → 404 (body identical to nonexistent)
- PATCH/DELETE with a malformed id (`not-a-uuid`) → 404 (not 500)
- `DELETE` own id → 204; repeat → 404; row gone from the list

**Implementation Note**: After automated verification passes, pause for manual confirmation of the curl checks before Phase 2.

---

## Phase 2: Subscription list page with delete, dashboard navigation

### Overview

The FR-005/FR-007 surface: `/subscriptions` SSR list of every subscription with status and normalized costs, per-row Edit link and confirmed Delete, plus the single dashboard link that makes the surface reachable.

### Changes Required:

#### 1. Delete button island

**File**: `src/components/subscriptions/DeleteSubscriptionButton.tsx` (new)

**Intent**: The only interactivity the list needs — confirm, DELETE, refresh.

**Contract**: Props `{ id: string; name: string }`. Click → `window.confirm` naming the subscription (e.g. `Delete "Netflix"? This cannot be undone.`); cancel → no request. Confirm → `fetch(`/api/subscriptions/${id}`, { method: "DELETE" })`; `204` → `window.location.assign("/subscriptions")` (fresh SSR); `401` → assign `/auth/signin`; `404`/other → inline error text near the button (row may be stale — the reload path clears it). Disabled while in flight. No `"use client"`; `cn()` for classes; shadcn `Button` variant consistent with the destructive action.

#### 2. List page

**File**: `src/pages/subscriptions/index.astro` (new)

**Intent**: FR-005 — all subscriptions, any status, status visible, costs normalized; the management hub the dashboard links to.

**Contract**: Frontmatter mirrors `dashboard.astro`: `createClient` (null → config notice), `listSubscriptions`, per-row `normalizeCost`. Renders: header ("Subscriptions", links to `/dashboard` and `/subscriptions/new`); empty state with add prompt when zero rows; otherwise one card/row per subscription — name, status badge (capitalize pattern from the dashboard), category, raw cost + `formatCycle`, normalized monthly/yearly via `formatMoney`, an Edit link to `/subscriptions/${id}/edit`, and `<DeleteSubscriptionButton client:load ... />`. No totals, no renewal dates (dashboard/S-05 own those). Mobile-first, cosmic dark styling per the existing pages.

#### 3. Dashboard navigation link

**File**: `src/pages/dashboard.astro`

**Intent**: Make the list reachable (the slice's only dashboard touch — S-05 edits this file in parallel; keep the diff to one added line).

**Contract**: One `<a href="/subscriptions">Manage</a>` line in the existing header button group, styled like the adjacent "Add subscription"/sign-out controls.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npx astro check` passes
- `npm run build` passes
- `npm test` passes

#### Manual Verification:

- `/subscriptions` unauthenticated → redirect to signin
- Signed-in user with mixed subscriptions (active/paused/cancelled, PLN/EUR, custom cycle): every row renders with status badge, raw cost + cycle label, normalized monthly/yearly matching the dashboard's numbers
- Zero subscriptions → explanatory empty state with add link
- Delete: confirm dialog names the subscription; Cancel → row stays, no request; OK → list re-renders without the row; dashboard totals no longer include it
- Dashboard shows the Manage link; it navigates to the list; `git diff dashboard.astro` is a single added line
- Edit links point at `/subscriptions/<id>/edit` (page arrives in Phase 3 — transiently 404s; acceptable mid-change)

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Edit page with the generalized subscription form

### Overview

FR-006: generalize the add form into a dual-mode `SubscriptionForm`, host it on an SSR-prefilled `/subscriptions/[id]/edit` page, 404 for ids the user can't see.

### Changes Required:

#### 1. Generalize the form island

**File**: `src/components/subscriptions/SubscriptionForm.tsx` (renamed from `AddSubscriptionForm.tsx`)

**Intent**: One component for add and edit — the field markup, validation wiring, and error rendering are identical; only initial values, HTTP call, and success destination differ.

**Contract**: Props `{ subscription?: Subscription }` (from `@/types`; presence = edit mode). Initial state: strings derived from `subscription` (`amount` → `String(amount)`, `billing_interval_months` `null` → `""`, `note` `null` → `""`) or the current add-mode defaults. `buildPayload()` and client pre-validation via `subscriptionCreateSchema` stay exactly as they are — the full-field payload is valid for both endpoints (Key Discoveries). Submit: add → `POST /api/subscriptions`, 201 → `/dashboard` (unchanged); edit → `PATCH /api/subscriptions/${subscription.id}`, 200 → `/subscriptions`. Edit mode additionally maps `404` → form-level "This subscription no longer exists." message. Submit label "Add subscription" / "Save changes". `src/pages/subscriptions/new.astro` import updated to `SubscriptionForm`; `AddSubscriptionForm.tsx` deleted.

#### 2. Edit page

**File**: `src/pages/subscriptions/[id]/edit.astro` (new)

**Intent**: Protected, SSR-prefilled host page; the 404 boundary for page-level access to foreign/nonexistent ids.

**Contract**: Frontmatter: `createClient` (null → config notice); `Astro.params.id` checked with `z.uuid()`, then `getSubscription`; malformed id or `null` result → `return new Response("Not found", { status: 404 })` before rendering. Otherwise `Layout` + heading + `<SubscriptionForm subscription={...} client:load />` + "Back to subscriptions" link, styled like `new.astro`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes
- `npx astro check` passes
- `npm run build` passes
- `npm test` passes

#### Manual Verification:

- Edit link from the list opens the form with every field prefilled to the row's values (including custom cycle showing its interval, note, status)
- Change name + amount → Save → lands on `/subscriptions` showing the new values; dashboard totals reflect the new amount
- Switch a monthly subscription to custom-3 → save → list shows "every 3 months"; switch back to monthly → interval stored `null`
- Edit a start date → dashboard next-renewal date re-derives from the new anchor (roadmap's named S-03 risk; SSR recompute makes this automatic — verify it, don't assume it)
- Client validation still blocks bad input in edit mode (empty name, 3-decimal amount) without a network call
- Foreign id (second `s03-*` user), nonexistent uuid, and malformed id → 404 response for the edit page
- `/subscriptions/new` still works end-to-end (add mode regression)
- Unauthenticated edit URL → redirect to signin

**Implementation Note**: After automated verification passes, pause for manual confirmation before closing the change.

---

## Testing Strategy

### Unit Tests:

- `src/lib/validation/subscriptions.test.ts` (Phase 1): the update-schema contract — empty-patch rejection (F2), pair rules, accept cases, unknown-key stripping. The create schema's behavior is exercised transitively by the S-01 form and stays untested here (no regression risk from this slice).

### Integration Tests:

- None automated (consistent with S-01; E2E arrives with module 3). Phase 1's curl checklist is the API-contract verification; Phases 2–3's walkthroughs cover the page → island → API → service → RLS → SSR loop.

### Manual Testing Steps:

1. `npx supabase status` for local keys; dev server with local-stack env; two fresh `s03-*` users (the second exists to prove 404 anonymity).
2. Phase 1 curl checklist (401 / 400 empty patch / 400 pair / 200 / 204 / 404 foreign / 404 malformed).
3. Phase 2 list walkthrough (render, statuses, normalized costs, delete confirm/cancel, dashboard link).
4. Phase 3 edit walkthrough (prefill, save, cycle round-trip, 404s, add regression).
5. `npm run lint && npx astro check && npm run build && npm test` — CI parity.

## Performance Considerations

- List page is one `listSubscriptions` query + O(n) arithmetic over ≤30 rows (PRD scale) — same profile as the dashboard, well inside the 2 s NFR.
- Delete/edit use full navigations, not client caches — zero staleness machinery, matching the S-01 decision.

## Migration Notes

- No schema changes, no migrations, no deploy-config changes. Ships as app code only; rollback = redeploy previous worker.
- Parallel-work constraint: S-05 edits `dashboard.astro` in another worktree — this slice's dashboard diff must stay a single added line to keep the merge trivial.

## References

- Roadmap item: `context/foundation/roadmap.md` — S-03 "Manage the subscription list"
- Requirements: `context/foundation/prd.md` — FR-005, FR-006, FR-007
- F2 handoff: `context/changes/private-subscription-store/reviews/impl-review.md` (finding F2) → `subscriptionUpdateSchema` in `src/lib/validation/subscriptions.ts:119-164`
- Conventions: `src/pages/api/subscriptions/index.ts` (endpoint), `src/components/subscriptions/AddSubscriptionForm.tsx` (form island), `src/pages/dashboard.astro` (SSR list rendering)
- Service contract: `src/lib/services/subscriptions.ts`; middleware gate: `src/middleware.ts`
- Lessons check: `context/foundation/lessons.md` — ACL lesson (no new tables), Workers assets lesson (no deploy config)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Item API routes (PATCH + DELETE) and schema contract tests

#### Automated

- [x] 1.1 `npm run lint` passes — 5d4b294
- [x] 1.2 `npx astro check` passes — 5d4b294
- [x] 1.3 `npm run build` passes — 5d4b294
- [x] 1.4 `npm test` passes (new schema tests green) — 5d4b294

#### Manual

- [x] 1.5 No cookie → PATCH and DELETE both 401 — 5d4b294
- [x] 1.6 `PATCH {}` → 400 "Provide at least one field to update" — 5d4b294
- [x] 1.7 `PATCH {"name": ...}` → 200 with updated row, other fields unchanged — 5d4b294
- [x] 1.8 `PATCH {"billing_cycle": "custom"}` without interval → 400 — 5d4b294
- [x] 1.9 Foreign id → 404 for PATCH and DELETE (identical to nonexistent) — 5d4b294
- [x] 1.10 Malformed id → 404 (not 500) — 5d4b294
- [x] 1.11 DELETE own id → 204; repeat → 404 — 5d4b294

### Phase 2: Subscription list page with delete, dashboard navigation

#### Automated

- [x] 2.1 `npm run lint` passes — 679e0ab
- [x] 2.2 `npx astro check` passes — 679e0ab
- [x] 2.3 `npm run build` passes — 679e0ab
- [x] 2.4 `npm test` passes — 679e0ab

#### Manual

- [x] 2.5 Unauthenticated `/subscriptions` → redirect to signin — 679e0ab
- [x] 2.6 Mixed subscriptions render with status badge, raw + normalized costs matching dashboard — 679e0ab
- [x] 2.7 Zero subscriptions → explanatory empty state — 679e0ab
- [x] 2.8 Delete: cancel keeps row (no request); confirm removes row; totals updated — 679e0ab
- [x] 2.9 Dashboard Manage link works; dashboard.astro diff is one added line — 679e0ab
- [x] 2.10 Edit links point at `/subscriptions/<id>/edit` (page arrives in Phase 3 — transiently 404s; acceptable mid-change) — 679e0ab

> Phase 2 verification notes (run autonomously): lint/astro check (0 errors)/build/test all exit 0 (61 tests). Smoke on local stack (dev server port 4401, `.env`/`.dev.vars` temporarily pointed at local Supabase, restored after the run): unauth `/subscriptions` 302 → signin; user with active/paused/cancelled × PLN/EUR × monthly/yearly/custom-3 rows — all names, status badges, "every 3 months" label, raw + normalized costs (43.00/516.00 PLN; €120 yearly → €10.00 monthly) rendered; fresh user sees the empty state; DELETE flow: 204, fresh SSR render drops the row, dashboard totals lose the deleted active sub's amount; dashboard has exactly one `href="/subscriptions"` Manage link. `git diff --numstat dashboard.astro` = 3 added / 0 deleted — prettier's Astro parser force-wraps the anchor to 3 physical lines (single added element, still purely additive; the plan's "one added line" is satisfied in spirit, enforced by eslint-plugin-prettier). The confirm-dialog cancel path (`window.confirm` returning false → early return, no request) is client-side JS verified by code inspection — no headless browser dependency available in this worktree; browser-level interaction is E2E scope (module 3).

> Phase 3 verification notes (run autonomously): lint/astro check (0 errors)/build/test all exit 0 (61 tests); prettier clean. Implementation deviation: the plan's `return new Response(..., 404)` in edit.astro frontmatter crashes astro-eslint-parser (`no-misused-promises`: "Expected node to have a parent" on a top-level return) — replaced with `Astro.response.status = 404` plus a rendered minimal not-found body (same status contract, small UX gain). Smoke on local stack: edit page SSR prefills every field via serialized island props (name, amount 30, custom cycle + interval 3, start 2026-01-31, category, paused status, note "family plan") with a "Save changes" label; full-field PATCH rename+amount → list reflects; cycle round-trip custom-3 → monthly (interval null) → custom-3, list label "every 3 months" correct; start-date edit 2026-07-15 → 2026-07-20 re-derived the dashboard next renewal 2026-08-15 → 2026-08-20 (3.7b, the roadmap's named risk); foreign/nonexistent/malformed edit URLs → 404, unauth → 302 signin; /subscriptions/new renders the shared form in add mode and POST 201 still works. 3.8 (client pre-validation blocks bad input with zero network calls) is client-side JS verified by code inspection — the safeParse-before-fetch wiring is byte-identical to the S-01 form whose behavior was browser-verified in S-01's phase 3; browser-level re-verification is E2E scope (module 3). Dev-only note: a stale vite optimized-deps cache after hot-reload made radix Select SSR throw ("null useMemo") mid-smoke — fixed by restarting `astro dev` with `node_modules/.vite` cleared; not reproducible in `npm run build`.

### Phase 3: Edit page with the generalized subscription form

#### Automated

- [x] 3.1 `npm run lint` passes
- [x] 3.2 `npx astro check` passes
- [x] 3.3 `npm run build` passes
- [x] 3.4 `npm test` passes

#### Manual

- [x] 3.5 Edit form prefilled with the row's values (incl. custom interval, note, status)
- [x] 3.6 Save name/amount change → list and dashboard reflect it
- [x] 3.7 Cycle round-trip: monthly → custom-3 → monthly (interval stored null)
- [x] 3.7b Start-date edit → dashboard next renewal re-derived from the new anchor
- [x] 3.8 Client validation blocks bad input in edit mode without a network call
- [x] 3.9 Foreign / nonexistent / malformed id → 404 for the edit page
- [x] 3.10 `/subscriptions/new` add flow regression passes
- [x] 3.11 Unauthenticated edit URL → redirect to signin

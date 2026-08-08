# Status Lifecycle Quick Actions (S-04) Implementation Plan

## Overview

Give the user one-click lifecycle actions on the subscription list — pause,
resume, cancel (with confirmation), reactivate — without entering the full edit
form (US-04, FR-008). After each action a full navigation re-renders the list
from fresh SSR, and because every aggregation already counts only `active`
subscriptions, totals and upcoming renewals reflect the change immediately and
consistently across the dashboard, category, and renewals views.

## Current State Analysis

- **Status editing already works** through the S-03 form: `subscriptionUpdateSchema`
  (`src/lib/validation/subscriptions.ts:119`) includes `status` as a partial
  field, and a `{ status: "paused" }` patch passes its refinements (non-empty
  patch, no cycle/interval pairing involved). PATCH
  `/api/subscriptions/[id]` (`src/pages/api/subscriptions/[id].ts:24`) needs no
  change.
- **The aggregation rule is already in one place and already active-only**:
  `summarizeActive` (`src/lib/billing.ts:88`) filters `status !== "active"`,
  `summarizeByCategory` (`billing.ts:120`) delegates to it, and
  `upcomingRenewals` (`billing.ts:148`) has the same filter. All are unit-tested
  (94 unit tests green). The dashboard (`src/pages/dashboard.astro`) recomputes
  from the store on every SSR render — that recompute IS the "no stale
  aggregates" mechanism.
- **The gap is purely convenience**: changing status today requires opening
  `/subscriptions/[id]/edit` and re-submitting the whole form. FR-008/US-04 wants
  a quick lifecycle control on the list surface.
- **An established island pattern exists**: `DeleteSubscriptionButton.tsx` is the
  exact shape to mirror — `window.confirm` for the destructive intent, `fetch` to
  the item route, `window.location` full navigation on success, 401 → signin,
  404 → reload (stale row), inline `role="alert"` error, disabled-while-pending.
- **Auth/CSRF**: middleware sets `locals.user`; the API route answers its own
  401. Astro's `security.checkOrigin` gates only form-like content types; the
  island's JSON PATCH is protected by the browser CORS preflight plus
  `SameSite=Lax` session cookies. (Corrected per impl-review F1 — the original
  wording overstated checkOrigin's reach; smoke confirmed JSON needs no
  `Origin` header server-side.)

## Desired End State

On `/subscriptions`, each row shows quick actions appropriate to its status:

- `active` → **Pause**, **Cancel** (confirmation dialog)
- `paused` → **Resume**, **Cancel** (confirmation dialog)
- `cancelled` → **Reactivate**

Clicking an action PATCHes `{ status: <target> }` and performs a full
navigation; the row stays listed with its new status badge, and the dashboard's
totals, category breakdown, and upcoming renewals immediately reflect the
change (active-only rule). Verify: unit tests for the transition table, full
gate (lint, astro check, build, unit tests), and a curl smoke proving
US-04's acceptance criteria end-to-end against the local stack.

### Key Discoveries:

- `subscriptionUpdateSchema` already accepts a lone `status` patch —
  `src/lib/validation/subscriptions.ts:119-164`; no API/schema change needed.
- All three aggregations already exclude paused/cancelled —
  `src/lib/billing.ts:88,120,148`; no aggregation change needed, and adding
  tests there would duplicate existing coverage.
- `DeleteSubscriptionButton.tsx` is the pattern for the new island (confirm →
  fetch → navigate; error contract per response status).
- The list page (`src/pages/subscriptions/index.astro:91-99`) has an actions
  cluster (`Edit` link + delete island) where status actions slot in.
- `Subscription` / `SubscriptionStatus` domain types come from `@/types`, never
  from generated DB types.

## What We're NOT Doing

- No API, schema, service, or migration changes — the PATCH surface is complete.
- No changes to `billing.ts` or its tests — the active-only rule is implemented
  and unit-tested; re-testing it here would duplicate S-01/S-06 coverage.
- No status actions on the dashboard — the list page is the management hub
  (FR-005); the dashboard stays read-only.
- No optimistic UI / client cache — full navigation is the established
  freshness mechanism ("no stale aggregates" via SSR recompute).
- No filter/sort by status (FR-015 — parked nice-to-have).
- No new shadcn primitives — `Button` + `window.confirm` (the
  DeleteSubscriptionButton precedent) cover the UX.

## Implementation Approach

Two small phases. First, the FR-008 transition rule as pure data + logic in
`src/lib/lifecycle.ts` (which action targets which status, which needs
confirmation) with hand-derived unit tests — this is the only new pure logic in
the slice. Second, a `StatusActions` React island that renders
`statusActions(status)` and mirrors the delete island's fetch/navigation/error
contract, wired into the list page next to Edit/Delete. Everything else
(validation, API, RLS, aggregation, SSR freshness) is already in place and is
exercised end-to-end by a curl smoke against the local Supabase stack.

## Phase 1: Lifecycle transition table (pure logic + unit tests)

### Overview

Encode FR-008's allowed transitions and their UX contract (label, target
status, confirmation requirement) as a pure, typed module — the single source
of truth the island renders from.

### Changes Required:

#### 1. Transition table

**File**: `src/lib/lifecycle.ts` (new)

**Intent**: Define the per-status quick actions so the UI cannot invent or drop
a transition: active → pause/cancel, paused → resume/cancel, cancelled →
reactivate. Cancel is the only action that requires confirmation (destructive
user intent — US-04 pairs it with a confirm; pause/resume/reactivate are
instantly reversible).

**Contract**: `export interface StatusAction { label: string; target: SubscriptionStatus; confirm: boolean }` and
`export function statusActions(status: SubscriptionStatus): StatusAction[]`.
Pure, no I/O, imports types from `@/types` only (client-safe — the island
bundles it). Exhaustive over `SubscriptionStatus` (compile-time `switch` or
`Record` so a new enum value fails the type check).

#### 2. Unit tests

**File**: `src/lib/lifecycle.test.ts` (new)

**Intent**: Pin the FR-008 transition table with oracles hand-derived from the
PRD (US-04 + FR-008), per the test-plan §6.1 oracle rule: exact action sets per
status, targets, and the cancel-confirms/others-don't contract.

**Contract**: Colocated Vitest suite, `src/lib/**/*.test.ts` naming; runs in
`npm test` and lefthook's `vitest related`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Unit tests pass (new lifecycle suite included): `npm test`

#### Manual Verification:

- (none — pure logic phase; UI behavior is verified in Phase 2)

---

## Phase 2: StatusActions island wired into the list

### Overview

Render the transition table as per-row quick actions on `/subscriptions`,
PATCHing the status and re-rendering via full navigation; verify the whole
slice with the full gate plus a curl smoke of US-04's acceptance criteria.

### Changes Required:

#### 1. StatusActions island

**File**: `src/components/subscriptions/StatusActions.tsx` (new)

**Intent**: One React island per row that renders a small `Button` (variant
`outline`, size `sm` — visually distinct from the destructive Delete) for each
`statusActions(status)` entry and performs the status PATCH. Mirrors
`DeleteSubscriptionButton.tsx`'s contract exactly: `window.confirm` when
`action.confirm` (message naming the subscription and explaining cancelled
stays listed but leaves totals/renewals), `fetch` PATCH
`/api/subscriptions/[id]` with a JSON `{ status }` body, on 200 →
`window.location.reload()` (fresh SSR list), 401 → `window.location.assign("/auth/signin")`,
404 → `window.location.reload()` (stale row), other/network → inline
`role="alert"` error; both status buttons in the island disabled while a
request is pending. (The delete island is separate and stays clickable — the
cross-island race is accepted: harmless under RLS, loser answers 404 → reload.)

**Contract**: `export default function StatusActions({ id, name, status }: { id: string; name: string; status: SubscriptionStatus })`.
Client-safe imports only (`react`, `@/components/ui/button`,
`@/lib/lifecycle`, types from `@/types`). No Next.js directives.

#### 2. List page wiring

**File**: `src/pages/subscriptions/index.astro`

**Intent**: Mount `<StatusActions client:load id name status>` in each row's
actions cluster (before Edit/Delete), so every row exposes its lifecycle
actions next to the existing management actions. No other page changes.

**Contract**: Astro island mount with `client:load`, same hydration pattern as
`DeleteSubscriptionButton`.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Types check: `npx astro check`
- Build passes: `npm run build`
- Unit tests pass: `npm test`

#### Manual Verification:

- Smoke (dev server on :4405 against local Supabase, fresh `s04-*` user, curl
  with `Origin` header on writes; US-04 acceptance criteria):
  1. Seed an active monthly 120 PLN subscription renewing within 30 days →
     dashboard shows it in totals and upcoming renewals.
  2. **Pause** → totals drop by 120 PLN monthly / 1440 PLN yearly, category row
     shrinks accordingly, renewal disappears, row stays listed as `paused`.
  3. **Resume** → totals and renewal restored.
  4. **Cancel** → same exclusion as paused; row stays listed as `cancelled`
     (confirmation covered by the shared `window.confirm` pattern).
  5. **Reactivate** → back in totals and renewals.
- List page renders the correct action set per status (Pause/Cancel on active,
  Resume/Cancel on paused, Reactivate on cancelled).

---

## Testing Strategy

### Unit Tests:

- `src/lib/lifecycle.test.ts` — exact action set per status (labels, targets,
  confirm flags), hand-derived from US-04/FR-008. Nothing else: aggregation
  status-filtering is already pinned by the existing billing suites, and
  re-testing it would violate the "don't duplicate coverage" scope rule.

### Integration Tests:

- None added: no migration and no API-route change (the test-plan §5 gate
  triggers on those), and RLS/status-CHECK parity for `subscriptions` is
  already covered by `src/tests/integration/`. Existing suite must stay green
  if run.

### Manual Testing Steps:

1. Run the Phase 2 smoke (see Phase 2 Manual Verification) — it walks US-04's
   given/when/then plus the reactivate path.
2. Visually confirm per-status action sets and the cancel confirmation dialog
   in a browser (secondary; the curl smoke covers state transitions).

## Performance Considerations

None — one extra island per row (same weight class as the delete button), no
new queries; SSR recompute per render is the established model at 5–30 rows.

## Migration Notes

None — no schema or data changes.

## References

- Change folder: `context/changes/status-lifecycle-totals/change.md`
- Roadmap item: S-04 in `context/foundation/roadmap.md`
- PRD: US-04, FR-008, Business Logic §3 in `context/foundation/prd.md`
- Pattern to mirror: `src/components/subscriptions/DeleteSubscriptionButton.tsx`
- Update surface: `src/pages/api/subscriptions/[id].ts`,
  `src/lib/validation/subscriptions.ts:119`
- Aggregation rule (unchanged): `src/lib/billing.ts:88,120,148`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Lifecycle transition table (pure logic + unit tests)

#### Automated

- [x] 1.1 Lint passes: `npm run lint` — 6bdc143
- [x] 1.2 Unit tests pass (new lifecycle suite included): `npm test` — 6bdc143

### Phase 2: StatusActions island wired into the list

#### Automated

- [x] 2.1 Lint passes: `npm run lint` — 0efaaa8
- [x] 2.2 Types check: `npx astro check` — 0efaaa8
- [x] 2.3 Build passes: `npm run build` — 0efaaa8
- [x] 2.4 Unit tests pass: `npm test` — 0efaaa8

#### Manual

- [x] 2.5 Smoke: pause → totals drop and renewal disappears; resume → restored; cancel → excluded but listed as cancelled; reactivate → restored (US-04) — 0efaaa8
- [x] 2.6 List page renders the correct action set per status — 0efaaa8

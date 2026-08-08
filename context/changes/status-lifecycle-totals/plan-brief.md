# Status Lifecycle Quick Actions (S-04) — Plan Brief

> Full plan: `context/changes/status-lifecycle-totals/plan.md`

## What & Why

Let the user pause, resume, cancel (with confirmation), or reactivate a
subscription with one click on the list page (US-04, FR-008), instead of
round-tripping through the full edit form. Totals and upcoming renewals must
visibly reflect the change immediately — that consistency is the slice's whole
point.

## Starting Point

S-03 shipped the list + edit + PATCH `/api/subscriptions/[id]`, and
`subscriptionUpdateSchema` already accepts a lone `{ status }` patch. All three
aggregations (`summarizeActive`, `summarizeByCategory`, `upcomingRenewals`)
already count only `active` subscriptions and are unit-tested. The gap is purely
the convenient lifecycle control — no data-layer or API work remains.

## Desired End State

On `/subscriptions`: active rows offer **Pause** / **Cancel** (confirm), paused
rows **Resume** / **Cancel** (confirm), cancelled rows **Reactivate**. An action
PATCHes the status and fully re-navigates; the row stays listed with its new
status badge, and the dashboard's totals, category breakdown, and renewals
update on next render (SSR recompute — the established freshness mechanism).

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Action surface | `/subscriptions` list only | The list is the management hub (FR-005); dashboard stays read-only |
| Transition rule | Pure `statusActions()` table in `src/lib/lifecycle.ts` + unit tests | The only new pure logic in the slice; typed exhaustively so UI can't drift from FR-008 |
| Confirmation | `window.confirm` on Cancel only | Matches the delete precedent; pause/resume/reactivate are instantly reversible |
| Wire | New `StatusActions.tsx` island mirroring `DeleteSubscriptionButton` | Proven fetch → full-navigation → error contract; no new patterns |
| API/schema | Zero changes | PATCH + update schema already handle `{ status }`; touching them adds risk for nothing |
| Aggregation tests | None added | Active-only rule already unit-tested; smoke proves cross-view consistency end-to-end |

## Scope

**In scope:** `src/lib/lifecycle.ts` + tests; `StatusActions.tsx` island; one
mount line in `src/pages/subscriptions/index.astro`.

**Out of scope:** API/schema/service/migration changes; `billing.ts`; dashboard
actions; optimistic UI; status filtering (FR-015, parked); new shadcn
primitives.

## Architecture / Approach

Row → `statusActions(status)` (pure table) → button click → optional
`window.confirm` → `fetch` PATCH `{ status }` → 200 → `location.reload()` →
fresh SSR everywhere (list badge, dashboard totals/categories/renewals all
recompute from the store). Error contract identical to the delete island
(401 → signin, 404 → reload, else inline alert).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Transition table | `lifecycle.ts` + hand-derived unit tests | Encoding a transition the PRD doesn't allow (pinned by oracles from US-04/FR-008) |
| 2. Island + wiring | Per-row quick actions live on the list | Drifting from the established island contract (mirrored from delete button) |

**Prerequisites:** local Supabase stack running (smoke); S-03 shipped (done).
**Estimated effort:** 1 session, 2 small phases.

## Open Risks & Assumptions

- Full-page reload after every action is accepted UX (matches delete; no
  client cache exists to invalidate).
- Cancel keeps the row (delete remains the only removal path) — explicit in
  the confirm copy so users aren't surprised.

## Success Criteria (Summary)

- Unit suite pins the per-status action sets and confirm contract.
- Full gate green: lint, `astro check`, build, `npm test`.
- Curl smoke on the local stack proves US-04: pause drops totals and hides the
  renewal, resume restores, cancel excludes-but-lists, reactivate restores.

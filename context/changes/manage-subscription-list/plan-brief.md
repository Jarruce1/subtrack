# Manage the Subscription List (S-03) — Plan Brief

> Full plan: `context/changes/manage-subscription-list/plan.md`

## What & Why

Roadmap slice S-03: the management surface for the subscription store — view all subscriptions with status (FR-005), edit any field (FR-006), delete with confirmation (FR-007). Without it the product can record subscriptions but never correct or retire them; S-04 (status lifecycle) and S-07 (duplicate warning) both build on this surface.

## Starting Point

F-01 delivered the full CRUD service layer (`updateSubscription`/`deleteSubscription` already return not-found signals under RLS) and S-01 pre-defined `subscriptionUpdateSchema` — including the empty-patch guard from F-01's impl-review finding F2 — with no consumer yet. The add form, endpoint conventions, middleware gating for `/subscriptions/*`, and the Vitest harness (S-02) all exist. What's missing is purely the item API routes and the two pages.

## Desired End State

Dashboard → "Manage" link → `/subscriptions` listing every subscription (any status) with status badge and normalized monthly/yearly costs → per-row Edit (prefilled form, saves any field via PATCH) and Delete (confirmation, then gone). Foreign, nonexistent, and malformed ids answer 404 — indistinguishable from each other. `PATCH {}` is rejected with a clear error.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Edit form payload | Full field set PATCH (not a diff) | Always satisfies the schema's non-empty and cycle/interval-pair guards, and reuses the add form's payload builder unchanged; partial PATCH stays a valid API contract for other clients. |
| Form reuse | Rename `AddSubscriptionForm` → dual-mode `SubscriptionForm` (`subscription?` prop) | The 300-line field markup and validation wiring are identical in both modes; duplication would drift. |
| Delete confirmation | `window.confirm` in a small island | Dependency-free, accessible, satisfies FR-007; a styled dialog is unowned polish. |
| Malformed ids | `z.uuid()` pre-check → 404 | Without it Postgres throws on non-UUID ids and the route would answer 500. |
| Foreign vs nonexistent | Both 404, identical body | RLS makes them indistinguishable at the service layer — deliberate anonymity (F-01 decision). |
| List page content | Status + raw + normalized costs only | Renewal dates/totals belong to the dashboard and S-05 (parallel worktree); keeps the list lean and conflict-free. |
| Dashboard touch | Exactly one added link line | S-05 edits `dashboard.astro` in parallel; a one-line diff merges trivially. |
| Schema tests | Pin `subscriptionUpdateSchema` in Phase 1 | The F2 guard finally has a consumer; the harness (S-02) should enforce the contract, not just the plan text. |

## Scope

**In scope:** `PATCH`/`DELETE /api/subscriptions/[id]`; `/subscriptions` list page; delete-button island; `/subscriptions/[id]/edit` page; `SubscriptionForm` generalization; one dashboard link line; update-schema unit tests.

**Out of scope:** duplicate-name warning (S-07); status quick-actions (S-04); renewal info on the list (S-05/dashboard); `GET /api/subscriptions/[id]`; custom 404 page; any service/schema/migration changes; E2E tests.

## Architecture / Approach

Item route mirrors the existing collection route conventions (401 guard, per-request Supabase client, `z.flattenError` wire shape); pages are SSR Astro with React islands only where interactivity demands (form, delete button); success paths use full navigations so every render is fresh SSR — the established "no stale aggregates" mechanism.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Item API + schema tests | PATCH/DELETE with 401/400/404 contract; F2 guard tested and live | uuid pre-check missed → 500s on malformed ids |
| 2. List + delete + nav | FR-005 surface, FR-007 delete, dashboard link | dashboard.astro merge conflict with S-05 (mitigated: one line) |
| 3. Edit page + shared form | FR-006 prefilled edit; add form regression-safe | prefill/state mapping errors (null interval/note) |

**Prerequisites:** S-01 shipped (done); local Supabase for smoke checks.
**Estimated effort:** ~1 session, 3 phases.

## Open Risks & Assumptions

- Phase 2's Edit links 404 until Phase 3 lands — acceptable transient state inside one change.
- Assumes `subscriptionCreateSchema`'s output is a valid `subscriptionUpdateSchema` input for the full-field payload (verified in Key Discoveries; pinned by a Phase 1 test case).
- S-05 merges may still conflict on `dashboard.astro` header whitespace; kept to a single added line to make resolution mechanical.

## Success Criteria (Summary)

- User can see all their subscriptions with status, edit any field with a prefilled form, and delete with confirmation — changes visible immediately on fresh SSR renders.
- Another user's ids (and malformed/nonexistent ids) answer 404 on both pages and API.
- `npm run lint`, `npx astro check`, `npm run build`, `npm test` all green; empty-patch guard verified on the wire.

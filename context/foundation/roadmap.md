---
project: "SubTrack"
version: 1
status: draft
created: 2026-08-08
updated: 2026-08-08
prd_version: 1
main_goal: speed
top_blocker: time
---

# Roadmap: SubTrack

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

People with 5–30 subscriptions have charges scattered across statements and inboxes, with no single place showing the real monthly/yearly total or the next renewal date. The value is not the list — it is the arithmetic: normalizing mixed billing cycles to a true monthly/yearly cost and computing exact next-renewal dates (including month-end and leap-year cases) is exactly what people get wrong by hand. A wrong number destroys the product's reason to exist, so correctness and per-user privacy are hard guardrails.

## North star

**S-01: user can register, add their first subscription, and see a dashboard with normalized monthly/yearly cost and next renewal date** — it is the PRD's primary success criterion made real end-to-end, and with a 3-week after-hours budget nothing else matters until this flow works.

> "North star" here means: the smallest end-to-end slice whose successful delivery
> would prove the core product hypothesis — placed as early as its prerequisites
> allow, because everything else only matters if this works.

## At a glance

| ID   | Change ID                   | Outcome (user can …)                                                              | Prerequisites | PRD refs                                                    | Status   |
| ---- | --------------------------- | --------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------- | -------- |
| F-01 | private-subscription-store  | (foundation) per-user subscription storage with enforced account isolation         | —             | FR-004, Access Control, NFR (privacy)                       | planning |
| S-01 | first-subscription-dashboard | register, add first subscription, see dashboard with normalized cost + next renewal | F-01          | US-01, FR-001, FR-002, FR-003, FR-004, FR-009, FR-010, FR-011 | proposed |
| S-02 | renewal-edgecase-correctness | trust renewal dates across month-end and leap-year cases                           | S-01          | US-02, FR-010, NFR (correctness)                            | proposed |
| S-03 | manage-subscription-list    | view all subscriptions with status, edit any field, delete an entry                | S-01          | FR-005, FR-006, FR-007                                      | proposed |
| S-04 | status-lifecycle-totals     | pause/cancel/reactivate and see totals + renewals reflect only active items        | S-03          | US-04, FR-008                                               | proposed |
| S-05 | upcoming-renewals-list      | see renewals due in the next 30 days, soonest first                                | S-01          | FR-013                                                      | proposed |
| S-06 | category-cost-breakdown     | see cost totals broken down per category                                           | S-01          | FR-012                                                      | proposed |
| S-07 | duplicate-name-warning      | get a non-blocking duplicate warning on add or rename, and save anyway             | S-01, S-03    | US-03, FR-014                                               | proposed |

## Streams

Navigation aid — groups items that share a Prerequisites chain. Canonical ordering still lives in the dependency graph below; this table is the proposed reading order across parallel tracks.

| Stream | Theme                   | Chain                          | Note                                                                     |
| ------ | ----------------------- | ------------------------------ | ------------------------------------------------------------------------ |
| A      | First flow & correctness | `F-01` → `S-01` → `S-02`       | The speed-goal critical path: unblock data, ship the north star, then harden the arithmetic that makes it trustworthy. |
| B      | Manage & lifecycle      | `S-03` → `S-04` / `S-07`       | Branches off Stream A at `S-01`; `S-04` and `S-07` can run in parallel once `S-03` lands. |
| C      | Insights                | `S-05` / `S-06`                | Two independent read-only views off Stream A at `S-01`; each can run in parallel with Stream B. |

## Baseline

What's already in place in the codebase as of 2026-08-08 (auto-researched, three parallel probes; matches the owner's stated understanding).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** partial — Astro 6 SSR + React 19 + Tailwind 4 wired (`astro.config.mjs`); auth pages and a placeholder dashboard (`src/pages/dashboard.astro`) exist; no domain UI at all.
- **Backend / API:** partial — auth endpoints only (`src/pages/api/auth/{signin,signup,signout}.ts`); no domain endpoints, no services, no shared domain types.
- **Data:** absent — `supabase/migrations/` does not exist; zero domain tables, zero SQL files, untyped data client.
- **Auth:** present — e-mail/password signup, signin, signout plus route-gating middleware (`src/middleware.ts`); working in production.
- **Deploy / infra:** present — Cloudflare Workers via `wrangler.jsonc` + adapter, app live in production; CI runs lint + build (`.github/workflows/ci.yml`); deploy itself is manual (auto-deploy-on-merge not wired — parked below).
- **Observability:** absent — no logging or error-tracking in the app; only platform-side log retention (`observability.enabled` in `wrangler.jsonc`). No PRD requirement forces more for the MVP.

Note: no automated tests exist yet. The verification harness for the renewal arithmetic arrives with S-02 — the first slice whose acceptance criteria need it.

## Foundations

### F-01: Private subscription store

- **Outcome:** (foundation) a persistent, per-user subscription store exists with isolation between accounts enforced at the data layer, able to hold the FR-004 field set (name, cost amount + currency, billing cycle, start date, category, status, optional note).
- **Change ID:** private-subscription-store
- **PRD refs:** FR-004 (field set), Access Control, NFR "one user's data is never visible to, or modifiable by, any other user"
- **Unlocks:** S-01, S-02, S-03, S-04, S-05, S-06, S-07 — every slice reads or writes this store; it is the single named gap blocking all vertical work.
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Deliberately minimal — one entity, no seeds, no extras — so S-01 still integrates the data layer end-to-end; getting the isolation policy wrong here would violate the PRD's privacy guardrail silently, which is why it is a foundation rather than a side effect of S-01.
- **Status:** planning

## Slices

### S-01: First subscription to dashboard

- **Outcome:** user can register, add their first subscription, and see a dashboard showing its normalized monthly and yearly cost and next renewal date — with an explanatory empty state before the first add, and totals that reflect the save immediately.
- **Change ID:** first-subscription-dashboard
- **PRD refs:** US-01; FR-004, FR-009, FR-010, FR-011; FR-001, FR-002, FR-003 (already satisfied by the auth baseline — this slice exercises them end-to-end rather than rebuilding them); NFR (no stale aggregates, 2s dashboard, mobile usability)
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The largest slice — it introduces the normalization and renewal arithmetic for the happy path; scope is held down by deferring month-end/leap-year hardening to S-02 and all list-management to S-03.
- **Status:** proposed

### S-02: Month-end and leap-year renewal correctness

- **Outcome:** user can trust displayed renewal dates for subscriptions started on month-end or Feb 29 — dates clamp to shorter months but stay anchored to the original start day, per the PRD's acceptance criteria.
- **Change ID:** renewal-edgecase-correctness
- **PRD refs:** US-02; FR-010; NFR "renewal dates and normalized costs are correct across month-end and leap-year boundaries"
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Silently wrong dates are the top product risk; this slice introduces the automated verification harness (none exists yet) because its acceptance criteria cannot be hand-checked reliably.
- **Status:** proposed

### S-03: Manage the subscription list

- **Outcome:** user can view a list of all their subscriptions with status visible, edit any field of an entry, and delete an entry.
- **Change ID:** manage-subscription-list
- **PRD refs:** FR-005, FR-006, FR-007
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Editing a start date or cycle must re-derive renewal dates from the new anchor; sequenced right after S-01 so the list surface exists before status- and duplicate-work builds on it.
- **Status:** proposed

### S-04: Status lifecycle drives totals

- **Outcome:** user can switch a subscription between active, paused, and cancelled; totals and upcoming renewals immediately count only active subscriptions, while paused/cancelled stay visible in the list with their status.
- **Change ID:** status-lifecycle-totals
- **PRD refs:** US-04; FR-008
- **Prerequisites:** S-03
- **Parallel with:** S-05, S-06, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The active-only aggregation rule cuts across dashboard, category, and renewals views; landing it after S-03 keeps the change surface to the status control plus the shared aggregation rule.
- **Status:** proposed

### S-05: Upcoming renewals list

- **Outcome:** user can see the list of renewals due in the next 30 days, soonest first, on the dashboard.
- **Change ID:** upcoming-renewals-list
- **PRD refs:** FR-013 (and the secondary success criterion — the monthly check-in habit)
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04, S-06, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Pure read-only derivation over data S-01 already computes; low risk, high habit value — a natural parallel-agent slice.
- **Status:** proposed

### S-06: Per-category cost breakdown

- **Outcome:** user can see monthly and yearly cost totals broken down per category (per currency, never converted), using the predefined category list.
- **Change ID:** category-cost-breakdown
- **PRD refs:** FR-012
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04, S-05, S-07
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Cheap once normalization exists (the PRD's own argument for keeping it); the only care point is reusing the exact same aggregation rule as the overall totals so the two never disagree.
- **Status:** proposed

### S-07: Duplicate warning on add and rename

- **Outcome:** user can see a warning when adding — or renaming to — a name whose normalized form (trimmed, lowercased, inner whitespace collapsed) matches an existing subscription, and can always save anyway.
- **Change ID:** duplicate-name-warning
- **PRD refs:** US-03; FR-014
- **Prerequisites:** S-01, S-03 (the rename path lives in the edit flow)
- **Parallel with:** S-04, S-05, S-06
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The cheapest business rule, but it guards the totals against double-tracked costs; must warn, never block — blocking would break the two-legitimate-accounts case.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                    | Suggested issue title                                    | Ready for `/10x-plan` | Notes                                        |
| ---------- | ---------------------------- | -------------------------------------------------------- | --------------------- | -------------------------------------------- |
| F-01       | private-subscription-store   | Per-user subscription store with account isolation       | yes                   | Run `/10x-plan private-subscription-store`   |
| S-01       | first-subscription-dashboard | First subscription to dashboard (register → add → see)   | no                    | Unblocks when F-01 lands                     |
| S-02       | renewal-edgecase-correctness | Month-end & leap-year renewal correctness                | no                    | Unblocks when S-01 lands                     |
| S-03       | manage-subscription-list     | Subscription list: view, edit, delete                    | no                    | Unblocks when S-01 lands                     |
| S-04       | status-lifecycle-totals      | Active/paused/cancelled lifecycle drives totals          | no                    | Unblocks when S-03 lands                     |
| S-05       | upcoming-renewals-list       | Upcoming renewals in the next 30 days                    | no                    | Unblocks when S-01 lands                     |
| S-06       | category-cost-breakdown      | Cost totals per category                                 | no                    | Unblocks when S-01 lands                     |
| S-07       | duplicate-name-warning       | Duplicate-name warning on add and rename                 | no                    | Unblocks when S-01 and S-03 land             |

## Open Roadmap Questions

None. PRD v1 has no open questions (category taxonomy was resolved 2026-08-08 — predefined list, see FR-004), and no cross-cutting unknowns surfaced during sequencing.

## Parked

- **Filter and sort the subscription list by category and status (FR-015)** — Why parked: the PRD's only nice-to-have; with a speed-driven sequence it ships only if time remains after all must-haves.
- **Bank or statement import** — Why parked: PRD §Non-Goals; heavy integration with no MVP payoff.
- **E-mail/push renewal notifications** — Why parked: PRD §Non-Goals; the in-app upcoming-renewals list (S-05) is the MVP answer.
- **Currency conversion** — Why parked: PRD §Non-Goals; totals are per currency, exchange rates are an external dependency the MVP does not take.
- **Shared or household accounts** — Why parked: PRD §Non-Goals; strictly single-tenant.
- **Native mobile app** — Why parked: PRD §Non-Goals; responsive web only.
- **Offline-first guarantee** — Why parked: PRD §Non-Goals (non-functional); the product assumes a connection.
- **CI auto-deploy-on-merge** — Why parked: declared in `tech-stack.md` but deploy currently works manually and no slice depends on it; wire it when the manual step starts costing more than the setup.

## Done

(Empty on first generation. `/10x-archive` appends an entry here — and flips that item's `Status` to `done` — when a change whose `Change ID` matches the item is archived. Do NOT pre-populate.)

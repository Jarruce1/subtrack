# Upcoming Renewals List (S-05) — Plan Brief

> Full plan: `context/changes/upcoming-renewals-list/plan.md`

## What & Why

Add the FR-013 view to the dashboard: which active subscriptions renew in the next 30 days, soonest first. This is the persona's monthly check-in habit (PRD secondary success criterion) — the in-app answer to "what should I cancel before it charges me", explicitly the MVP substitute for notifications.

## Starting Point

`nextRenewalDate` is done and hardened (S-01 built it, S-02 pinned it with example + property suites). The dashboard already SSR-renders per-row renewal dates and active-only totals from `src/lib/billing.ts`. What's missing is only the §4 derivation (filter to a 30-day window + sort) and a dashboard surface for it. S-03 is landing in a parallel worktree and will add one link line to `dashboard.astro`.

## Desired End State

Between "Active totals" and "Subscriptions", an "Upcoming renewals" section lists active subscriptions renewing in `[today, today + 30]` — soonest first, with name, date, amount + currency. Nothing in the window → a quiet "No renewals in the next 30 days." line. Zero subscriptions → the existing global empty state, untouched.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Where the logic lives | Pure `upcomingRenewals(subs, today)` in `src/lib/billing.ts` | §4 is billing arithmetic; §1–§3 already live there as pure, `today`-parameterized functions (`summarizeActive` precedent). |
| Window semantics | Both endpoints inclusive: `today <= renewal <= today + 30` | PRD §4 says "today through today + 30 days"; lower bound holds by `nextRenewalDate` construction, only the upper bound is checked. |
| Return shape | `{ subscription, renewalDate }[]` (new `UpcomingRenewal` in `src/types.ts`) | Dashboard needs name/amount/currency; carrying the row avoids a parallel DTO and keeps S-04 reuse trivial. |
| Tie ordering | Stable sort — same-date renewals keep input order | ES2019 sort stability is guaranteed; cheapest deterministic rule, pinned by a test. |
| Dashboard placement | One new self-contained `<section>` between totals and list | Merge-clean with S-03's parallel one-line edit; no existing line touched. |
| Testing depth | Example tests only (S-02 suite idiom), no new property layer | The function is a filter/sort over the already property-tested `nextRenewalDate`; its own logic is boundary/ordering cases. |

## Scope

**In scope:** `upcomingRenewals` + `UpcomingRenewal` type, unit tests in `src/lib/billing.test.ts`, one new dashboard section, local-stack smoke.

**Out of scope:** status lifecycle (S-04), S-03 files (`services/subscriptions.ts`, `validation/subscriptions.ts`, `/subscriptions/*` pages), API/DB changes, configurable window, E2E tests, changes to existing billing functions or tests.

## Architecture / Approach

SSR recompute-per-render, same as every dashboard number: page loads rows once, calls the pure function with the server's UTC `today`, renders the result. No new I/O, no state, no client JS.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. §4 derivation + tests | `upcomingRenewals` pinned by boundary/exclusion/ordering tests | Off-by-one on the inclusive `today + 30` bound — covered by explicit day-30/day-31 cases |
| 2. Dashboard section | User-visible list + empty message, smoke-tested | Merge conflict with parallel S-03 — mitigated by strictly additive one-block diff |

**Prerequisites:** local Supabase stack running (it is); S-01/S-02 landed (they are).
**Estimated effort:** ~1 session, 2 phases.

## Open Risks & Assumptions

- S-03 merges into the same `dashboard.astro`; both changes are additive in different spots, so the merge should be clean — verified by keeping this diff one-block.
- "Today" is the server's UTC date (accepted MVP limitation documented in `billing.ts`); the window inherits it.

## Success Criteria (Summary)

- A user with mixed-cycle subscriptions sees exactly the active ones renewing within 30 days, soonest first, with correct boundary handling (day 30 in, day 31 out).
- Paused/cancelled rows never appear in the section.
- Empty window and zero-subscription states each show their intended message; `npm test`, lint, `astro check`, build all green.

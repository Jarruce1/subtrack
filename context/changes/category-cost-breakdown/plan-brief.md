# Category Cost Breakdown (S-06) — Plan Brief

> Full plan: `context/changes/category-cost-breakdown/plan.md`

## What & Why

Add the FR-012 "where does the money go" view: the dashboard gains a per-category breakdown of monthly/yearly costs for active subscriptions, per currency (never converted or merged). Half the persona's question is category spend; it is cheap now because normalization (S-01/S-02) already exists — the only real risk is the active-only aggregation rule drifting apart between the overall totals and the category view (test-plan risk #1).

## Starting Point

`src/lib/billing.ts` holds all pure billing arithmetic; `summarizeActive` is the canonical §3 aggregation (active-only, unrounded sums, per-currency, sorted). `dashboard.astro` renders Active totals → Upcoming renewals → Subscriptions via SSR recompute per render. ~90 unit tests pin the existing functions in a PRD-citing suite style.

## Desired End State

Between "Active totals" and "Upcoming renewals" the dashboard shows "Costs by category": one block per category with active subscriptions, per-currency monthly/yearly rows. Paused/cancelled contribute nothing; all-inactive categories are absent; per currency, category rows always sum to the Active totals number.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Consistency mechanism | `summarizeByCategory` partitions by category and **delegates to `summarizeActive`** per partition | The §3 rule stays defined in exactly one function, so the category view cannot drift from the overall totals (risk #1) — plus a dedicated consistency unit test as a second net. |
| Result shape | Flat `CategoryTotal[]` rows `{category, currency, monthly, yearly}` | Keeps "never merge currencies" structural (one row per pair) and mirrors `CurrencyTotal`; the page groups rows for display. |
| Ordering | Category `localeCompare`, then currency `localeCompare` | Deterministic and testable, same idiom as `summarizeActive`'s currency sort. |
| Empty categories | Absent (no zero-filled placeholders) | Roadmap S-06 outcome: categories without active subscriptions do not display. |
| Section placement | New self-contained section directly after "Active totals" | The two §3 views sit together; additive-only diff keeps parallel-worktree merges clean. |
| Empty-state behavior | Subs-but-none-active → quiet "No active subscriptions."; zero subs → untouched global empty state | Mirrors the Active totals idiom exactly. |
| Test scope | Example tests in `billing.test.ts` only (incl. consistency invariant); no property layer | The function is a partition-and-delegate over already property-tested code; examples pin its own logic. |

## Scope

**In scope:** `CategoryTotal` type (`src/types.ts`), `summarizeByCategory` (`src/lib/billing.ts`), unit tests (`src/lib/billing.test.ts`), one new dashboard section (`src/pages/dashboard.astro`), local-stack smoke on :4403.

**Out of scope:** currency conversion, empty-category placeholders, filter/sort UI (FR-015 parked), changes to existing billing functions or tests, S-07 files (`SubscriptionForm.tsx`, `api/subscriptions/*`), integration/E2E tests, API/DB changes.

## Architecture / Approach

Pure-function derivation in `src/lib/billing.ts` (partition → delegate → tag → sort), consumed by SSR frontmatter in `dashboard.astro` and rendered with the existing glass-card + `formatMoney` idioms. No new modules, no new patterns.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. §3 per-category derivation | `summarizeByCategory` + `CategoryTotal` + unit tests incl. consistency invariant | FP accumulation-order noise in the consistency assert (handled: `toBeCloseTo(…,10)`) |
| 2. Dashboard section | "Costs by category" section + local-stack smoke | Merge hygiene with parallel worktrees (handled: additive-only diff) |

**Prerequisites:** S-01 done (it is), local Supabase stack running for the smoke.
**Estimated effort:** ~1 session, 2 phases.

## Open Risks & Assumptions

- Category display uses raw enum labels (already the page's idiom at `dashboard.astro:152`) — no i18n/display mapping assumed.
- Consistency test compares with `toBeCloseTo(…,10)` because the two sides may accumulate in different float orders; exact display equality is guaranteed anyway by rounding only at `formatMoney`.

## Success Criteria (Summary)

- Dashboard shows per-category, per-currency monthly/yearly totals for active subscriptions only; all-inactive categories absent.
- For every currency, category rows sum to the Active totals number — pinned by a unit test and visible in the smoke.
- `npm test`, `npm run lint`, `npx astro check`, `npm run build` all green; existing suites untouched.

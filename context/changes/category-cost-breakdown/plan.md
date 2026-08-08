# Category Cost Breakdown (S-06) Implementation Plan

## Overview

Add the FR-012 per-category cost breakdown to the dashboard: monthly and yearly cost totals of **active** subscriptions, grouped per category and — inside each category — per currency (amounts in different currencies are never added together or converted, PRD Business Logic §3). Categories with no active subscriptions do not appear. The derivation is a new pure function `summarizeByCategory(subscriptions)` in `src/lib/billing.ts` beside `summarizeActive`, pinned by unit tests in the existing suite style — including the test-plan risk #1 consistency check: summing the per-category rows per currency must reproduce `summarizeActive` for the same input. This is roadmap S-06: "user can see cost totals broken down per category".

## Current State Analysis

- All billing arithmetic lives in the pure module `src/lib/billing.ts`: `normalizeCost` (:20), `nextRenewalDate` (:44), `summarizeActive` (:80), `upcomingRenewals` (:111). No I/O, no `Date.now()`; `summarizeActive` is the canonical §3 aggregation — skips non-`active` rows, sums unrounded normalized costs into a per-currency `Map`, returns rows sorted by currency code.
- Test-plan §2 risk #1 names the exact failure mode this slice must not introduce: "the active-only aggregation rule drifting apart across dashboard, category, and renewals views as S-04/S-06 land". Roadmap S-06 Risk echoes it: "the only care point is reusing the exact same aggregation rule as the overall totals so the two never disagree".
- `src/pages/dashboard.astro` renders SSR over live data: frontmatter computes `totals = summarizeActive(subscriptions)` (:21) and `upcoming = upcomingRenewals(subscriptions, today)` (:22); markup renders, inside the has-subscriptions branch, three sections in order — "Active totals" (:86-110), "Upcoming renewals" (:112-136), "Subscriptions" (:138-174). The "Active totals" section already has the exact row idiom for a per-currency monthly/yearly pair (`formatMoney`, `/ month`, `/ year`).
- Money is rounded only at display by `formatMoney` (`src/lib/format.ts:8`); billing.ts keeps every intermediate value unrounded.
- Computed-result types live in `src/types.ts` (:21-33) — `NormalizedCost`, `CurrencyTotal`, `UpcomingRenewal` — with a comment (:19-20) that already names the S-06 category breakdown as a consumer. `SubscriptionCategory` (:12) is the generated enum of the predefined FR-004 list (Streaming, Software, Health & Fitness, News & Media, Other).
- Test style contract (S-02/S-05): `src/lib/billing.test.ts` — describe blocks cite the PRD section, the `sub()` fixture factory (:12) builds full rows with overrides (defaults: 10 PLN monthly active, category "Other"), values asserted as exact expressions, never decimal literals. `npm test` = `vitest run`.
- Parallel worktrees own other S-07/integration work: this slice must not touch `src/components/subscriptions/SubscriptionForm.tsx`, `src/pages/api/subscriptions/*.ts`, or add integration-test files. The dashboard edit must be additive and self-contained for clean merges.
- `context/foundation/lessons.md`: no entry bears directly on this slice (no new tables, no deploy config).

## Desired End State

An authenticated user opening `/dashboard` sees, between "Active totals" and "Upcoming renewals", a "Costs by category" section: one block per category that has at least one active subscription, each block listing per-currency monthly and yearly totals formatted like the Active totals rows. Paused/cancelled subscriptions contribute nothing; a category whose subscriptions are all paused/cancelled is absent. When subscriptions exist but none are active, the section shows the quiet line "No active subscriptions." (mirroring Active totals). With zero subscriptions the global empty state is unchanged. For every currency, the sum of that currency's per-category totals equals the Active totals number for the same currency — always.

Verify: `npm test` green (new `summarizeByCategory` describe block incl. the consistency case), `npm run lint` / `npx astro check` / `npm run build` green, and a dev-server smoke on port 4403 against the local Supabase stack with seeded `s06-*` users exercising multi-category, multi-currency-within-category, paused/cancelled exclusion, and both empty states.

### Key Discoveries:

- `summarizeActive` (`src/lib/billing.ts:80-100`) already implements the §3 rule (active filter + unrounded normalized sums + per-currency grouping + currency sort). Partitioning the input by category and delegating each partition to `summarizeActive` makes the per-category totals consistent with the overall totals **by construction** — the rule exists in exactly one place, which is the strongest possible answer to test-plan risk #1.
- A category with only paused/cancelled subscriptions falls out for free under delegation: `summarizeActive` returns `[]` for its partition, so the category emits no rows.
- `[...map.values()].sort((a, b) => a.currency.localeCompare(b.currency))` (`billing.ts:99`) is the module's determinism idiom; the category dimension follows the same pattern (category `localeCompare`, then currency).
- `src/types.ts:19-20` comment already promises this module as the S-06 type home; `CategoryTotal` belongs beside `CurrencyTotal`.
- The dashboard "Active totals" section (`dashboard.astro:96-108`) is the exact display idiom to reuse per currency row; `subscription.category` is already rendered verbatim elsewhere on the page (:152), so category names need no display mapping.
- S-05 archive note: for the dev-server smoke, `.dev.vars` (and `.env`) point at cloud Supabase and **override** shell env — they must be temporarily swapped to the local stack values and restored afterwards.

## What We're NOT Doing

- **No currency conversion and no cross-currency merging** — PRD Non-Goals; each (category, currency) pair is its own row.
- **No changes to `summarizeActive`, `normalizeCost`, `nextRenewalDate`, `upcomingRenewals`, or any existing test** — existing suites stay green untouched.
- **No empty-category placeholders** — FR-012 shows where money goes; a predefined category with no active subscriptions renders nothing (roadmap S-06 outcome + owner directive).
- **No touching `src/components/subscriptions/SubscriptionForm.tsx`, `src/pages/api/subscriptions/*.ts`** (S-07 worktree), **no integration-test files** (`*.integration.test.ts`, `vitest.integration.*` — separate worktree), **no other dashboard sections beyond inserting the new one**.
- **No filter/sort UI** — FR-015 is parked.
- **No property-based tests** — `summarizeByCategory` is a partition-and-delegate over the already property-tested `normalizeCost`/`summarizeActive` path; example tests (incl. the consistency case) cover its own logic.
- **No E2E/browser tests, no new API endpoints, no DB changes** — read-only SSR derivation over data the dashboard already loads.

## Implementation Approach

Two phases, each independently green. Phase 1 lands the pure derivation (`summarizeByCategory` + `CategoryTotal` type) with its example tests — the §3-per-category contract pinned before any UI exists. Phase 2 renders it: one new self-contained `<section>` in `dashboard.astro` between "Active totals" and "Upcoming renewals", reusing the totals-row idiom and `formatMoney`.

Core design decision (risk #1): `summarizeByCategory` does **not** re-implement the aggregation rule. It partitions the input by `category` (insertion-ordered `Map`), calls `summarizeActive` on each partition, tags the resulting `CurrencyTotal` rows with the category, and sorts. Active-only filtering, unrounded summation, and per-currency grouping remain defined in exactly one function; the category view cannot drift from the overall totals without the shared code changing — and the consistency unit test would catch even that.

## Critical Implementation Details

- **Consistency by construction + consistency test**: the test-plan rule "suma per kategoria = suma summarizeActive dla tej samej waluty" is enforced twice — structurally (delegation) and by a dedicated unit test that sums `summarizeByCategory` rows per currency and compares against `summarizeActive` on the same mixed fixture. Floating-point note: the two sides may accumulate in different orders, so the comparison uses `toBeCloseTo(…, 10)` per field (documented in the test), not `toEqual` on the container.
- **Merge hygiene**: the `dashboard.astro` edit must be exactly (a) `summarizeByCategory` appended to the existing `@/lib/billing` import specifier list, (b) one added frontmatter block computing the rows and their display grouping, and (c) one new `<section>…</section>` inserted between the existing "Active totals" and "Upcoming renewals" sections. No existing line is modified, reflowed, or reindented.
- **Smoke env**: dev server on port 4403 with the local stack (`SUPABASE_URL=http://127.0.0.1:54321`, anon key from `npx supabase status -o json`); `.dev.vars` and `.env` are swapped to local values for the smoke and restored afterwards (they override shell env — S-05 lesson). All POSTs carry an `Origin` header (CSRF); test users are `s06-*`.

## Phase 1: §3 per-category derivation — `summarizeByCategory` + unit tests

### Overview

Add the pure per-category aggregation and its result type, pinned by example tests (including the consistency invariant) in the existing suite style. No UI yet.

### Changes Required:

#### 1. Result type

**File**: `src/types.ts`

**Intent**: Add the computed-result type for the S-06 breakdown next to `CurrencyTotal`, so the dashboard imports it from the domain types module (the file's own comment already names S-06 as a consumer).

**Contract**: `export interface CategoryTotal { category: SubscriptionCategory; currency: string; monthly: number; yearly: number; }` — one row per (category, currency) pair with active subscriptions; `monthly`/`yearly` unrounded, same semantics as `CurrencyTotal`.

#### 2. `summarizeByCategory` function

**File**: `src/lib/billing.ts`

**Intent**: Implement the FR-012 / Business Logic §3 per-category totals as a pure function beside `summarizeActive`, delegating the aggregation rule to `summarizeActive` so the active-only + per-currency + unrounded-sum rule lives in exactly one place (test-plan risk #1).

**Contract**: `export function summarizeByCategory(subscriptions: Subscription[]): CategoryTotal[]`. Behavior: partition the input by `subscription.category` preserving input order within each partition; for each partition call `summarizeActive(partition)` and spread each returned `CurrencyTotal` into a `CategoryTotal` tagged with the category; return rows sorted by category (`localeCompare`), then currency (`localeCompare`). Categories whose partition yields `[]` (no active rows) emit nothing; empty input → `[]`. Doc comment cites §3/FR-012 and states the delegation-for-consistency rationale, matching the module's comment style.

#### 3. Unit tests

**File**: `src/lib/billing.test.ts`

**Intent**: Pin the per-category contract with an example-based `describe("summarizeByCategory (Business Logic §3 / FR-012)")` block in the existing suite idiom (`sub()` fixture, PRD-citing test names, exact-expression assertions). Existing tests are untouched.

**Contract**: cases must cover at least —
- empty input → `[]`;
- active-only rule, same as `summarizeActive`: paused and cancelled rows contribute nothing to their category's totals;
- a category whose subscriptions are **all** paused/cancelled is entirely absent from the result (and an all-inactive input → `[]`);
- per-currency grouping inside one category: two currencies in the same category produce two rows, amounts never merged or converted;
- unrounded normalized sums across mixed cycles within a category (weekly + yearly mix, custom-N), asserted as exact expressions;
- deterministic ordering: rows sorted by category then currency;
- **consistency invariant (test-plan risk #1)**: on a mixed fixture (≥3 categories, ≥2 currencies, ≥1 paused, ≥1 cancelled, mixed cycles), summing `summarizeByCategory` rows per currency reproduces `summarizeActive` for the same input — same currency set, `toBeCloseTo(…, 10)` per monthly/yearly.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Types check: `npx astro check`
- Build passes: `npm run build`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding (none required for this phase — pure function, no user-visible surface; proceed on green checks).

---

## Phase 2: Dashboard "Costs by category" section

### Overview

Render the per-category breakdown on the dashboard as one self-contained section between "Active totals" and "Upcoming renewals", then smoke-test the behavior against the local Supabase stack.

### Changes Required:

#### 1. Dashboard section

**File**: `src/pages/dashboard.astro`

**Intent**: Show the per-category cost breakdown right after the overall totals so the two §3 views sit together. Keep the diff minimal and additive for clean merges with parallel worktrees.

**Contract**: frontmatter gains `summarizeByCategory` in the existing `@/lib/billing` import and a block computing `const categoryTotals = summarizeByCategory(subscriptions);` plus a display grouping `categoryGroups: { category, totals }[]` built by grouping the (already category-sorted) rows into consecutive runs per category. Markup gains one `<section aria-labelledby="category-heading">` block styled like the existing glass-card sections, inserted between "Active totals" and "Upcoming renewals": `<h2 id="category-heading">Costs by category</h2>`; when `categoryGroups.length === 0` a single quiet line `No active subscriptions.` (muted `text-blue-100/70`, mirroring Active totals); otherwise a `divide-y` list with one `<li>` per category — category name, then one row per currency in the Active totals idiom (`font-mono` currency code, `formatMoney(monthly)` + `/ month`, `formatMoney(yearly)` + `/ year`). The section renders only in the has-subscriptions branch; the zero-subscriptions global empty state is unchanged. No existing line is modified.

### Success Criteria:

#### Automated Verification:

- Unit tests still pass: `npm test`
- Lint passes: `npm run lint`
- Types check: `npx astro check`
- Build passes: `npm run build`

#### Manual Verification:

- Smoke against local stack (dev server on port 4403, `.dev.vars`/`.env` swapped to `SUPABASE_URL=http://127.0.0.1:54321` + local anon key and restored after; fresh `s06-*` users; POSTs carry an `Origin` header): seeded subscriptions render grouped per category with per-currency monthly/yearly totals
- Two currencies inside one category render as two separate rows — never merged or converted
- Paused and cancelled subscriptions contribute nothing; a category whose only subscriptions are paused/cancelled is absent from the section (rows still listed under Subscriptions)
- Consistency visible in the rendered page: per currency, the category rows sum to the Active totals number
- User whose subscriptions are all paused sees "No active subscriptions." in the section
- User with zero subscriptions still gets the original global empty state (no category section)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the smoke checks above succeeded before closing out the plan.

---

## Testing Strategy

### Unit Tests:

- New `describe("summarizeByCategory (Business Logic §3 / FR-012)")` block in `src/lib/billing.test.ts` — the full case list from Phase 1 change 3 (active-only, empty-category exclusion, per-currency separation, unrounded sums, ordering, consistency invariant).
- Existing S-02/S-05 example + property suites run unchanged and must stay green.

### Integration Tests:

- None added (separate integration worktree owns that layer; SSR page renders pure-function output verbatim).

### Manual Testing Steps:

1. Swap `.dev.vars`/`.env` to the local stack; start dev server on port 4403.
2. Sign up `s06-breakdown@example.com`; seed via `POST /api/subscriptions` (with `Origin` header): Streaming — Netflix 43 PLN monthly active, HBO 30 PLN monthly **paused**; Software — JetBrains 240 PLN yearly active, Dropbox 12 USD monthly active; Health & Fitness — Gym 120 PLN monthly **cancelled**.
3. Load `/dashboard` with the session cookie: assert section order (totals → by category → upcoming → subscriptions); Streaming shows PLN 43.00/month, 516.00/year; Software shows two rows — PLN 20.00/month 240.00/year and USD 12.00/month 144.00/year; Health & Fitness and News & Media absent; per currency the category rows sum to the Active totals numbers (PLN 63/756, USD 12/144).
4. Sign up `s06-allpaused@example.com`; seed one paused subscription; assert the section renders "No active subscriptions."
5. Sign up `s06-nosubs@example.com`; assert the unchanged global empty state (no `category-heading`).
6. Restore `.dev.vars`/`.env`.

## Performance Considerations

O(n log n) over ≤ 30 rows per user (PRD scale), computed once per SSR render — no measurable cost, no caching warranted (NFR "no stale aggregates" favors recompute-per-render).

## Migration Notes

None — no schema, API, or data changes.

## References

- PRD: FR-012, Business Logic §3 — `context/foundation/prd.md:120,146`
- Roadmap S-06 — `context/foundation/roadmap.md:144-154`
- Test plan risk #1 (active-only drift) — `context/foundation/test-plan.md:51,67`
- Aggregation precedent — `src/lib/billing.ts:80-100`
- Suite idiom — `src/lib/billing.test.ts:12-30,190-230`
- Dashboard sections — `src/pages/dashboard.astro:86-136`
- S-05 sibling plan (structure precedent) — `context/changes/upcoming-renewals-list/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: §3 per-category derivation — `summarizeByCategory` + unit tests

#### Automated

- [x] 1.1 Unit tests pass: `npm test` — be17ff0
- [x] 1.2 Lint passes: `npm run lint` — be17ff0
- [x] 1.3 Types check: `npx astro check` — be17ff0
- [x] 1.4 Build passes: `npm run build` — be17ff0

### Phase 2: Dashboard "Costs by category" section

#### Automated

- [x] 2.1 Unit tests still pass: `npm test`
- [x] 2.2 Lint passes: `npm run lint`
- [x] 2.3 Types check: `npx astro check`
- [x] 2.4 Build passes: `npm run build`

#### Manual

- [x] 2.5 Smoke against local stack: seeded subscriptions render grouped per category with per-currency monthly/yearly totals _(performed 2026-08-08/09, dev server :4403 against local Supabase — `.env`/`.dev.vars` temporarily swapped to the local stack and restored after (diff-verified); users `s06-breakdown-*`/`s06-allpaused-*`/`s06-nosubs-*`; section order totals → by category → upcoming → subscriptions; Software and Streaming groups rendered)_
- [x] 2.6 Two currencies inside one category render as two separate rows — never merged or converted _(Software: PLN 20.00/month 240.00/year and USD $12.00/month $144.00/year as two rows)_
- [x] 2.7 Paused and cancelled contribute nothing; all-inactive category absent from the section (rows still under Subscriptions) _(paused HBO excluded from Streaming total 43.00; cancelled-only Health & Fitness absent; both rows still listed with status under Subscriptions)_
- [x] 2.8 Consistency visible in the rendered page: per currency, category rows sum to the Active totals number _(PLN: 20 + 43 = 63.00/month, 240 + 516 = 756.00/year = Active totals; USD: 12.00/144.00 = Active totals)_
- [x] 2.9 User whose subscriptions are all paused sees "No active subscriptions." in the section _(quiet line rendered, 0 category groups)_
- [x] 2.10 User with zero subscriptions still gets the original global empty state (no category section) _("No subscriptions yet" present, `category-heading` absent)_

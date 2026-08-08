# Upcoming Renewals List (S-05) Implementation Plan

## Overview

Add the FR-013 upcoming-renewals view to the dashboard: a list of active subscriptions whose next renewal falls within `[today, today + 30 days]`, sorted soonest first, each row showing name, amount + currency, and the renewal date — with a discreet message when nothing renews in the window. The derivation is a new pure function `upcomingRenewals(subscriptions, today)` in `src/lib/billing.ts` (PRD Business Logic §4), pinned by unit tests in the existing S-02 suite style. This is roadmap S-05: "user can see the list of renewals due in the next 30 days, soonest first, on the dashboard".

## Current State Analysis

- All billing arithmetic lives in the pure module `src/lib/billing.ts` (`normalizeCost` :19, `nextRenewalDate` :43, `summarizeActive` :79). No I/O, no `Date.now()` — `today` is always a parameter; dates are ISO `YYYY-MM-DD` strings compared lexicographically. Internal helpers `parseIsoDate`, `formatIsoDate`, `addDays` (:126/:140/:154) already provide everything a 30-day window needs.
- `nextRenewalDate` is done and hardened by S-02: example suite `src/lib/billing.test.ts` (fixture factory `sub()` :12, per-§ describe blocks citing PRD sections) plus property layer `src/lib/billing.properties.test.ts`. `npm test` runs both via Vitest (`vitest.config.ts`); CI runs test after lint.
- `src/pages/dashboard.astro` renders SSR over live data: computes `today` from the server UTC clock (:19), calls `summarizeActive` + per-row `nextRenewalDate`, and renders three blocks — header, "Active totals" section, "Subscriptions" section — inside a global zero-subscriptions empty state branch (:66). Renewal dates render as raw ISO strings (:137). Money renders via `formatMoney` (`src/lib/format.ts` — the only place money is rounded).
- Computed-result types (`NormalizedCost`, `CurrencyTotal`) live in `src/types.ts` (:21-29), not in the generated DB types.
- S-03 (`manage-subscription-list`) is being implemented in a parallel worktree. It owns `src/lib/services/subscriptions.ts` and `src/lib/validation/subscriptions.ts`, and will add a single link line to `dashboard.astro`. S-05's dashboard change must be one self-contained new section so the eventual merge is textually clean.
- `context/foundation/lessons.md`: no entry bears directly on this slice (no new tables, no deploy config).

## Desired End State

An authenticated user opening `/dashboard` sees, between "Active totals" and "Subscriptions", an "Upcoming renewals" section listing every **active** subscription whose next renewal date falls on or between today and today + 30 days — soonest first, each row with name, renewal date, and amount + currency. Paused/cancelled subscriptions never appear there. When no active subscription renews in the window (but subscriptions exist), the section shows a single quiet line ("No renewals in the next 30 days."). With zero subscriptions the existing global empty state is unchanged.

Verify: `npm test` green (new `upcomingRenewals` describe block covering boundaries, exclusions, sorting), `npm run lint` / `npx astro check` / `npm run build` green, and a dev-server smoke against the local Supabase stack with seeded `s05-*` users exercising the window boundaries, exclusions, ordering, and both empty states.

### Key Discoveries:

- `addDays` + `formatIsoDate` in `src/lib/billing.ts:140-157` give an exact `today + 30` upper bound with zero new date logic; lexicographic `<=` on ISO strings is the established comparison idiom (`billing.ts:50`, `:71`).
- `nextRenewalDate` already guarantees the result is `>= today` (`billing.ts:43-76`), so the window test reduces to `renewalDate <= windowEnd` — only the upper bound needs checking.
- `Array.prototype.sort` is stable per ES2019 (project targets Node 22 / modern browsers), so "sort by date ascending" preserves input order for same-date ties for free — worth pinning in a test.
- The dashboard's per-row map (`dashboard.astro:22-34`) already computes each active subscription's renewal date, but per-row and filtered-window concerns differ; §4 belongs in `billing.ts` next to §1–§3 (`summarizeActive` precedent: aggregation logic never lives in the page).
- Test style contract (S-02): describe blocks cite the PRD section, the `sub()` fixture factory builds full rows with overrides, values asserted as exact expressions. New tests must join `billing.test.ts` in that idiom.

## What We're NOT Doing

- **No status lifecycle work** — S-04 owns pause/reactivate flows; S-05 only *reads* status to filter (the active-only rule is already §3/§4 canon and `summarizeActive` precedent).
- **No changes to `nextRenewalDate`, `normalizeCost`, `summarizeActive`, or any existing test** — S-02's suite must stay green untouched.
- **No touching `src/lib/services/subscriptions.ts` or `src/lib/validation/subscriptions.ts`** — S-03 files, parallel worktree.
- **No pages under `/subscriptions/*`, no new API endpoints, no DB changes** — this is a read-only SSR derivation over data the dashboard already loads.
- **No configurable window size** — 30 days is FR-013 verbatim; a parameter would be dead flexibility.
- **No property-based tests for `upcomingRenewals`** — it is a filter/sort over the already property-tested `nextRenewalDate`; example tests cover its own logic (window bounds, exclusion, ordering).
- **No E2E/browser tests** — M3 scope, consistent with S-02's disposition.

## Implementation Approach

Two phases, each independently green. Phase 1 lands the pure derivation (`upcomingRenewals` + `UpcomingRenewal` type) with its example tests — the PRD §4 contract pinned before any UI exists. Phase 2 renders it: one new self-contained `<section>` in `dashboard.astro` between "Active totals" and "Subscriptions", reusing the row-card idiom and `formatMoney`. The function returns `{ subscription, renewalDate }` pairs (not a trimmed DTO): the dashboard needs name/amount/currency today, and S-04's "renewals reflect only active items" already holds by construction.

## Critical Implementation Details

- **Merge hygiene with S-03**: the `dashboard.astro` edit must be exactly (a) one added import line + one added `const upcoming = …` line in the frontmatter, and (b) one new `<section>…</section>` block inserted between the existing "Active totals" and "Subscriptions" sections. Do not reflow, reindent, or touch any existing line — S-03 adds one link line to this file in a parallel worktree and the merge must be conflict-free.
- **Window semantics**: PRD §4 is "today through today + 30 days" — both endpoints inclusive, so the window spans 31 calendar days. `windowEnd = formatIsoDate(addDays(parseIsoDate(today), 30))`; include iff `renewalDate <= windowEnd`. An invalid `today` must throw even for an empty/inactive input list (the window computation parses `today` before any filtering — consistent with `nextRenewalDate`'s validate-first posture).

## Phase 1: §4 derivation — `upcomingRenewals` + unit tests

### Overview

Add the pure Business Logic §4 function and its result type, pinned by example tests in the S-02 suite style. No UI yet.

### Changes Required:

#### 1. Result type

**File**: `src/types.ts`

**Intent**: Add the computed-result type for §4 next to `NormalizedCost`/`CurrencyTotal`, so the dashboard (and later S-04/S-06 views) import it from the domain types module.

**Contract**: `export interface UpcomingRenewal { subscription: Subscription; renewalDate: string; }` — `renewalDate` is ISO `YYYY-MM-DD`, the subscription's `nextRenewalDate` output.

#### 2. `upcomingRenewals` function

**File**: `src/lib/billing.ts`

**Intent**: Implement PRD Business Logic §4 as a pure function beside `summarizeActive`: active subscriptions whose next renewal falls in `[today, today + 30 days]`, sorted soonest first.

**Contract**: `export function upcomingRenewals(subscriptions: Subscription[], today: string): UpcomingRenewal[]`. Behavior: parse/validate `today` and compute `windowEnd = today + 30 days` first (throws on invalid `today` regardless of list content); skip non-`active` rows; compute `renewalDate = nextRenewalDate(start_date, billing_cycle, billing_interval_months, today)` for the rest; keep rows with `renewalDate <= windowEnd` (lower bound holds by construction); sort ascending by `renewalDate` with a stable sort (ties keep input order). Doc comment cites §4 and both inclusive endpoints, matching the module's existing comment style.

#### 3. Unit tests

**File**: `src/lib/billing.test.ts`

**Intent**: Pin §4 with an example-based `describe("upcomingRenewals (Business Logic §4)")` block in the existing suite idiom (`sub()` fixture, PRD-citing test names). Existing tests are untouched.

**Contract**: cases must cover at least —
- empty input → `[]`;
- renewal exactly **on** `today` is included (lower bound inclusive);
- renewal exactly on `today + 30` is included (upper bound inclusive; e.g. today `2026-08-08`, monthly anchor day 7 → renewal `2026-09-07`);
- renewal on day 31 (`today + 31`) is excluded (e.g. yearly `2025-09-08` viewed `2026-08-08` → `2026-09-08` out);
- window end crossing a month boundary computes calendar-exactly (e.g. today `2026-01-31` → window end `2026-03-02` across a 28-day February);
- `paused` and `cancelled` are excluded even when their would-be renewal is inside the window;
- future `start_date` inside the window is its own renewal and included (k = 0 rule);
- sorted soonest first across mixed cycles/dates;
- stable ordering: two subscriptions renewing the same day keep input order;
- invalid `today` throws even with an empty list.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test`
- Lint passes: `npm run lint`
- Types check: `npx astro check`
- Build passes: `npm run build`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding (none required for this phase — pure function, no user-visible surface; proceed on green checks).

---

## Phase 2: Dashboard "Upcoming renewals" section

### Overview

Render the §4 result on the dashboard as one self-contained section, then smoke-test the full behavior against the local Supabase stack.

### Changes Required:

#### 1. Dashboard section

**File**: `src/pages/dashboard.astro`

**Intent**: Show upcoming renewals between "Active totals" and "Subscriptions". Keep the diff minimal and additive for a clean merge with S-03's parallel one-line change.

**Contract**: frontmatter gains `upcomingRenewals` in the existing `@/lib/billing` import and `const upcoming = upcomingRenewals(subscriptions, today);`. Markup gains one `<section aria-labelledby="upcoming-heading">` block styled like the existing sections (rounded-2xl glass card), containing: `<h2 id="upcoming-heading">Upcoming renewals</h2>`; when `upcoming.length === 0` a single quiet line `No renewals in the next 30 days.` (muted `text-blue-100/70`, mirroring the "No active subscriptions." idiom); otherwise a `divide-y` list of rows — name, renewal date (raw ISO string, consistent with the Subscriptions card), and `formatMoney(amount, currency)`. The section renders only in the has-subscriptions branch; the zero-subscriptions global empty state is unchanged. No existing line is modified.

### Success Criteria:

#### Automated Verification:

- Unit tests still pass: `npm test`
- Lint passes: `npm run lint`
- Types check: `npx astro check`
- Build passes: `npm run build`

#### Manual Verification:

- Smoke against local stack (dev server on port 4402 with `SUPABASE_URL=http://127.0.0.1:54321` and the local anon key; fresh `s05-*` test users; POSTs carry an `Origin` header for CSRF): seeded subscriptions land in the section soonest-first with name, amount + currency, and date
- Boundary cases verified in the rendered page: renewal today shown; renewal exactly today + 30 shown; renewal today + 31 absent
- Paused and cancelled subscriptions absent from the section (still listed under Subscriptions)
- Same-day renewals render in stable (insertion) order
- User whose subscriptions all renew beyond the window sees "No renewals in the next 30 days."
- User with zero subscriptions still gets the original global empty state (no Upcoming section)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the smoke checks above succeeded before closing out the plan.

---

## Testing Strategy

### Unit Tests:

- New `describe("upcomingRenewals (Business Logic §4)")` block in `src/lib/billing.test.ts` — the full case list from Phase 1 change 3 (boundaries, exclusions, k = 0, sorting, stability, invalid `today`).
- Existing S-02 example + property suites run unchanged and must stay green.

### Integration Tests:

- None added (consistent with S-01/S-02 — SSR page renders pure-function output verbatim; browser-level coverage is M3 scope).

### Manual Testing Steps:

1. Start dev server on port 4402 against the running local Supabase stack.
2. Sign up `s05-window@example.com`; seed via `POST /api/subscriptions` (with `Origin` header): renewals at today, today+7, today+30, today+31, a paused and a cancelled row inside the window, and two rows renewing the same day.
3. Load `/dashboard` with the session cookie: assert section order (totals → upcoming → subscriptions), row order soonest-first with the same-day pair in insertion order, today/today+30 present, today+31 and paused/cancelled absent.
4. Sign up `s05-empty-window@example.com`; seed one active subscription renewing beyond 30 days; assert the quiet empty message.
5. Sign up `s05-no-subs@example.com`; assert the unchanged global empty state.

## Performance Considerations

O(n log n) over ≤ 30 rows per user (PRD scale), computed once per SSR render alongside the existing per-row `nextRenewalDate` calls — no measurable cost, no caching warranted (NFR "no stale aggregates" favors recompute-per-render).

## Migration Notes

None — no schema, API, or data changes.

## References

- PRD: FR-013, Business Logic §4 — `context/foundation/prd.md:122,147`
- Roadmap S-05 — `context/foundation/roadmap.md:132-142`
- Derivation module & helpers — `src/lib/billing.ts:79-99,126-157`
- Suite idiom — `src/lib/billing.test.ts:12-30,190-230`
- Dashboard sections — `src/pages/dashboard.astro:80-146`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: §4 derivation — `upcomingRenewals` + unit tests

#### Automated

- [x] 1.1 Unit tests pass: `npm test`
- [x] 1.2 Lint passes: `npm run lint`
- [x] 1.3 Types check: `npx astro check`
- [x] 1.4 Build passes: `npm run build`

### Phase 2: Dashboard "Upcoming renewals" section

#### Automated

- [ ] 2.1 Unit tests still pass: `npm test`
- [ ] 2.2 Lint passes: `npm run lint`
- [ ] 2.3 Types check: `npx astro check`
- [ ] 2.4 Build passes: `npm run build`

#### Manual

- [ ] 2.5 Smoke against local stack: seeded subscriptions land in the section soonest-first with name, amount + currency, and date
- [ ] 2.6 Boundary cases verified in the rendered page: renewal today shown; renewal exactly today + 30 shown; renewal today + 31 absent
- [ ] 2.7 Paused and cancelled subscriptions absent from the section (still listed under Subscriptions)
- [ ] 2.8 Same-day renewals render in stable (insertion) order
- [ ] 2.9 User whose subscriptions all renew beyond the window sees "No renewals in the next 30 days."
- [ ] 2.10 User with zero subscriptions still gets the original global empty state (no Upcoming section)

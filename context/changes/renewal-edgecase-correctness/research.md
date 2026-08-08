---
date: 2026-08-08T22:45:00+02:00
researcher: Claude Code
git_commit: 0e7799a
branch: main
repository: subtrack
topic: "S-02 renewal-edgecase-correctness — where date-arithmetic risk lives, what proves protection, and the cheapest verification harness (Vitest in Astro 6, property-based testing, oracle library choice)"
tags: [research, codebase, billing, vitest, fast-check, renewal-dates, s-02]
status: complete
last_updated: 2026-08-08
last_updated_by: Claude Code
---

# Research: S-02 renewal-edgecase-correctness

**Date**: 2026-08-08T22:45:00+02:00
**Researcher**: Claude Code
**Git Commit**: 0e7799a
**Branch**: main
**Repository**: subtrack

## Research Question

(a) Internal: where exactly does the risk of wrong renewal dates pass through the code (billing.ts paths, usages in dashboard/API), what behavior proves protection (oracles from PRD Business Logic §2), and what is the cheapest sufficient test set?
(b) External: how to set up Vitest in an Astro 6 project (getViteConfig vs standalone; Vitest 4.x and the AI_AGENT flag); is property-based testing (fast-check) worth it for this date arithmetic and how to model the anchor/clamping invariants; is there a sensible reference library for cross-checking dates (e.g. date-fns addMonths clamping semantics) — with a "we choose X, because ..." conclusion.

## Summary

- **All renewal/normalization arithmetic lives in one pure module** — `src/lib/billing.ts` (`normalizeCost`, `nextRenewalDate`, `summarizeActive`). It has **exactly one consumer**: `src/pages/dashboard.astro` (SSR frontmatter). No API route, React component, or service calls it. `today` is injected once, server-side (`dashboard.astro:19`), so every function is deterministic and directly unit-testable with zero mocking.
- **No test infrastructure exists at all**: no test files, no vitest/jest anywhere, no `test` npm script, no test step in CI. The S-02 harness is greenfield — exactly as the roadmap predicted ("this slice introduces the automated verification harness").
- **No confirmed bugs in billing.ts.** The F1 `Date.UTC` year 0–99 bug was already fixed (commit 815b17c, `setUTCFullYear` at `billing.ts:145-152`); the S-01 impl review hand-verified the module with 33 scratch assertions. The residual risks are (1) no *repeatable* verification exists (the scratch script was discarded), (2) the two-digit-year input class is still *accepted* by validation (zod `\d{4}` + DB `date` both admit `0026-01-01`), so the F1 fix needs a pinned regression test, (3) the floor/ceil occurrence-estimate and anchored-clamping logic have boundary-alignment bug classes that hand-picked examples structurally miss.
- **Oracles that prove protection** come straight from PRD Business Logic §2 + US-01/US-02 acceptance criteria: worked examples (Netflix 2026-07-15 monthly → 2026-08-15; monthly 2026-01-31 → Feb 28 / Mar 31; yearly 2024-02-29 → 2027-02-28 / 2028-02-29) plus six machine-checkable invariants: result ≥ today; result is a real calendar date; day = min(anchor day, days-in-month) (anchor never drifts); minimality (previous occurrence < today); weekly results ≡ anchor (mod 7 days); idempotence (`nextRenewalDate(start, ..., result) === result`).
- **Tool choice (external):** Vitest **^4.1.x** with a **standalone `vitest.config.ts`** (NOT `getViteConfig` — it currently crashes on Astro 6 + Vitest 4, withastro/astro#15847, and buys nothing for pure functions) + **fast-check 4.x with `@fast-check/vitest`** for a thin property layer using self-evident invariants — **no external date-oracle library**: date-fns `addMonths` would only re-derive clamping the invariants already express, at the cost of a dependency with local-time semantics that can make the oracle itself wrong in CI. Zero runtime dependencies added; ~2 devDependencies (+1 adapter).

## Detailed Findings

### 1. Where the risk passes through the code (internal)

**The arithmetic module** — `src/lib/billing.ts` (166 lines, pure, no I/O, no `Date.now()`):
- `normalizeCost` (`billing.ts:19-32`) — PRD §1 cycle→monthly/yearly conversion; returns **unrounded** values.
- `nextRenewalDate` (`billing.ts:43-76`) — PRD §2. Paths: (1) `startDate >= today` → returns `startDate` (lexicographic ISO comparison, valid for 4-digit years); (2) weekly → day-number diff + `ceil(diff/7)` (`billing.ts:56-60`); (3) monthly/yearly/custom-N → floor-estimate `k = max(0, floor((monthsElapsed-1)/step))` then an uncapped `for(;;)` loop advancing k until `candidate >= today` (`billing.ts:62-75`). Occurrences are always derived from the anchor via `occurrenceAtMonths` (`billing.ts:160-165`): `day = min(anchor.day, daysInMonth(target))` — clamping never rewrites the anchor.
- `summarizeActive` (`billing.ts:79-99`) — PRD §3: active-only, per-currency unrounded sums, sorted by currency code.
- Internal guards: `requireInterval` throws for custom+null/non-integer/<1 (`billing.ts:109-115`); `parseIsoDate` throws on malformed/impossible dates (`billing.ts:126-138`); `utcDayNumber` uses `setUTCFullYear`, not `Date.UTC` — the F1 fix, with an explanatory comment (`billing.ts:145-152`).

**The single consumer** — `src/pages/dashboard.astro`:
- Import at `dashboard.astro:5`; `today` computed once at `dashboard.astro:19` — `const today = new Date().toISOString().slice(0, 10);` (server UTC date; Workers run UTC — accepted MVP limitation documented at `billing.ts:8-12`).
- `summarizeActive(subscriptions)` at `dashboard.astro:21`; `normalizeCost(...)` per row at `dashboard.astro:24` (called for **every** row regardless of status); `nextRenewalDate(...)` at `dashboard.astro:25-33`, guarded to `status === "active"` rows only (others render their status instead of a date, `dashboard.astro:137`).
- Renewal dates are displayed as **raw ISO strings** — no `Intl.DateTimeFormat` anywhere; whatever `nextRenewalDate` returns is exactly what the user sees. Money is rounded in exactly one place: `formatMoney` (`src/lib/format.ts:8-10`, `Intl.NumberFormat`).
- **No error handling**: no try/catch around the billing calls, no 500.astro/error boundary — a throw from `parseIsoDate`/`requireInterval` propagates to a generic SSR 500. (The DB pair-CHECK makes custom+null-interval unreachable from stored data; malformed `start_date` is unreachable because Postgres `date` normalizes output. So throws guard programmer error, not user data.)
- **No other callers**: `src/pages/api/subscriptions/index.ts` (POST only) neither imports billing nor computes dates. There is no GET/PATCH/DELETE route yet (S-03).

**Input surface that feeds the anchor** (`start_date`):
- zod: `startDateSchema` (`src/lib/validation/subscriptions.ts:59-62`) — `\d{4}-\d{2}-\d{2}` + real-calendar-date refine (`subscriptions.ts:17-31`). **Years < 1000 are accepted** (`0026-01-01` passes; no floor, no ceiling). Same at the DB: `start_date date not null` with **no CHECK** (`supabase/migrations/20260808210821_create_subscriptions.sql:36`).
- So the F1 input class (mistyped two-digit year) is still *storable*; correctness now depends entirely on `billing.ts` treating such years literally — which is exactly what the F1 fix does and what a regression test must pin.
- `billing_interval_months`: zod int 1–120 (`subscriptions.ts:53-57`) mirroring the DB CHECK (`...create_subscriptions.sql:33-35`); pair-CHECK `(billing_cycle = 'custom') = (billing_interval_months is not null)` (`...create_subscriptions.sql:42-45`).

### 2. What behavior proves protection (oracles from the PRD)

Worked examples with PRD/US traceability (the readable spec layer):

| Oracle | Source |
| --- | --- |
| Netflix 43 PLN monthly, start 2026-07-15 → monthly 43, yearly 516, next renewal 2026-08-15 | US-01 (prd.md:47-51) |
| Monthly start 2026-01-31: during Feb 2026 → 2026-02-28; during Mar → 2026-03-31 (anchored, no drift to 28) | US-02 (prd.md:58-62) |
| Yearly start 2024-02-29 → 2027-02-28 (non-leap clamp) and 2028-02-29 (leap restore) | US-02 AC (prd.md:65) |
| Occurrences always computed from the original anchor, never a previously clamped date | US-02 AC (prd.md:66); Business Logic §2 (prd.md:145) |
| Weekly = start + 7k days; custom-N = same day-of-month advanced by N months with clamping | Business Logic §2 (prd.md:145) |
| §1 formulas: weekly ×52/12, ×52; monthly ×12; yearly ÷12; custom ÷N, ×12÷N — unrounded until display | Business Logic §1 (prd.md:144); format.ts:3-10 |
| §3: active-only totals, per-currency, never converted; paused/cancelled excluded | Business Logic §3 (prd.md:146); US-04 |

Machine-checkable invariants (the property layer — all expressible against the public API only):
1. **Bound**: `nextRenewalDate(...) >= today` (lexicographic on ISO).
2. **Validity**: result parses as a real calendar date.
3. **Clamping rule**: result day = anchor day when the target month is long enough, else last day of the target month; result month/year = anchor + k·step months for some integer k ≥ 0.
4. **Anchor immutability (anti-drift)**: chaining occurrences (feeding `today = previous occurrence + 1 day`) returns to the anchor day in every sufficiently long month — clamped Feb never poisons March. (This is the differential that a naive `addMonths`-stepping implementation fails.)
5. **Minimality**: the occurrence one step before the result is `< today` (kills floor/ceil off-by-one in the k-estimate).
6. **Weekly grid**: (result − anchor) in days is a non-negative multiple of 7, and result − 7 days `< today`.
7. **Idempotence**: `nextRenewalDate(start, cycle, n, result) === result` (today == occurrence returns today).

### 3. Cheapest sufficient test set (internal conclusion)

- One colocated example-based suite `src/lib/billing.test.ts` covering: §1 all four cycles (+ custom-interval guard throws), §2 all US-01/US-02 oracles above plus 31→30-day months, `today == occurrence` on clamped and unclamped dates, future start (all cycles), December/year wrap, multi-year custom-N, long-lived weekly, **F1 regression** (two-digit-year anchors, e.g. weekly `0099-01-01` and monthly `0026-01-31`, treated literally), invalid-input throws (`2026-02-30`, `2026-13-01`, `26-01-01`), §3 aggregation (status exclusion, per-currency grouping + sort, unrounded sums, empty → `[]`).
- One thin property suite for invariants 1–7 (~6 properties × 100 runs — sub-second).
- No component/E2E layer: the dashboard renders `nextRenewalDate` output verbatim (raw ISO string), so unit-level correctness is display-level correctness for this slice; browser-level coverage is M3 scope (per S-01 review F3 disposition).
- CI: append `npm test` to `.github/workflows/ci.yml` (currently `npm ci` → `astro sync` → lint → build, `ci.yml:18-21`); tests need no Supabase secrets — `billing.ts` imports only *types* from `@/types`, erased at compile time.

### 4. Vitest setup in Astro 6 (external)

- Official Astro testing guide still recommends `getViteConfig()` from `astro/config`, **but it currently crashes on Astro 6 + Vitest 4** (`ReferenceError: exports is not defined`, [withastro/astro#15847](https://github.com/withastro/astro/issues/15847), open, no fix), continuing a pattern of breakage at every Astro major (#12723 for v5, #11414, #11221). It also loads the full Astro config + `astro:env` schema on every test run — pure overhead for pure functions.
- A **standalone `vitest.config.ts`** is sufficient: `billing.ts`'s runtime import graph contains no Astro virtual modules (only a type-import of `@/types`), so the only thing the project's tooling doesn't already provide Vitest is the `@` → `./src` alias (defined solely in `tsconfig.json:paths`; `astro.config.mjs` has no `resolve.alias`). One `resolve.alias` line replaces `getViteConfig` entirely; `vite-tsconfig-paths` is unnecessary.
- **Vitest current stable: 4.1.10** (v5 in beta). 4.x needs Vite ≥ 6 / Node ≥ 20 — satisfied: repo pins `"overrides": { "vite": "^7.3.2" }` (`package.json:59-61`) and Node 22.14.0 (`.nvmrc`). Defaults are right for us out of the box (`environment: 'node'` is the default; no pools/config migration applies to a fresh setup).
- **AI_AGENT / agent reporter**: Vitest 4.1 added an `agent` reporter that prints only failures (token-lean output for coding agents); auto-detected via `std-env`, forceable with `AI_AGENT=1` env or `reporters: ['agent']`. Agents must use `vitest run`, never bare `vitest` (watch-mode hang, vitest#7818). Recommendation: script `"test": "vitest run"` and let auto-detection handle reporter choice — no config hardcoding.
- **Companion packages: none needed** — no jsdom/happy-dom (node env), no testing-library (no components under test), no `@cloudflare/vitest-pool-workers` (no Workers APIs in billing.ts), no coverage package (not a slice requirement).
- Local lint/format integration facts that shape the setup: ESLint applies **`strictTypeChecked` + react + prettier-as-error to `*.test.ts`** (base config has no `files` filter, `eslint.config.js:14-38`; react config globs `**/*.{js,jsx,ts,tsx}`, `eslint.config.js:40-60`); vitest globals are not declared, so tests must `import { describe, it, expect } from "vitest"` explicitly; `tsconfig.json` `include: ["**/*"]` means test files are inside the TS project (type-aware lint works unchanged); lint-staged runs `eslint --fix` on `*.{ts,tsx,astro}` at commit.

### 5. Property-based testing and the oracle question (external)

- **fast-check 4.9.0** current; **`@fast-check/vitest` 0.4.1** peer-depends on `vitest: ^4.1.0` — exact match for our Vitest choice. Adds `test.prop([...])` with shrinking + seed reporting; plain `fc.assert(fc.property(...))` also works with zero adapter.
- v4 gotcha: `fc.date()` generates `Invalid Date` by default — pass `noInvalidDate: true`. Second gotcha found: `fc.date()`'s default range spans years −271821…+275760, and `Date.toISOString()` for years outside 0001–9999 emits extended format (`+275760-09-13…`) which `parseIsoDate` rejects — so date arbitraries must be constrained to `min: new Date("0001-01-01T00:00:00Z"), max: new Date("9999-12-31T00:00:00Z")`. That range still includes years 1–99 — the F1 bug class stays covered by generation, plus pinned examples.
- Community consensus: calendar arithmetic is a poster-child PBT domain, and PBT **complements** (not replaces) example tests — examples stay as the readable, PRD-traceable spec; properties cover the input space for bug classes examples can't (anchor drift under arbitrary (anchor, step, k) alignments; floor/ceil boundary alignment; the Date.UTC 0–99 remap class).
- **date-fns as cross-check oracle**: `addMonths` clamping semantics match ours when applied to the *original* anchor (`addMonths(Jan 31, 1)` → Feb 28; repeated stepping drifts — Jan 31 → Feb 28 → Mar 28 — which is exactly the anti-pattern our anchor invariant forbids). But date-fns operates on **local-time** components of `Date`, so a UTC-constructed oracle date can be off by a day depending on machine TZ unless `TZ=UTC` is pinned — the oracle itself becomes a bug source. It would re-derive only what invariant 3 already states.
- **Temporal**: not available natively on Node 22 (flagged in Node 24+, unflagged later); would require `@js-temporal/polyfill` — not worth a dependency for an oracle.
- **Stdlib `Date`**: verified — `new Date(Date.UTC(2026, 1, 31))` → 2026-03-03 (auto-overflow ⇒ bad clamping oracle), but epoch-ms arithmetic in UTC is a good free auxiliary check for validity and the weekly mod-7 grid (UTC days are uniformly 86,400,000 ms).

**Decision: we choose Vitest ^4.1.x (standalone config) + fast-check/@fast-check/vitest with self-evident invariants, and zero oracle libraries** — because the seven invariants plus the PRD worked examples fully characterize the algorithm (day rule + month arithmetic + anti-drift + minimality + idempotence), a date-fns oracle would add a dependency and a second source of truth whose own TZ semantics can fail in CI, and examples-only would be structurally blind to the drift/boundary/large-year bug classes that generation catches for free. Cost: 3 devDependencies, no runtime deps, sub-second added CI time.

## Code References

- `src/lib/billing.ts:19-32` — `normalizeCost` (PRD §1)
- `src/lib/billing.ts:43-76` — `nextRenewalDate` (PRD §2): future-start shortcut :52-54, weekly path :56-60, floor estimate + `for(;;)` loop :62-75
- `src/lib/billing.ts:79-99` — `summarizeActive` (PRD §3)
- `src/lib/billing.ts:109-115` — `requireInterval` throw guard
- `src/lib/billing.ts:126-138` — `parseIsoDate` validation/throws
- `src/lib/billing.ts:145-152` — `utcDayNumber` with the F1 `setUTCFullYear` fix + comment
- `src/lib/billing.ts:160-165` — `occurrenceAtMonths` anchored clamping
- `src/pages/dashboard.astro:5,19,21,24,25-33,137` — sole consumer; `today` source; active-only renewal guard; raw ISO display
- `src/lib/format.ts:8-10` — `formatMoney`, the single rounding point
- `src/types.ts:6,11,21-29` — `Subscription`, `BillingCycle`, `NormalizedCost`, `CurrencyTotal`
- `src/db/database.types.ts:67,69` — enum literals for cycles/status
- `src/lib/validation/subscriptions.ts:17-31,59-62` — calendar-date refine; **no year floor** (accepts `0026-01-01`)
- `src/lib/validation/subscriptions.ts:53-57,82-106` — interval bounds + pair transform
- `supabase/migrations/20260808210821_create_subscriptions.sql:30-45` — amount/currency/interval/pair CHECKs; `start_date` has none
- `package.json:3,5-13,59-61` — `"type": "module"`; scripts (no `test`); `vite ^7.3.2` override
- `.github/workflows/ci.yml:18-24` — `npm ci` → `astro sync` → lint → build; no test step; secrets only needed by build
- `tsconfig.json` — `@/*` alias (TS-only), `include: ["**/*"]`
- `eslint.config.js:14-38,40-60,78` — strictTypeChecked + react + prettier apply to `*.test.ts`; ignores come from `.gitignore` only
- `astro.config.mjs:13-15` — vite block has no aliases (nothing for Vitest to inherit)

## Architecture Insights

- **Purity as a testability contract**: `billing.ts` was explicitly designed for S-02 ("`today` is always a parameter... S-02 pins these down", `billing.ts:3-7`). No mocking, no fixtures, no DB needed — the harness can be minimal because S-01 paid the design cost.
- **Single choke point**: one module, one consumer, display = raw function output. Unit tests on `billing.ts` therefore verify the exact user-visible dates; there is no transformation layer that could re-introduce error downstream.
- **Validation deliberately mirrors DB CHECKs** (S-01 review F1 note): the year-floor decision was consciously deferred to S-02. Testing `billing.ts`'s literal-year behavior (rather than adding a zod floor) keeps S-02 inside its "correctness of arithmetic" scope; tightening input validation is a separable product decision.
- **CI shape**: test step slots in after lint, before build; it needs no secrets, keeping fork-PR behavior sane.
- **ESM throughout** (`"type": "module"`), Vite 7 forced repo-wide — both align with Vitest 4 requirements with no extra work.

## Historical Context (from prior changes)

- `context/changes/first-subscription-dashboard/reviews/impl-review.md` — F1 (WARNING, fixed 815b17c): `Date.UTC` mapped years 0–99 to 1900+ in weekly math; fix verified empirically (`0099-01-01` weekly: `2026-08-14` pre-fix vs `2026-08-13` post-fix — those two dates are the ready-made regression fixture). Review notes S-02 as "the natural home" for the year-floor decision and that the 33-assertion verification lived in a discarded scratch script — the regression suite makes it permanent.
- `context/changes/first-subscription-dashboard/plan.md` — S-01 deliberately deferred month-end/leap-year hardening to S-02.
- `context/foundation/roadmap.md:96-106` — S-02 outcome/risk: "this slice introduces the automated verification harness (none exists yet) because its acceptance criteria cannot be hand-checked reliably."
- `context/foundation/lessons.md` — both accepted lessons (Workers `not_found_handling`, table ACLs) are inapplicable here: no deploy-config or migration changes in scope.

## Related Research

- None — this is the first `research.md` in the repo (`context/changes/*/` contains plans/reviews only).

## Open Questions

- **Year floor in zod** (`startDateSchema`): out of S-02 scope by the analysis above, but the product decision ("reject start dates before, say, 1900?") remains open for a future validation slice. S-02 pins the arithmetic's literal-year behavior either way.
- **Years > 9999**: `formatIsoDate` pads to 4 digits but would emit 5-digit years, breaking lexicographic comparisons. Unreachable through validation (`\d{4}` cap) — noted as a domain boundary the property arbitraries must respect (constrain to ≤ 9999), not a bug to fix.
- **`vitest run` duration under the `agent` reporter in GitHub CI**: expected trivial; verify on first CI run.

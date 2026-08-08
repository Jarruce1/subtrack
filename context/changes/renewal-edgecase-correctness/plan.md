# Month-End and Leap-Year Renewal Correctness (S-02) Implementation Plan

## Overview

Introduce the project's first automated verification harness (Vitest) and pin down `src/lib/billing.ts` — the module every displayed renewal date and cost total flows through — with example-based tests traceable to PRD Business Logic §1–§3 and a thin property-based layer (fast-check) for the bug classes examples can't reach (anchor drift, floor/ceil boundary alignment, extreme years). Wire `npm test` into CI so the arithmetic can never silently regress. This is roadmap S-02: "user can trust displayed renewal dates for subscriptions started on month-end or Feb 29".

## Current State Analysis

- All arithmetic lives in one pure module, `src/lib/billing.ts` (`normalizeCost` :19-32, `nextRenewalDate` :43-76, `summarizeActive` :79-99). No I/O, no `Date.now()` — `today` is a parameter. Designed for exactly this slice (`billing.ts:3-7`).
- Exactly one consumer: `src/pages/dashboard.astro` (import :5, `today` from server UTC clock :19, calls :21/:24/:25-33). Renewal dates render as raw ISO strings (:137) — unit-level output IS the user-visible output.
- **Zero test infrastructure**: no test files, no test runner dependency, no `test` npm script, no CI test step (`.github/workflows/ci.yml:18-21` runs `npm ci` → `astro sync` → lint → build).
- The module was verified during the S-01 impl review only via a discarded 33-assertion scratch script; the F1 `Date.UTC` year-remap bug (fixed in 815b17c, `billing.ts:145-152`) has no pinned regression test, while validation still accepts the two-digit-year input class that triggers it (`src/lib/validation/subscriptions.ts:59-62` — `\d{4}`, no floor; DB `start_date date` with no CHECK).
- No confirmed bugs in `billing.ts` — research and the S-01 review found none. This plan adds proof, not fixes.
- Constraints that shape the harness (from `context/changes/renewal-edgecase-correctness/research.md`): ESM repo (`"type": "module"`), Vite pinned `^7.3.2` via overrides, Node 22.14.0, ESLint `strictTypeChecked` + react + prettier-as-error applies to `*.test.ts` (no `files` filter in `eslint.config.js:14-38`), `@` alias exists only in `tsconfig.json` — Vitest must define its own.

## Desired End State

`npm test` runs a deterministic, sub-ten-second suite that fails if any PRD §1–§3 behavior of `billing.ts` changes: all worked examples from US-01/US-02, month-end clamping (31→28/29/30 and back to 31), Feb 29 yearly anchors across leap boundaries, anchor immutability, `today == occurrence`, future starts, per-currency active-only aggregation, the F1 two-digit-year regression, and seven machine-checked invariants over generated inputs. CI runs the suite on every push/PR to `main`.

Verify: `npm test` exit 0 locally and in CI; the Phase 3 manual spot-check (temporarily mutating the clamp in `occurrenceAtMonths` and observing the suite fail) confirms the harness actually bites.

### Key Discoveries:

- `getViteConfig` from `astro/config` currently crashes under Astro 6 + Vitest 4 (withastro/astro#15847) and buys nothing for pure-function tests — a standalone `vitest.config.ts` with one `resolve.alias` entry fully replaces it (research.md §4).
- `billing.ts`'s runtime import graph contains no Astro virtual modules (only a type-only import of `@/types`) — tests run in plain `node` environment with zero mocks (research.md §1, §4).
- Vitest 4.1's `agent` reporter auto-activates for coding agents (forceable with `AI_AGENT=1`); scripts must use `vitest run`, never bare `vitest` (watch-mode hang) (research.md §4).
- fast-check 4.x: `fc.date()` needs `noInvalidDate: true`, and its default year range (−271821…+275760) produces `toISOString()` extended-format years that `parseIsoDate` rightly rejects — arbitraries must be constrained to years 0001–9999, which still covers the F1 class (years 1–99) (research.md §5).
- date-fns as a cross-check oracle was evaluated and rejected: its `addMonths` operates on local-time components (TZ-dependent oracle) and would only re-derive what the invariants already state (research.md §5).
- The F1 review left a ready-made regression fixture: weekly anchor `0099-01-01` must yield the literal-year grid (`2026-08-13` for today `2026-08-08`), not the 1999-era grid (`2026-08-14`) (`context/changes/first-subscription-dashboard/reviews/impl-review.md` F1).

## What We're NOT Doing

- **No changes to `src/lib/billing.ts`** — no bugs were found; this slice adds verification. (Contingency: if a test exposes a genuine PRD violation during implementation, stop, keep that test as the red baseline, apply the minimal fix, and note it in the phase block — red test first.)
- **No zod year floor** on `start_date` (`src/lib/validation/subscriptions.ts`): tightening input validation is a separable product decision (research.md Open Questions); S-02 pins the arithmetic's literal-year behavior instead.
- **No UI/component/E2E tests** — the dashboard renders `nextRenewalDate` output verbatim; browser-level coverage is M3 scope (S-01 review F3 disposition).
- **No coverage tooling** (`@vitest/coverage-v8`), **no Workers test pool** (`@cloudflare/vitest-pool-workers`), **no jsdom/testing-library** — nothing under test needs them.
- **No date-fns / Temporal polyfill / any runtime dependency.**
- **No changes to upcoming-renewals or category logic** — S-05/S-06 scope.

## Implementation Approach

Three phases, each independently green: (1) stand up the minimal Vitest harness and prove the toolchain end-to-end with one PRD example; (2) write the full example-based suite — the readable, PRD-traceable spec — and wire CI; (3) add the fast-check property layer for input-space coverage. Examples land before properties so any property failure can be triaged against a trusted example baseline. All tests target the public API of `billing.ts` only (no reaching into internals), keeping them refactor-proof.

## Critical Implementation Details

- **Standalone Vitest config, not `getViteConfig`** — the Astro wrapper crashes on Astro 6 + Vitest 4 (withastro/astro#15847). Do not "fix" a future failure by switching to it; mock `astro:env/*` via alias stubs if a future test ever needs it.
- **Determinism/TZ**: set `process.env.TZ ??= "UTC"` at the top of `vitest.config.ts`. `billing.ts` is TZ-immune by construction, but test helpers that build ISO strings via `Date#toISOString` stay honest on any machine.
- **Lint surface**: test files are linted under `strictTypeChecked` + prettier-as-error and vitest globals are not declared — always `import { describe, expect, it } from "vitest"` explicitly; unused fixture vars need `_` prefix. `vitest.config.ts` sits inside `tsconfig` `include: ["**/*"]`, so `projectService` covers it — no eslint config changes needed.
- **Unrounded assertions**: `normalizeCost` returns unrounded values (rounding happens only in `formatMoney`) — assert against exact expressions (e.g. `(43 * 52) / 12`), not decimal literals, to avoid encoding float noise.
- **Property arbitraries**: `fc.date({ min: new Date("0001-01-01T00:00:00Z"), max: new Date("9999-12-31T00:00:00Z"), noInvalidDate: true }).map(d => d.toISOString().slice(0, 10))`; the min/max bound is load-bearing (see Key Discoveries). Intervals: `fc.integer({ min: 1, max: 120 })` mirroring the DB CHECK.

## Phase 1: Vitest Harness

### Overview

Install and configure Vitest so `npm test` runs a colocated test file that imports `billing.ts` through the `@` alias — proving deps, config, ESM, alias, lint, and script wiring end-to-end before any real coverage is written.

### Changes Required:

#### 1. Dev dependency + scripts

**File**: `package.json`

**Intent**: Add the test runner and the standard entry points, keeping agent/CI runs non-interactive.

**Contract**: devDependency `"vitest": "^4.1.10"`; scripts `"test": "vitest run"` and `"test:watch": "vitest"`. No other dependency changes in this phase. (`vitest run`, never bare `vitest`, in anything automated — watch mode hangs agents/CI.)

#### 2. Vitest configuration

**File**: `vitest.config.ts` (new, repo root)

**Intent**: Minimal standalone config: node environment, `@` alias mirroring `tsconfig.json`, UTC pinned. Deliberately NOT `getViteConfig` (see Critical Implementation Details).

**Contract**:

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

process.env.TZ ??= "UTC";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

#### 3. Smoke test

**File**: `src/lib/billing.test.ts` (new)

**Intent**: One test asserting the US-01 worked example (`nextRenewalDate("2026-07-15", "monthly", null, "2026-08-01") === "2026-08-15"`) to prove the whole toolchain; Phase 2 grows this file into the full suite.

**Contract**: imports `{ describe, expect, it }` from `vitest` and `{ nextRenewalDate }` from `@/lib/billing`.

### Success Criteria:

#### Automated Verification:

- `npm test` exits 0 with the smoke test passing
- `npm run lint` exits 0 (new files pass strictTypeChecked + prettier)
- `npm run build` exits 0 (app build unaffected)

#### Manual Verification:

None — infrastructure phase, fully machine-checkable.

**Implementation Note**: After completing this phase and all automated verification passes, proceed — no manual gate needed here.

---

## Phase 2: Example-Based PRD Suite + CI

### Overview

Grow `src/lib/billing.test.ts` into the complete example-based specification of PRD Business Logic §1–§3 — every oracle from US-01/US-02 plus the adversarial edges from the S-01 review — and add the F1 regression tests. Wire `npm test` into CI so the suite guards `main` from this phase on.

### Changes Required:

#### 1. Full example suite

**File**: `src/lib/billing.test.ts`

**Intent**: One `describe` block per exported function; each PRD-derived case cites its source (US-01, US-02, §1/§2/§3) in the test name or a comment so failures read as spec violations.

**Contract**: covers, via the public API only:

- `normalizeCost` (§1): weekly (`monthly = amount × 52 / 12`, `yearly = amount × 52`), monthly, yearly, custom-N for several N; values asserted unrounded (exact expressions); `custom` with `null` / non-integer / `< 1` interval throws.
- `nextRenewalDate` (§2):
  - US-01: start `2026-07-15` monthly, today in Aug → `2026-08-15`.
  - US-02 month-end: monthly start `2026-01-31` → `2026-02-28` (today in Feb 2026), `2026-03-31` (today in Mar — anchored, no drift); leap-year Feb: monthly start `2027-01-31`, today Feb 2028 window → `2028-02-29`.
  - US-02 AC leap-day yearly: start `2024-02-29` → `2027-02-28` (non-leap clamp) and `2028-02-29` (leap restore).
  - Anchored custom-3 chain: start `2026-01-31` → `2026-04-30` → `2026-07-31` → `2026-10-31` (clamping never rewrites the anchor).
  - 30-day-month clamp: monthly start on the 31st, today in Apr/Jun/Sep/Nov → day 30.
  - `today == occurrence` returns today — on both a clamped (`2026-02-28`) and an unclamped (`2026-03-31`) occurrence, and for weekly.
  - Future start is its own next renewal for all four cycles (k = 0).
  - Weekly grid: `start + 7k`, including a long-lived anchor years back and a mid-week today.
  - December/year wrap (e.g. monthly start `2026-12-31`, today Jan 2027 → `2027-01-31`); multi-year custom-18.
  - **F1 regression (two-digit years, literal-year semantics)**: weekly anchor `0099-01-01` with today `2026-08-08` → `2026-08-13` (the pre-fix `Date.UTC` remap produced `2026-08-14`); plus a monthly two-digit-year anchor (e.g. `0026-01-31`) clamping correctly in its own century.
  - Invalid inputs throw: `"2026-02-30"`, `"2026-13-01"`, `"26-01-01"`, empty string, and an invalid `today`.
- `summarizeActive` (§3): paused/cancelled excluded; per-currency grouping never converted; results sorted by currency code; sums are unrounded sums of normalized values; empty input → `[]`; custom-cycle subscription contributes `amount / N`.

#### 2. CI test step

**File**: `.github/workflows/ci.yml`

**Intent**: Run the suite on every push/PR to `main`, after lint and before build, so arithmetic regressions block merges.

**Contract**: new step `- run: npm test` between the existing `npm run lint` and `npm run build` steps. No env/secrets needed (tests import only types from `@/types`).

### Success Criteria:

#### Automated Verification:

- `npm test` exits 0 with the full example suite (all §1–§3 oracles, F1 regression, invalid-input throws) passing
- `npm run lint` exits 0
- `grep -q "npm test" .github/workflows/ci.yml` succeeds (test step present, ordered after lint)

#### Manual Verification:

- First CI run after the phase lands shows the test step green before the build step

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the CI run was verified before proceeding to the next phase.

---

## Phase 3: Property-Based Invariant Layer

### Overview

Add fast-check and a separate property suite expressing the seven invariants from research.md §2 — the machine-checked characterization that catches anchor drift, floor/ceil boundary misalignment, and extreme-year bugs across generated `(anchor, cycle, interval, today)` combinations.

### Changes Required:

#### 1. Dev dependencies

**File**: `package.json`

**Intent**: Property-based testing library plus its Vitest adapter (shrinking + seed reporting integrated into test output).

**Contract**: devDependencies `"fast-check": "^4.9.0"` and `"@fast-check/vitest": "^0.4.1"` (peer-depends on `vitest ^4.1.0` — matches Phase 1).

#### 2. Property suite

**File**: `src/lib/billing.properties.test.ts` (new — separate file keeps the example spec readable)

**Intent**: ~7 properties at default 100 runs each (sub-second), over arbitraries constrained per Critical Implementation Details, all through the public API:

**Contract**: invariants to express (for generated anchor, cycle, intervalMonths, and today ≥ anchor):

1. Bound: result `>=` today (lexicographic ISO).
2. Validity: result matches `YYYY-MM-DD` and is a real calendar date (checked via UTC epoch reconstruction, not a date library).
3. Clamping rule: result day = anchor day if the result month is long enough, else the last day of that month; months elapsed from anchor ≡ 0 (mod step) for month-based cycles.
4. Anchor immutability: chaining occurrences (next call with `today = previous result + 1 day`) restores the anchor day in every sufficiently long month — a clamped February never poisons March.
5. Minimality: the occurrence one step earlier (obtained via the chaining helper or month arithmetic on k) is `<` today.
6. Weekly grid: (result − anchor) in UTC days is a non-negative multiple of 7, and result − 7 days `<` today.
7. Idempotence: `nextRenewalDate(start, cycle, n, result) === result`.

Plus one §1 property: for all cycles, `normalizeCost(...).yearly === normalizeCost(...).monthly * 12` (within `Number.EPSILON`-scaled tolerance for the division cases).

### Success Criteria:

#### Automated Verification:

- `npm test` exits 0 with both suites (examples + properties) passing
- Total `npm test` wall time under ~10 s locally
- `npm run lint` exits 0

#### Manual Verification:

- Harness sanity spot-check: temporarily invert the clamp (`Math.min` → `Math.max` in `occurrenceAtMonths`, `src/lib/billing.ts:164`), run `npm test`, confirm multiple example and property failures, then revert the mutation

**Implementation Note**: After completing this phase and all automated verification passes, run the manual spot-check above; the slice is then complete — hand off to review.

---

## Testing Strategy

### Unit Tests:

- Example layer (`src/lib/billing.test.ts`): PRD-traceable worked examples — the readable spec; every US-01/US-02 acceptance criterion appears verbatim as a test.
- Property layer (`src/lib/billing.properties.test.ts`): seven invariants over generated inputs (years 0001–9999) — the safety net for alignments examples can't enumerate.
- Key edge cases: 31st-of-month anchors across 28/29/30/31-day months, Feb 29 yearly anchors across leap boundaries, `today == occurrence`, future starts, year wrap, two-digit-year anchors (F1), invalid-date rejection, active-only per-currency aggregation.

### Integration Tests:

- None in this slice (single pure module, single consumer rendering raw output). CI integration = the `npm test` step itself.

### Manual Testing Steps:

1. After Phase 2 lands: open the GitHub Actions run for the commit and confirm the `npm test` step executed after lint, before build, and passed.
2. Optional sanity: `AI_AGENT=1 npm test` locally prints the failure-only agent reporter.

## Performance Considerations

The full suite is pure in-memory arithmetic: expected well under 10 s including Vitest startup; property runs are ~700 executions total. No impact on app runtime or build output (devDependencies only; `vitest.config.ts` and `*.test.ts` files are not part of the Astro build graph).

## Migration Notes

None — no schema, data, or runtime behavior changes. The only shared-surface edit is one added CI step; rollback is deleting it.

## References

- Related research: `context/changes/renewal-edgecase-correctness/research.md`
- Module under test: `src/lib/billing.ts` (PRD Business Logic §1–§3 mapping in its doc comments)
- PRD oracles: `context/foundation/prd.md` §User Stories US-01/US-02, §Business Logic
- F1 history: `context/changes/first-subscription-dashboard/reviews/impl-review.md`
- Roadmap slice: `context/foundation/roadmap.md` §S-02

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Vitest Harness

#### Automated

- [x] 1.1 `npm test` exits 0 with the smoke test passing — 2453e17
- [x] 1.2 `npm run lint` exits 0 (new files pass strictTypeChecked + prettier) — 2453e17
- [x] 1.3 `npm run build` exits 0 (app build unaffected) — 2453e17

### Phase 2: Example-Based PRD Suite + CI

#### Automated

- [x] 2.1 `npm test` exits 0 with the full example suite (all §1–§3 oracles, F1 regression, invalid-input throws) passing
- [x] 2.2 `npm run lint` exits 0
- [x] 2.3 `grep -q "npm test" .github/workflows/ci.yml` succeeds (test step present, ordered after lint)

#### Manual

- [ ] 2.4 First CI run after the phase lands shows the test step green before the build step _(pending: work not pushed yet per instruction — verify on first push; step is wired after lint, before build, locally verified)_

### Phase 3: Property-Based Invariant Layer

#### Automated

- [ ] 3.1 `npm test` exits 0 with both suites (examples + properties) passing
- [ ] 3.2 Total `npm test` wall time under ~10 s locally
- [ ] 3.3 `npm run lint` exits 0

#### Manual

- [ ] 3.4 Harness sanity spot-check: temporarily invert the clamp (`Math.min` → `Math.max` in `occurrenceAtMonths`, `src/lib/billing.ts:164`), run `npm test`, confirm multiple example and property failures, then revert the mutation

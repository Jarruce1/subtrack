# Month-End and Leap-Year Renewal Correctness (S-02) — Plan Brief

> Full plan: `context/changes/renewal-edgecase-correctness/plan.md`
> Research: `context/changes/renewal-edgecase-correctness/research.md`

## What & Why

Stand up the project's first automated test harness and pin `src/lib/billing.ts` — the single module every displayed renewal date and cost total flows through — against the PRD's Business Logic §1–§3. Silently wrong dates are the top product risk (PRD guardrail: "totals and renewal dates must never be silently wrong"), and the month-end/leap-year acceptance criteria cannot be hand-checked reliably; the S-01 verification lived in a discarded scratch script.

## Starting Point

`billing.ts` is pure and deterministic by design (`today` is a parameter) with exactly one consumer, `src/pages/dashboard.astro`, which renders its output verbatim. The repo has zero test infrastructure: no runner, no `test` script, no CI test step. The F1 `Date.UTC` year-remap bug is fixed but unpinned, and validation still accepts the two-digit-year inputs that triggered it.

## Desired End State

`npm test` (locally and in CI on every push/PR to `main`) runs a sub-ten-second deterministic suite: every US-01/US-02 worked example, full clamping/anchor behavior, the F1 regression, active-only per-currency aggregation, plus seven machine-checked invariants over generated inputs. Mutating any clamping or anchor line in `billing.ts` turns CI red.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Test runner | Vitest ^4.1.10, standalone `vitest.config.ts` | `getViteConfig` crashes on Astro 6 + Vitest 4 (astro#15847) and buys nothing for pure functions; one `resolve.alias` line replaces it. | Research |
| Property-based layer | fast-check + `@fast-check/vitest`, self-evident invariants only | Examples alone are blind to anchor-drift/boundary-alignment/extreme-year bug classes; 7 invariants fully characterize the algorithm. | Research |
| Reference date library (oracle) | None (no date-fns, no Temporal polyfill) | An external oracle re-derives what the invariants already state and adds a TZ-sensitive dependency that can itself be wrong in CI. | Research |
| Fixing `billing.ts` | Not planned; red-test-first contingency only | Research and the S-01 review found no bugs — this slice adds proof, not fixes. | Research |
| zod year floor on `start_date` | Out of scope | Separable product decision; S-02 instead pins the arithmetic's literal-year behavior (F1 regression test). | Research |
| CI placement | `npm test` between lint and build | Needs no secrets (type-only imports), so fork PRs stay sane and failures surface before the expensive build. | Plan |
| Test layout | Colocated `src/lib/billing.test.ts` + separate `billing.properties.test.ts` | Keeps the PRD-traceable example spec readable; matches `src/lib/` service convention. | Plan |

## Scope

**In scope:**

- Vitest harness: devDependency, `vitest.config.ts`, `test`/`test:watch` scripts
- Example-based suite covering PRD §1–§3 (all cycles, 31→28/29/30 clamping, Feb 29 yearly, anchor immutability, `today == occurrence`, future starts, aggregation, paused/cancelled exclusion)
- F1 regression tests (two-digit-year anchors, literal-year semantics)
- Property suite: 7 invariants + 1 normalization property (fast-check)
- One CI step: `npm test`

**Out of scope:**

- Any change to `billing.ts` (contingency: red test first if a real bug surfaces)
- zod/DB validation changes (year floor), UI/E2E tests, coverage tooling, Workers test pool, any runtime dependency, S-05/S-06 logic

## Architecture / Approach

Three independently green phases: (1) minimal harness proven end-to-end with one PRD example; (2) full example spec + CI wiring; (3) property layer on top of a trusted example baseline. All tests exercise the public API of `billing.ts` only — refactor-proof, zero mocks, `node` environment, `TZ=UTC` pinned.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Vitest Harness | `npm test` runs a smoke test through deps/config/alias/lint | Toolchain friction (strictTypeChecked + prettier on test files) |
| 2. Example Suite + CI | Full PRD §1–§3 spec + F1 regression guarding `main` | A test exposing a real bug → triggers red-first fix contingency |
| 3. Property Layer | 7 invariants over generated inputs (fast-check) | Arbitrary design (year-range gotcha documented in plan) |

**Prerequisites:** S-01 landed (billing.ts exists on `main`); no external access or secrets needed.
**Estimated effort:** ~1 session; Phase 2 is the bulk.

## Open Risks & Assumptions

- Assumes Vitest 4.1.x works cleanly against the repo's Vite `^7.3.2` override (documented requirement is Vite ≥ 6 — satisfied, but unverified in this exact repo until Phase 1).
- Property tests could surface a genuine edge-case bug — treated as a win; contingency (red test → minimal fix) is written into the plan.
- CI wall-time increase assumed negligible (< 30 s incl. npm install of 3 dev packages).

## Success Criteria (Summary)

- A user's renewal dates for month-end and Feb 29 anchors are provably correct: every US-01/US-02 acceptance criterion exists as a named, passing test.
- The arithmetic cannot silently regress: `npm test` gates every push/PR to `main`.
- The F1 bug class (two-digit years) is permanently pinned by regression tests.

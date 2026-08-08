# First Subscription to Dashboard (S-01) — Plan Brief

> Full plan: `context/changes/first-subscription-dashboard/plan.md`

## What & Why

The north-star slice: a user registers, adds their first subscription, and sees a dashboard with its normalized monthly/yearly cost, per-currency totals, and next renewal date — the PRD's primary success criterion made real end-to-end. The value is the arithmetic (normalization + renewal dates), so this slice puts it in pure, testable functions rather than page code.

## Starting Point

F-01 is done and reviewed: the `subscriptions` table with RLS, domain types in `src/types.ts`, and a CRUD service taking an injected typed client. Auth (signup/signin/signout + middleware gating) works in production. The dashboard is a placeholder, there are no domain endpoints or UI, and zod is not installed. F-01's impl review handed one item to this slice: guard empty update patches in the zod layer (finding F2).

## Desired End State

Register → sign in (lands on `/dashboard`) → explanatory empty state → `/subscriptions/new` form (full FR-004 field set, custom-N cycles, predefined categories) → submit → dashboard immediately shows normalized monthly/yearly cost, per-currency active-only totals, and next renewal date, correct per the PRD's clamping rules.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Arithmetic placement | Pure functions in `src/lib/billing.ts`, `today` as parameter, ISO-date strings | S-02 adds tests without refactoring; no timezone/`Date.now()` hazards | Roadmap + Plan |
| Clamping/leap rules in S-01? | Yes — they ARE the algorithm; S-02 adds the verification harness | The rules come from PRD Business Logic §2; deferring them would mean rewriting, not hardening | PRD + Plan |
| API style | JSON `POST /api/subscriptions` + full-page navigation to `/dashboard` on 201 | Field-level zod errors need JSON (auth's redirect-with-query can't carry 8 fields); full navigation makes SSR totals fresh by construction | Plan |
| Validation home | Shared zod module `src/lib/validation/subscriptions.ts`, reused client-side by the form | One source of truth on both sides of the wire; mirrors every DB CHECK so users never see Postgres errors | Plan |
| F-01 F2 handoff | Update schema (partial + non-empty refine) defined now, consumed by S-03 | F-01 review explicitly recorded this as S-01's obligation; defining it beside the create schema makes S-03 unable to forget it | F-01 review |
| Rounding | Round once, at display, in one `formatMoney` helper; totals sum unrounded values | NFR: totals never show rounding artifacts | PRD + Plan |
| Dashboard interactivity | Astro-only SSR page, no React island | Pure display of server-computed data; AGENTS.md says React only where interactivity is needed | AGENTS.md |
| Route protection | Add `/subscriptions` to middleware `PROTECTED_ROUTES`; API answers its own 401 | Prefix gating covers S-03 pages too; redirects are wrong for JSON APIs | Plan |
| Post-signin landing | `/` → `/dashboard` | Completes the register → add → dashboard flow the roadmap says this slice exercises end-to-end | Roadmap |
| "Today" for renewals | Server UTC date | Workers run UTC; per-user timezones are out of MVP scope — accepted, documented limitation | Plan |

## Scope

**In scope:** billing arithmetic (normalize, next renewal with month-end/leap clamping, active-only per-currency totals); zod create + update schemas; `POST /api/subscriptions`; add-subscription form island + page; dashboard rewrite with empty state; middleware + signin-landing tweaks; shadcn input/label/select/textarea.

**Out of scope:** edit/delete/list management (S-03), test harness and edge-case proof (S-02), status-lifecycle UI (S-04), upcoming renewals (S-05), category breakdown (S-06), duplicate warning (S-07), schema/service changes, currency conversion.

## Architecture / Approach

Three-layer dependency chain, each phase shippable: pure `billing.ts` (no I/O) → validated write path (`zod schemas` → `POST /api/subscriptions` → F-01 service under RLS) → UI (React island form posting JSON; Astro SSR dashboard computing everything in frontmatter from live data, so a full-page navigation after save guarantees fresh totals).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Billing domain logic | `billing.ts` + DTO types; PRD §1–3 arithmetic, pure and deterministic | Anchor/clamping subtleties (Jan 31 → Feb 28 → Mar 31) — mitigated by manual PRD worked-example checks |
| 2. Validation + create endpoint | zod schemas (incl. F2 guard) + `POST /api/subscriptions` | Schema drift vs DB CHECKs — mitigated by compile-time assignability to `CreateSubscriptionInput` |
| 3. Add form + live dashboard | FR-004 form island, SSR dashboard with empty state, route gating, landing change | Custom-N cycle UX and per-field server-error mapping; mobile layout |

**Prerequisites:** F-01 merged (it is); local Supabase via Docker for manual verification; `npm install zod`; shadcn generator access.
**Estimated effort:** ~2–3 sessions across 3 phases.

## Open Risks & Assumptions

- "Today" is the server's UTC date — near-midnight users in non-UTC zones may see a renewal flip early; accepted for MVP.
- No automated tests until S-02 — arithmetic correctness rests on manual worked-example checks until then; the pure-function shape keeps that window short.
- `Intl.NumberFormat` currency formatting assumed available in the Workers runtime (it is, per workerd full-ICU); fallback is trivial fixed-2-decimal formatting.

## Success Criteria (Summary)

- A fresh user completes register → add "Netflix, 43 PLN, monthly, 2026-07-15, Streaming" → dashboard shows 43.00 / 516.00 PLN and the correct next renewal, with an empty state before the add and no manual refresh after (US-01 + ACs).
- Invalid input is rejected with per-field messages at the form and the API; nothing unauthenticated can reach pages or endpoint.
- `npm run lint` and `npm run build` pass without a database (CI-compatible).

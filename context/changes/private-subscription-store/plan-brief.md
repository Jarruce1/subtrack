# Private Subscription Store (F-01) — Plan Brief

> Full plan: `context/changes/private-subscription-store/plan.md`

## What & Why

Build the foundation data layer for SubTrack: a per-user `subscriptions` store with account isolation enforced **in the database**, not in application code. Every roadmap slice (S-01…S-07) reads or writes this store — it is the single named gap blocking all vertical work, and getting the isolation policy wrong here would violate the PRD's privacy guardrail silently.

## Starting Point

Auth (signup/signin/signout + route-gating middleware) works in production, but the data layer is absent: no `supabase/migrations/`, no domain tables, an untyped Supabase client, no `src/types.ts`, no services. CI runs lint + build with no database available.

## Desired End State

One migration creates the `subscriptions` table (FR-004 field set) with RLS such that a user can only ever touch their own rows and `anon` can touch nothing — verified with SQL against the local stack. The Supabase client is typed against the real schema, `src/types.ts` exports the domain entities/DTOs, and `src/lib/services/subscriptions.ts` offers typed CRUD that relies on RLS for scoping. No UI, no API routes.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| custom-N cycle representation | `billing_cycle` enum (`weekly\|monthly\|yearly\|custom`) + nullable `billing_interval_months`, locked by CHECK `(cycle='custom') = (interval is not null)` | S-01/S-02 arithmetic reads a typed integer instead of parsing `custom-3` strings, and the DB validates N (1–120) |
| Enum storage | Native Postgres enums with exact PRD labels (incl. `Health & Fitness`) | Typegen emits literal TS unions for free; labels are the stored values, no slug mapping layer |
| Isolation mechanism | RLS, per-operation policies `to authenticated` with `(select auth.uid()) = user_id`; **no** `anon` policies (deny-all); `user_id default auth.uid()` | AGENTS.md hard rule (per-operation, per-role); initplan subselect for performance; default + `WITH CHECK` blocks forged `user_id` |
| Validation depth in DB | CHECKs for positive amount, non-empty name (≤120), ISO-4217 shape currency, note ≤500, cycle/interval lock | US-01 AC ("amount must be positive") enforced at the last line of defense; zod is deferred to the first validated API route (AGENTS.md) — that's S-01 |
| Type strategy | Generated `src/db/database.types.ts` (committed, regenerated manually) + hand-curated aliases in `src/types.ts` | CI has no DB so the artifact must be committed; AGENTS.md's entity/DTO home stays `src/types.ts`, slices never import the generated file directly |
| Service shape | Thin CRUD taking an injected `TypedSupabaseClient`; never touches `user_id`; not-found and not-owned both map to `null`/`false` | RLS is the single scoping mechanism; indistinguishable not-found/not-owned avoids an existence oracle |
| Test harness | None yet — Phase 1 verifies RLS/constraints directly with psql | Roadmap defers the automated harness to S-02; SQL-level checks verify the actual guarantee, not a mock of it |

## Scope

**In scope:** one migration (enums, table, constraints, `updated_at` trigger, `user_id` index, RLS policies); typed client factory; `src/db/database.types.ts` + `src/types.ts`; `src/lib/services/subscriptions.ts` CRUD.

**Out of scope:** UI, API routes, zod, normalization/renewal arithmetic, duplicate detection, aggregation queries, seeds, automated tests, soft delete, production push (manual, post-verification).

## Architecture / Approach

Schema-first: the database owns integrity (constraints) and privacy (RLS); TypeScript mirrors it via generated types; the service layer is a thin typed pass-through that inherits scoping from the session-carrying client. Flow: `middleware (session) → typed client → services → RLS-guarded table`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema + RLS migration | Complete `subscriptions` schema with enforced isolation, verified via psql | A subtly wrong policy silently violates the privacy guardrail — hence the explicit anti-forgery/anon checks |
| 2. Typed client + domain types | `Database`-generic client, committed generated types, `src/types.ts` contract | Generated-file drift after future migrations (regeneration is manual) |
| 3. Service layer | Stable CRUD signatures S-01/S-03 build on | Invariant erosion (e.g. sneaking in `user_id` filters) weakens the RLS-only scoping story |

**Prerequisites:** Docker running (`npx supabase start`) for Phase 1 verification; nothing else.
**Estimated effort:** ~1 session; Phase 1 is the bulk, Phases 2–3 are small and mechanical.

## Open Risks & Assumptions

- Assumes the app never uses a service-role key (true today; would bypass RLS if introduced later).
- `numeric(12,2)` maps to `number` in generated types — acceptable at MVP money ranges; revisit only if precision issues surface in S-01 arithmetic.
- Local-stack psql checks assume prod Supabase enforces RLS identically (it does — same engine; prod push is still followed by a quick sanity check).

## Success Criteria (Summary)

- A second account can neither see nor modify the first account's rows, and `anon` can touch nothing — proven with SQL, not assumed from app code.
- Invalid subscriptions (bad amount/currency/cycle-interval combinations) are rejected by the database itself.
- `npm run lint` and `npm run build` pass with the typed client, domain types, and service in place — with no database running (CI-compatible).

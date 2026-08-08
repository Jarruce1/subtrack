# Private Subscription Store (F-01) Implementation Plan

## Overview

Create the foundation data layer for SubTrack: a `subscriptions` table in Supabase holding the FR-004 field set, with per-user isolation enforced at the database layer via granular RLS policies, a typed Supabase client, and a thin CRUD service layer. No UI, no API routes — this is F-01, unblocking every vertical slice (S-01…S-07).

## Current State Analysis

- **No data layer exists.** `supabase/migrations/` does not exist; `supabase/` contains only `config.toml` (project_id `10x-astro-starter`, API schemas `["public", "graphql_public"]`, db port 54322). Zero domain tables.
- **Untyped client.** `src/lib/supabase.ts` creates `createServerClient(SUPABASE_URL, SUPABASE_KEY, …)` with no `Database` generic and returns `null` when env vars are missing — callers must handle `null` (AGENTS.md convention).
- **No shared types.** `src/types.ts` does not exist. No `src/lib/services/` directory.
- **Auth works.** `src/middleware.ts` resolves the session into `context.locals.user` (typed in `src/env.d.ts` as `import("@supabase/supabase-js").User | null`) and gates `/dashboard`. Auth endpoints exist under `src/pages/api/auth/`.
- **zod is not installed.** AGENTS.md: install it with the first validated API route — F-01 adds no API routes, so zod stays out.
- **CI** (`.github/workflows/ci.yml`) runs `astro sync` + lint + build; it has no local Supabase stack, so anything CI verifies must not require a running database.
- **Lint is type-checked** (`strictTypeChecked` + `stylisticTypeChecked`), so `npm run lint` doubles as a type-level verification gate.

## Desired End State

After this plan completes:

1. `npx supabase db reset` on the local stack applies one migration that creates the `subscriptions` table with RLS enabled and per-operation, per-role policies.
2. **Isolation is enforced by the database, not by application code**: an authenticated user can select/insert/update/delete only rows where `user_id` equals their `auth.uid()`; a second user sees zero of the first user's rows; the `anon` role can read or write nothing; forging another user's `user_id` on insert/update is rejected.
3. **Invalid data is rejected by the database**: non-positive amounts, empty names, non-ISO currency codes, a `custom` cycle without an interval (or a non-custom cycle with one), and out-of-enum category/status values all fail at insert.
4. The Supabase server client is typed against the real schema, and `src/types.ts` exports the domain entity/DTO types every later slice imports.
5. `src/lib/services/subscriptions.ts` exposes typed CRUD functions that compile under `strictTypeChecked` and rely on RLS (never a service-role key) for scoping.
6. `npm run lint` and `npm run build` pass without a running database (CI-compatible).

Verification is behavioral: SQL-level isolation and constraint checks against the local stack (Phase 1), plus type-level checks via the type-checked lint and build (Phases 2–3).

### Key Discoveries:

- `src/lib/supabase.ts:5-9` — client factory returns `null` on missing env; the typed generic must be added here, and service functions must take an already-non-null client.
- `src/env.d.ts` — `App.Locals` already typed; no change needed for F-01 (no new locals).
- `supabase/config.toml:10` — local API on 54321, `db.port = 54322`; psql verification connects to `postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- AGENTS.md hard rule — every new table: RLS enabled with **granular per-operation, per-role** policies.
- AGENTS.md structure — migrations named `YYYYMMDDHHmmss_short_description.sql`; entities/DTOs in `src/types.ts`; services in `src/lib/services/`.
- `context/foundation/prd.md` FR-004 — exact field set; US-01 AC — amount must be positive; name, cost, cycle, start date required; note optional.
- `context/foundation/roadmap.md` F-01 — deliberately minimal: one entity, no seeds, no extras.
- `context/foundation/lessons.md` — one lesson (Workers `not_found_handling`), deploy-related, not applicable to this change; noted so implement doesn't re-check.

## What We're NOT Doing

- **No UI** — no pages, components, or dashboard changes (S-01).
- **No API routes** under `src/pages/api/` — and therefore **no zod** (AGENTS.md: zod arrives with the first validated route, which is S-01's).
- **No cost-normalization or renewal-date arithmetic** (S-01/S-02) — the month-end/leap-year hard rule applies to those slices, not to storage.
- **No duplicate-name detection** (S-07) — no normalized-name column or index; S-07 decides its own mechanism.
- **No aggregation queries/views** (S-01, S-04, S-06) — the service is plain CRUD.
- **No seed data, no test harness** — automated tests arrive with S-02 (roadmap decision).
- **No currency conversion or currency reference table** — a CHECK on ISO-4217 shape is enough for a single-tenant MVP.
- **No soft delete** — FR-007 delete is for entry mistakes; `cancelled` status covers real ended subscriptions.
- **No production deploy of the migration inside this plan's phases** — see Migration Notes; prod push is a manual step at the owner's discretion after Phase 1 verification.

## Implementation Approach

One SQL migration owns the entire schema surface (enums, table, constraints, trigger, index, RLS). Isolation lives in the database so no later slice can bypass it from application code. On top of that: generated database types (single source of truth = the schema) with hand-curated domain aliases in `src/types.ts`, and a thin service layer that accepts an injected typed client — the client carries the user's session, so RLS scopes every query and the service never touches `user_id` filtering logic.

Custom-N billing cycles are stored relationally as `billing_cycle = 'custom'` + `billing_interval_months smallint`, mutually locked by a CHECK constraint — rather than a packed string like `custom-3` — so the renewal arithmetic in S-01/S-02 reads a typed integer instead of parsing strings, and the database can validate N.

## Critical Implementation Details

- **RLS policy predicate**: write `(select auth.uid()) = user_id` (subselect form), not bare `auth.uid() = user_id`. The subselect is evaluated once per statement (initplan) instead of per row — Supabase's documented performance guidance for RLS.
- **`user_id` defaults to `auth.uid()`** so service inserts never pass a user id; combined with the insert policy's `WITH CHECK`, a forged `user_id` is rejected rather than silently accepted.
- **Generated types must not require a live DB in CI**: `src/db/database.types.ts` is generated locally (`npx supabase gen types typescript --local`) and committed. CI never regenerates it. Regeneration is a manual step whenever a migration changes the schema.
- **Postgres enum labels may contain spaces and `&`** (`Health & Fitness`, `News & Media`) — this is valid and the generated TS union carries the exact literals; do not "slugify" category values, the PRD's labels are the stored values.

## Phase 1: Subscriptions schema and RLS migration

### Overview

Create the single migration that brings the database from empty to the complete F-01 schema: three enum types, the `subscriptions` table with all integrity constraints, an `updated_at` trigger, a `user_id` index, and RLS with per-operation policies for the `authenticated` role.

### Changes Required:

#### 1. Migration file

**File**: `supabase/migrations/20260808205837_create_subscriptions.sql` (regenerate the timestamp prefix with `date +%Y%m%d%H%M%S` at implementation time; keep the `_create_subscriptions` suffix)

**Intent**: One migration owning the full F-01 schema surface, so `supabase db reset` reproduces the store from zero and the prod push is a single file.

**Contract** — the migration creates, in order:

1. **Enum types** (public schema):
   - `subscription_status`: `active | paused | cancelled`
   - `subscription_billing_cycle`: `weekly | monthly | yearly | custom`
   - `subscription_category`: `Streaming | Software | Health & Fitness | News & Media | Other` (exact PRD labels)
2. **Table `public.subscriptions`**:
   - `id uuid primary key default gen_random_uuid()`
   - `user_id uuid not null default auth.uid() references auth.users(id) on delete cascade`
   - `name text not null` + CHECK: trimmed name non-empty, `char_length(name) <= 120`
   - `amount numeric(12,2) not null` + CHECK `amount > 0` (US-01 AC: positive)
   - `currency text not null` + CHECK `currency ~ '^[A-Z]{3}$'` (ISO-4217 alpha-3 shape)
   - `billing_cycle subscription_billing_cycle not null`
   - `billing_interval_months smallint` (nullable) + CHECK `billing_interval_months between 1 and 120` when present
   - table-level CHECK: `(billing_cycle = 'custom') = (billing_interval_months is not null)` — custom requires N, non-custom forbids N
   - `start_date date not null`
   - `category subscription_category not null`
   - `status subscription_status not null default 'active'`
   - `note text` (nullable) + CHECK `char_length(note) <= 500`
   - `created_at timestamptz not null default now()`
   - `updated_at timestamptz not null default now()`
3. **Trigger**: function `public.set_updated_at()` (`language plpgsql`, `set search_path = ''`) returning `new` with `new.updated_at = now()`; `before update` trigger on `subscriptions`.
4. **Index**: `subscriptions_user_id_idx` on `subscriptions (user_id)` — every RLS check and every domain query filters by `user_id`.
5. **RLS**: `alter table public.subscriptions enable row level security;` then four policies, one per operation, scoped `to authenticated` (AGENTS.md hard rule: per-operation, per-role):
   - `select` — `using ((select auth.uid()) = user_id)`
   - `insert` — `with check ((select auth.uid()) = user_id)`
   - `update` — `using ((select auth.uid()) = user_id)` `with check ((select auth.uid()) = user_id)`
   - `delete` — `using ((select auth.uid()) = user_id)`
   - **No policies for `anon`** — with RLS enabled, absence of a policy is deny-all; this implements FR-003/Access Control ("unauthenticated visitor cannot reach any subscription data") at the data layer. This is a deliberate per-role decision, not an omission.
   - No `service_role` policies either — `service_role` bypasses RLS by design; the app never uses it (AGENTS.md: only `SUPABASE_KEY` server env, which is the publishable/anon key).

### Success Criteria:

#### Automated Verification:

- Migration applies from zero: `npx supabase db reset` completes without error (requires Docker + `npx supabase start` done once)

#### Manual Verification:

All via `psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres"` against the local stack, using two seeded test users. Create them through the local auth API — not by inserting into `auth.users` directly (brittle: NOT NULL columns, password hashing, triggers): `curl -X POST http://127.0.0.1:54321/auth/v1/signup -H "apikey: <local anon key from npx supabase status>" -H "Content-Type: application/json" -d '{"email":"a@test.local","password":"password123"}'` (repeat for `b@test.local`), then read the two uuids from `auth.users`. Simulate roles inside transactions with `begin; set local role authenticated; set local request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}'; … ; rollback;`:

- Isolation: user A inserts a row (no explicit `user_id` — default fills it); user B `select count(*)` sees 0 rows; user B `update`/`delete` targeting A's row affects 0 rows
- Anti-forgery: user B `insert` with explicit `user_id` = A's uuid is rejected by the insert policy's `WITH CHECK`; user A `update` setting `user_id` to B's uuid is rejected
- Anon deny: `set local role anon` — `select` returns 0 rows and `insert` is rejected (no policy)
- Constraints: `amount <= 0` rejected; empty/whitespace name rejected; `currency 'zł'` rejected; `billing_cycle 'custom'` without `billing_interval_months` rejected; `billing_cycle 'monthly'` with `billing_interval_months` rejected; out-of-enum category rejected
- Trigger: `update` on a row bumps `updated_at` above its previous value

**Implementation Note**: After completing this phase and the automated verification passes, pause for manual confirmation that the psql isolation/constraint checks were run before proceeding to Phase 2.

---

## Phase 2: Typed client and domain types

### Overview

Make the schema visible to TypeScript: generate database types from the migrated local schema, thread the `Database` generic through the Supabase client factory, and curate the domain entity/DTO aliases in `src/types.ts` that S-01+ will import.

### Changes Required:

#### 1. Generated database types

**File**: `src/db/database.types.ts` (new directory; generated artifact, committed)

**Intent**: Single source of truth for row/insert/update shapes and enum unions, derived from the real schema so types can never drift from the database silently.

**Contract**: Output of `npx supabase gen types typescript --local`, committed verbatim with a leading "generated — do not edit; regenerate after every migration" comment if the generator doesn't emit one. Regeneration is manual (CI has no DB). This file is the only place raw `Database` types live; app code imports domain aliases from `src/types.ts` instead (AGENTS.md keeps entities/DTOs in `src/types.ts` — the generated file is a build artifact of the schema, not a hand-written entity file).

#### 2. Domain types

**File**: `src/types.ts` (new)

**Intent**: The hand-curated entity/DTO surface for the whole app, per AGENTS.md. Later slices import from here, never from `src/db/database.types.ts` directly.

**Contract**: Re-exports/aliases derived from `Database`:

- `Subscription` = subscriptions Row
- `SubscriptionInsert` / `SubscriptionUpdate` = subscriptions Insert / Update
- `SubscriptionStatus`, `BillingCycle`, `SubscriptionCategory` = the three enum unions
- `CreateSubscriptionInput` = `Omit<SubscriptionInsert, "id" | "user_id" | "created_at" | "updated_at">` — services never accept caller-supplied identity/audit fields
- `UpdateSubscriptionInput` = same omissions applied to `SubscriptionUpdate`

These five-plus-two names are the contract other slices depend on; keep them stable.

#### 3. Typed client factory

**File**: `src/lib/supabase.ts`

**Intent**: Make every query typed end-to-end.

**Contract**: `createServerClient<Database>(…)` — signature and `null`-return behavior otherwise unchanged. Export the client's type as `export type TypedSupabaseClient = NonNullable<ReturnType<typeof createClient>>` (or equivalent) so services can accept it without re-deriving the generic.

#### 4. Convention record

**File**: `AGENTS.md`

**Intent**: Record the new generated-types convention where every future agent reads it, so the file is regenerated after schema changes and never imported directly by app code.

**Contract**: One added line in "## Structure & conventions": `src/db/database.types.ts` is generated (`npx supabase gen types typescript --local`), committed, regenerated manually after every migration; app code imports domain types from `src/types.ts`, never from the generated file. No other AGENTS.md edits.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes (type-checked lint compiles the generated types and the generic threading)
- `npm run build` passes without a running database (proves CI compatibility)
- Regeneration is idempotent: rerunning `npx supabase gen types typescript --local` produces no diff against the committed file (local-only check — requires the Phase 1 stack running and migrated, unlike the lint/build criteria above which must pass with no DB)

#### Manual Verification:

- Auth flows still work in `npm run dev` (sign in, reach `/dashboard`, sign out) — the typed generic changed the client factory every request goes through

**Implementation Note**: After automated verification passes, pause for manual confirmation of the dev-server auth smoke check before Phase 3.

---

## Phase 3: Subscription service layer

### Overview

Add the CRUD service that all later slices call. It is deliberately thin: RLS does the scoping, the database does the validation, the service does typed data access and error surfacing.

### Changes Required:

#### 1. Subscriptions service

**File**: `src/lib/services/subscriptions.ts` (new directory)

**Intent**: One module owning all reads/writes of the `subscriptions` table, so no page or endpoint ever calls `.from("subscriptions")` directly. Takes an injected authenticated client — callers (middleware-derived) have already handled the factory's `null` case.

**Contract** (signatures are load-bearing — S-01/S-03 build on them):

```ts
listSubscriptions(supabase: TypedSupabaseClient): Promise<Subscription[]>          // ordered by created_at desc
getSubscription(supabase: TypedSupabaseClient, id: string): Promise<Subscription | null>  // null when not found / not owned (RLS makes these indistinguishable — deliberate)
createSubscription(supabase: TypedSupabaseClient, input: CreateSubscriptionInput): Promise<Subscription>
updateSubscription(supabase: TypedSupabaseClient, id: string, input: UpdateSubscriptionInput): Promise<Subscription | null>  // null when not found / not owned
deleteSubscription(supabase: TypedSupabaseClient, id: string): Promise<boolean>    // false when not found / not owned
```

Behavioral invariants:

- Never passes or filters `user_id` — RLS scopes every statement; the insert relies on the column default.
- Never imports a service-role key or creates its own client.
- On a `PostgrestError` (other than the not-found cases mapped above) the function throws an `Error` carrying the Postgres message — constraint violations surface to callers, which is where S-01's zod layer will later pre-empt them with friendly messages.
- No input validation in this layer beyond types (zod belongs to the first validated API route, per AGENTS.md).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes (service compiles under `strictTypeChecked`; a wrong field name or enum literal in the service would fail here)
- `npm run build` passes

#### Manual Verification:

- Code-level review against the invariants: no `user_id` handling, no extra client creation, not-found mapping as specified (a wrong invariant here silently weakens the isolation story every slice inherits)

**Implementation Note**: After automated verification passes, confirm the invariant review before closing the change.

---

## Testing Strategy

### Unit Tests:

- None in this change — the automated test harness deliberately arrives with S-02 (roadmap: the first slice whose acceptance criteria cannot be hand-checked). The database itself is the test surface here: constraints and RLS are exercised directly with SQL in Phase 1's manual verification.

### Integration Tests:

- None automated; the Phase 1 psql checklist is the integration verification of the isolation guarantee. S-01 will exercise the full client→service→RLS path end-to-end.

### Manual Testing Steps:

1. `npx supabase start` && `npx supabase db reset` — migration applies from zero.
2. Run the Phase 1 psql checklist (isolation, anti-forgery, anon deny, constraints, trigger).
3. `npm run lint && npm run build` — types hold without a DB.
4. `npm run dev` — sign-in → `/dashboard` → sign-out still works.

## Performance Considerations

- `(select auth.uid())` initplan form in all four policies avoids per-row function calls.
- `subscriptions_user_id_idx` supports both the RLS predicate and every domain query; at 5–30 rows per user this is future-proofing, not a hot-path fix.
- No other performance work — target scale is small (PRD frontmatter).

## Migration Notes

- Greenfield: no existing data to migrate. Rollback of an applied migration is `drop table public.subscriptions; drop type subscription_status, subscription_billing_cycle, subscription_category; drop function public.set_updated_at();` — safe pre-S-01 because nothing references the table yet.
- **Production apply is manual and outside this plan's phases**: after Phase 1 is verified locally, push with `npx supabase db push` against the linked project (or via the dashboard SQL editor). CI does not apply migrations. Nothing user-facing changes in prod until S-01 ships UI, so timing is flexible — but pushing early lets S-01 start against a real schema.

## References

- Roadmap item: `context/foundation/roadmap.md` — F-01 "Private subscription store"
- Field set + validation source: `context/foundation/prd.md` — FR-004, US-01 acceptance criteria, Access Control, Business Logic §1–2 (informs the custom-N representation)
- Hard rules + conventions: `AGENTS.md` — RLS hard rule, migration naming, `src/types.ts` / `src/lib/services/` placement, zod-with-first-route
- Client factory: `src/lib/supabase.ts`; auth wiring: `src/middleware.ts`
- Lessons check: `context/foundation/lessons.md` — no applicable lesson for this change (single entry is deploy-config-related)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Subscriptions schema and RLS migration

#### Automated

- [x] 1.1 Migration applies from zero: `npx supabase db reset` completes without error

#### Manual

- [x] 1.2 Isolation: user A's rows invisible and unmodifiable for user B (select 0, update/delete affect 0)
- [x] 1.3 Anti-forgery: insert/update with another user's `user_id` rejected by policy `WITH CHECK`
- [x] 1.4 Anon deny: `anon` role selects 0 rows and cannot insert
- [x] 1.5 Constraints: non-positive amount, empty name, bad currency, custom/interval mismatch, out-of-enum values all rejected
- [x] 1.6 Trigger: `updated_at` bumps on update

> Phase 1 verification notes (run autonomously via psql against the local stack, two signup-created users): 1.2 — B `count(*)` = 0, `UPDATE 0`, `DELETE 0` against A's row; 1.3 — both forgeries fail with `new row violates row-level security policy`; 1.4 — anon select AND insert fail with `permission denied` (stronger than the planned "0 rows": the Supabase postgres 17 image grants API roles no DML by default, so the migration adds an explicit DML grant to `authenticated` only — anon is denied at the privilege layer on top of having no RLS policy; end state "anon can read or write nothing" holds); 1.5 — six rejections via `subscriptions_amount_check`, `subscriptions_name_check`, `subscriptions_currency_check`, `subscriptions_cycle_interval_check` (×2), enum error for `Gaming`; 1.6 — `updated_at > created_at` after update (`t`). Sanity: valid `custom` + interval insert accepted.

### Phase 2: Typed client and domain types

#### Automated

- [ ] 2.1 `npm run lint` passes with generated types and typed client factory
- [ ] 2.2 `npm run build` passes without a running database
- [ ] 2.3 Type regeneration is idempotent (no diff on re-run)

#### Manual

- [ ] 2.4 Auth flows still work in `npm run dev` (sign in, `/dashboard`, sign out)

### Phase 3: Subscription service layer

#### Automated

- [ ] 3.1 `npm run lint` passes with the service module
- [ ] 3.2 `npm run build` passes

#### Manual

- [ ] 3.3 Invariant review: no `user_id` handling, no own client, not-found mapping per contract

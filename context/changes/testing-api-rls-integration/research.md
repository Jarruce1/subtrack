---
date: 2026-08-08T22:30:00+02:00
researcher: Claude (Fable 5)
git_commit: 71d5d11d3d793fb7c277ce7e0ef38aa2110c369e
branch: feature/testing-api-rls-integration
repository: subtrack
topic: "Where risks #2 (IDOR/RLS+ACL) and #5 (injection parity) pass through the code; oracles that prove protection at the DB level; cheapest integration-test setup on the local Supabase stack"
tags: [research, codebase, testing, rls, acl, supabase, integration]
status: complete
last_updated: 2026-08-08
last_updated_by: Claude (Fable 5)
---

# Research: API & RLS integration tests (test-plan Phase 1)

**Date**: 2026-08-08, 22:30 CET
**Git Commit**: 71d5d11 (branch `feature/testing-api-rls-integration`)

## Research Question

For test-plan §3 Phase 1 (risks #2 IDOR/RLS and #5 injection parity):
where does each risk pass through the code (migrations/RLS/ACL, service,
endpoints)? What oracle proves protection at the DATABASE level? What is
the cheapest test? Externally: the proven pattern for Vitest +
@supabase/supabase-js integration tests against the local stack (per-test
users via the auth API, service-role for teardown, sequential execution).

## Summary

- Isolation is enforced **entirely by the database**: four per-operation
  RLS policies scoped to `authenticated`, keyed on `(select auth.uid()) =
  user_id`, plus zero anon grants/policies. The service layer
  (`src/lib/services/subscriptions.ts`) deliberately never filters or
  passes `user_id`; API routes only add auth-gating and zod. Therefore the
  cheapest honest test is **@supabase/supabase-js straight at PostgREST**
  (`http://127.0.0.1:54321`) with real user sessions — no Astro server
  needed, and no mocking (a mocked client proves nothing about RLS).
- The ACL lesson (lessons.md "New tables inherit RLS-exempt privileges")
  is already fixed by migration `20260808213726` — current relacl is
  `{postgres=arwdDxtm/postgres,authenticated=arwd/postgres}`. The
  regression oracle is a SQL assertion: `has_table_privilege(role,
  'public.subscriptions', priv)` matrix over {anon, authenticated,
  service_role} × {SELECT,…,MAINTAIN} plus `relrowsecurity = true`.
- Injection/validation parity: every zod rule mirrors a DB CHECK
  (`subscriptions_name_check`, `_amount_check`, `_currency_check`,
  `_billing_interval_months_check`, `_cycle_interval_check`,
  `_note_check`). Sending malicious payloads **directly to PostgREST as
  an authenticated user bypasses zod entirely** and proves the DB net
  holds on its own: CHECK violations surface as PostgREST error code
  `23514`; a script-tag name is stored as an inert literal (Postgres
  stores text verbatim; render-safety is React's job — the parity claim
  is "stored literally, never executed/evaluated by the DB or API").

## Detailed Findings

### Risk #2 — where isolation lives

- `supabase/migrations/20260808210821_create_subscriptions.sql:79`
  grants `select, insert, update, delete` to `authenticated` only —
  **anon has no table privileges at all**, so anon access fails at the
  privilege layer (`42501 permission denied`) before RLS is consulted.
- Same file lines 83–117: RLS enabled + 4 policies
  (`subscriptions_select_own/insert_own/update_own/delete_own`), all `to
  authenticated`, all `(select auth.uid()) = user_id`. `user_id` has
  `default auth.uid()` (line 25) and the service never sets it — so a
  **forged `user_id` on insert/update** is only stoppable by the
  `with check` clauses (error `42501`, "new row violates row-level
  security policy").
- `src/lib/services/subscriptions.ts:1-11` — module comment is the
  contract: "this layer never passes or filters user_id … never uses a
  service-role key." Cross-user update/delete therefore surface as **0
  rows** (`update … eq(id)` → PGRST116 → `null`; `delete … select('id')`
  → `[]` → `false`), which `src/pages/api/subscriptions/[id].ts:55-58,82-85`
  maps to 404. The DB-level oracle is the 0-rows result **plus** a
  re-read as the owner proving the row is unchanged/still present.
- Conclusion: testing through PostgREST with two real sessions exercises
  the exact same enforcement path the app uses (same JWT role claim, same
  policies); the Astro route adds nothing to isolation.

### Risk #2 — ACL regression oracle

- `supabase/migrations/20260808213726_revoke_subscriptions_default_privileges.sql`
  revokes TRUNCATE/REFERENCES/TRIGGER/MAINTAIN from all three API roles.
- Verified live (psql, 127.0.0.1:54322): relacl =
  `{postgres=arwdDxtm/postgres,authenticated=arwd/postgres}`.
- Oracle: `has_table_privilege` matrix — expected TRUE only for
  `authenticated` × {SELECT, INSERT, UPDATE, DELETE}; FALSE for all 24
  other cells (3 roles × 8 privileges). Plus `relrowsecurity` from
  `pg_class`. This encodes the lessons.md rule as a permanent regression
  test and will catch any future migration re-granting the "Dxtm" bits.
- `psql` is available at `/opt/homebrew/bin/psql`; DB URL
  `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Running the
  assertion via `execSync(psql -tAc …)` avoids adding a `pg` dependency.

### Risk #5 — parity net

- zod schemas: `src/lib/validation/subscriptions.ts` (unit-tested in
  `subscriptions.test.ts`). DB CHECKs: migration `20260808210821` lines
  26–45. Mapping (zod rule → CHECK):
  - name trim >0, ≤120 → `subscriptions_name_check`
  - amount positive → `subscriptions_amount_check` (`amount > 0`)
  - currency `^[A-Z]{3}$` → `subscriptions_currency_check`
  - interval 1–120 → `subscriptions_billing_interval_months_check`
  - cycle/interval pairing → `subscriptions_cycle_interval_check`
    (`(billing_cycle = 'custom') = (billing_interval_months is not null)`)
  - note ≤500 → `subscriptions_note_check`
- The API routes (`src/pages/api/subscriptions/index.ts:43-49`) treat any
  DB error as opaque 500 because "zod pre-empts every CHECK on the happy
  path" — i.e. **the DB CHECK is the only net against a non-zod path**
  (future endpoint, PostgREST direct, studio, bug). The parity test sends
  payloads directly to PostgREST as an authenticated user: expected
  outcomes are PostgREST error `code: "23514"` naming the constraint, or
  (script-tag case) successful storage of the byte-identical literal.
- No render surface bypasses React/Astro escaping today (no
  `set:html`/`dangerouslySetInnerHTML` in `src/` — grepped), so the
  stored-literal assertion is the correct DB-level end of the parity
  chain; rendered-inert is Phase 2 (e2e) territory.

### Test infrastructure — cheapest setup

- Local stack is running (`npx supabase status -o json`): API
  `http://127.0.0.1:54321`, DB `…:54322`, plus ANON/SERVICE_ROLE keys in
  the JSON. Keys are demo-stable but fetched at runtime to stay honest.
- Auth: `supabase/config.toml` → `[auth.email] enable_signup = true`,
  `enable_confirmations = false`, `minimum_password_length = 6` — so
  `auth.signUp()` returns a **live session immediately**; no email hop.
- Cleanup: service-role client → `auth.admin.deleteUser(id)`; the FK
  `user_id … references auth.users on delete cascade` (migration line 25)
  removes the user's subscriptions with the user. Test users use the
  `tst-` local-part prefix (owner directive).
- Vitest: existing `vitest.config.ts` includes `src/**/*.test.ts`. A
  separate `vitest.integration.config.ts` with
  `include: ["src/tests/integration/**/*.test.ts"]`,
  `fileParallelism: false` (one file at a time — shared local DB, no
  cross-file races) and a generous `testTimeout` keeps the suites
  disjoint; the default config gains an `exclude` for the integration
  dir so `npm test` (71 unit tests) is untouched. `vitest related`
  (lefthook) uses the default config, so staged integration files run
  zero tests pre-commit — correct, since the gate is ad hoc (test-plan
  §5: not in CI, mandatory before merging migration/API changes).

### External pattern (brief)

Standard supabase-js integration pattern against a local stack (matches
Supabase's own testing guidance and community practice; no docs MCP
available — grounded in the supabase-js v2 API surface already in
`package.json` and the F-01 manual verification):

1. One anon-key client per test user; `auth.signUp({ email, password })`
   with unique emails → session-bearing client whose PostgREST requests
   carry the user JWT (role `authenticated`).
2. Service-role client (`persistSession: false`, `autoRefreshToken:
   false`) reserved for admin teardown only — never for assertions
   (it bypasses RLS by design).
3. Sequential files (`fileParallelism: false`) instead of a pool: the
   suite is small (~16 tests), correctness > speed, and it removes any
   chance of cross-file interference on one shared database.
4. Unique per-run identities (timestamp + random suffix) so re-runs never
   collide even if a teardown is interrupted.

## Code References

- `supabase/migrations/20260808210821_create_subscriptions.sql:23-46` — table + CHECKs; `:79` grant; `:83-117` RLS policies
- `supabase/migrations/20260808213726_revoke_subscriptions_default_privileges.sql:16-18` — Dxtm revoke
- `src/lib/services/subscriptions.ts:16-67` — RLS-trusting service (no user_id handling)
- `src/pages/api/subscriptions/index.ts:20-50`, `src/pages/api/subscriptions/[id].ts:24-89` — auth-gate + zod + 404 mapping
- `src/lib/validation/subscriptions.ts:33-106` — zod mirror of the CHECKs
- `src/lib/supabase.ts` — SSR client factory (not used by integration tests; tests talk to PostgREST directly)
- `vitest.config.ts:13-16` — default include pattern to carve the integration dir out of
- `supabase/config.toml:202-209` — signup on, confirmations off

## Architecture Insights

- Defense-in-depth is layered exactly as the test plan hopes: privilege
  layer (no anon grants) → RLS (own-rows only) → CHECK constraints →
  zod (UX only). Each layer is independently assertable from outside the
  app process, which is why the whole phase needs no Astro server.
- The routes' "foreign = nonexistent = 404" contract is a *consequence*
  of RLS returning 0 rows — so proving 0-rows-at-the-DB is strictly
  stronger than proving the 404.

## Historical Context (from prior changes)

- `context/changes/private-subscription-store/` (F-01) — isolation was
  verified once, manually, via psql (test-plan risk #2 source); the ACL
  lesson and fix migration came from its impl review.
- `context/foundation/lessons.md` — the TRUNCATE/default-ACL burn that
  the ACL assertion here turns into a permanent regression check.

## Open Questions

None — all decisions grounded; plan can proceed.

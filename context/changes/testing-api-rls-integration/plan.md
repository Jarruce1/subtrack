# API & RLS Integration Tests (Test-Plan Phase 1) Implementation Plan

## Overview

Stand up the project's first integration-test suite against the real local
Supabase stack and use it to pin the two highest uncovered risks from
`context/foundation/test-plan.md`: #2 (IDOR/RLS isolation + the ACL lesson
from lessons.md) and #5 (injection/validation parity — DB CHECKs hold
independently of zod). Scope per change.md: risk #3 (swallowed errors)
stays with test-plan Phase 3.

## Current State Analysis

- ~71 unit tests (`npm test`, `vitest.config.ts` includes
  `src/**/*.test.ts`); zero DB/integration tests.
- Isolation lives entirely in `supabase/migrations/20260808210821_create_subscriptions.sql`
  (grants: authenticated-only DML; RLS: 4 own-rows policies; `user_id
  default auth.uid()`), hardened by `20260808213726` (Dxtm revoke).
  Verified live relacl: `{postgres=arwdDxtm/postgres,authenticated=arwd/postgres}`.
- Service (`src/lib/services/subscriptions.ts`) never touches `user_id`;
  API routes add only auth-gate + zod. So PostgREST-direct tests exercise
  the identical enforcement path (see research.md).
- Local stack running; `enable_confirmations = false` → `auth.signUp`
  returns a live session; `psql` on PATH; DB at 127.0.0.1:54322.

## Desired End State

- `npm run test:integration` runs a dedicated Vitest project
  (`vitest.integration.config.ts`, `src/tests/integration/`) sequentially
  against the local stack: preflight + RLS isolation + ACL assertion +
  injection parity — all green.
- `npm test` still runs exactly the 71 unit tests (integration dir
  excluded). Not wired into CI (test-plan §5: local ad hoc gate).
- Deliberate-break gate performed and documented: weakening one RLS
  policy in the local DB makes the isolation test fail; `db reset`
  restores green.
- test-plan §3 (Phase 1 → done) + §6.2/§6.4 cookbook filled; AGENTS.md
  gains a "How we test" section.

### Key Discoveries:

- Anon is denied at the *privilege* layer (no grants) → PostgREST error
  `42501`, not merely empty results.
- Forged `user_id` (insert with someone else's id; update flipping owner)
  is stopped only by the policies' `with check` → error `42501`.
- Cross-user update/delete surface as 0 rows (no error) — the oracle must
  re-read as the owner to prove no change happened.
- CHECK violations via PostgREST → error `code: "23514"` with the
  constraint name in the message.
- `has_table_privilege()` matrix + `pg_class.relrowsecurity` via
  `psql -tAc` (execSync) = ACL oracle without a new `pg` dependency.

## What We're NOT Doing

- No CI wiring (deliberate — test-plan §5).
- No tests through the Astro dev server / API routes (routes add nothing
  to isolation; route error contracts are test-plan Phase 3).
- No mocking of any database piece ("nie mockujemy DB dla RLS").
- No changes to migrations, S-06/S-07 surfaces (`src/pages/dashboard.astro`,
  `src/components/subscriptions/SubscriptionForm.tsx`,
  `src/pages/api/subscriptions/*.ts`), or cloud resources.
- No new runtime dependencies (`psql` + supabase-js already present).

## Implementation Approach

Direct `@supabase/supabase-js` clients against PostgREST
(`http://127.0.0.1:54321`) with real per-run users (`tst-…@example.com`,
signup via auth API), service-role admin client for teardown
(`auth.admin.deleteUser` → FK cascade removes rows), `psql` via
`execSync` for SQL assertions. Keys/URLs discovered at runtime from
`npx supabase status -o json` (cached per process). Sequential files
(`fileParallelism: false`); unique identities make re-runs safe even
after an interrupted teardown.

## Phase 1: Integration test infrastructure

### Overview

Separate Vitest project, npm script, shared helpers, stack preflight.

### Changes Required:

#### 1. `vitest.integration.config.ts` (new)

**Intent**: Own config so integration tests never run under `npm test`
or lefthook's `vitest related`, and run one file at a time against the
shared local DB.
**Contract**: `include: ["src/tests/integration/**/*.test.ts"]`,
`fileParallelism: false`, `testTimeout: 15000`, same `@` alias + node env
as the unit config.

#### 2. `vitest.config.ts`

**Intent**: Carve the integration dir out of the default suite.
**Contract**: add `exclude: [...defaults, "src/tests/integration/**"]`.

#### 3. `package.json`

**Intent**: The ad hoc gate command.
**Contract**: `"test:integration": "vitest run --config vitest.integration.config.ts"`.

#### 4. `src/tests/integration/helpers.ts` (new)

**Intent**: One place for stack discovery, user lifecycle, SQL access.
**Contract**:
- `getStack()` — execSync `npx supabase status -o json`, cached; returns
  `{ apiUrl, dbUrl, anonKey, serviceRoleKey }`; throws with a "start
  supabase" hint on failure.
- `createTestUser()` — anon-key client, `auth.signUp` with
  `tst-<Date.now()>-<rand>@example.com` / fixed password; returns
  `{ client, userId }` where `client` carries the session; registers the
  id for cleanup.
- `createAnonClient()` — anon key, no session.
- `cleanupTestUsers()` — service-role client (`persistSession: false`),
  `auth.admin.deleteUser(id)` for every registered id (FK cascade deletes
  rows); called from each suite's `afterAll`.
- `sql(query)` — `psql -tA -c` against the DB URL via execSync, returns
  trimmed stdout.

#### 5. `src/tests/integration/preflight.test.ts` (new)

**Intent**: Fast, diagnostic failure when the gate is run without the
stack (Docker down) — every later suite depends on these facts.
**Contract**: asserts `getStack()` yields URLs+keys, `sql("select 1")`
answers, and the REST endpoint responds over HTTP.

### Success Criteria:

#### Automated Verification:
- [ ] `npm test` → 71 unit tests pass, zero integration files collected
- [ ] `npm run test:integration` → preflight green
- [ ] `npm run lint`, `npx astro check`, `npm run build` clean

#### Manual Verification:
- [ ] none

## Phase 2: RLS isolation suite (risk #2)

### Overview

`src/tests/integration/rls-isolation.test.ts` — two real users A and B,
plus anon; every assertion is a DB-level fact.

### Changes Required:

#### 1. `src/tests/integration/rls-isolation.test.ts` (new)

**Intent**: Prove the §2 oracle: B cannot see/change/delete A's data AT
THE DATABASE; anon fully denied; ownership forgery rejected.
**Contract** (tests; A seeds one row in `beforeAll` via own client):
1. Owner sanity: A selects own row (guards against vacuous green).
2. B `select` (list and `eq(id)`) → empty, no error.
3. B `update` A's row → 0 rows; re-read as A: fields unchanged.
4. B `delete` A's row → 0 rows; re-read as A: row still exists.
5. Anon `select` → error `42501` (privilege layer, not empty result).
6. Anon `insert` → error `42501`.
7. A `insert` with forged `user_id: B` → error `42501` (with-check).
8. A `update` own row setting `user_id: B` → error `42501` (with-check).

### Success Criteria:

#### Automated Verification:
- [ ] `npm run test:integration` green; unit suite untouched
- [ ] lint / astro check / build clean

#### Manual Verification:
- [ ] (deferred to Phase 5 gate) weakened policy makes test 2 fail

## Phase 3: ACL regression assertion (risk #2, lessons.md)

### Overview

`src/tests/integration/table-acl.test.ts` — SQL-level ACL matrix.

### Changes Required:

#### 1. `src/tests/integration/table-acl.test.ts` (new)

**Intent**: Turn the lessons.md TRUNCATE burn into a permanent check.
**Contract**: via `sql()` — `has_table_privilege(role,
'public.subscriptions', priv)` for {anon, authenticated, service_role} ×
{SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER,
MAINTAIN}: TRUE only for authenticated × DML (12 of 24 cells FALSE for
the four RLS-exempt privileges in particular); `pg_class.relrowsecurity`
is TRUE.

### Success Criteria:

#### Automated Verification:
- [ ] `npm run test:integration` green
- [ ] lint / astro check / build clean

#### Manual Verification:
- [ ] none

## Phase 4: Injection / validation parity (risk #5)

### Overview

`src/tests/integration/injection-parity.test.ts` — malicious payloads
straight to PostgREST as an authenticated user (zod fully bypassed).

### Changes Required:

#### 1. `src/tests/integration/injection-parity.test.ts` (new)

**Intent**: Prove the DB CHECK net holds independently of zod
(test-plan anti-pattern: "testing the schema in isolation only").
**Contract** (tests, one `tst-` user):
1. `<script>alert(1)</script>` name → insert succeeds; read back
   byte-identical literal (stored inert, never evaluated).
2. `amount: -5` → `23514`, `subscriptions_amount_check`.
3. `billing_cycle: "monthly"` + `billing_interval_months: 3` → `23514`,
   `subscriptions_cycle_interval_check`.
4. `billing_cycle: "custom"` + interval `null` → `23514`, same check.
5. 501-char note → `23514`, `subscriptions_note_check`.
6. 121-char name → `23514`, `subscriptions_name_check`.

### Success Criteria:

#### Automated Verification:
- [ ] `npm run test:integration` fully green (~16 tests)
- [ ] lint / astro check / build clean

#### Manual Verification:
- [ ] none

## Phase 5: Adversarial gate + docs

### Overview

Prove the suite can fail; then document the pattern where future work
will look for it.

### Changes Required:

#### 1. Deliberate-break gate (manual, local DB only — no file changes)

**Intent**: A suite that cannot fail proves nothing.
**Contract**: `psql` → `alter policy subscriptions_select_own on
public.subscriptions using (true);` → run `npm run test:integration` →
the B-cannot-select test MUST fail → `npx supabase db reset` → suite
green again. Result recorded in Progress.

#### 2. `context/foundation/test-plan.md`

**Intent**: Phase 1 → done; cookbook filled.
**Contract**: §3 row 1 Status `done` + change folder; §6.2 and §6.4 gain
location, no-DB-mocking policy, run command, oracle notes.

#### 3. `AGENTS.md`

**Intent**: Contributors discover the two-suite split without reading the
test plan.
**Contract**: short "How we test" section — unit vs integration,
commands, when each gate applies (integration mandatory before merging
migration/API changes; not in CI).

### Success Criteria:

#### Automated Verification:
- [ ] `npm test` (71) + `npm run test:integration` green after reset
- [ ] lint / astro check / build clean

#### Manual Verification:
- [ ] Break-gate: red under weakened policy, green after reset (Progress)

## Testing Strategy

The change IS the tests. Meta-verification: the Phase 5 break gate
(mutation-style check on the suite itself) plus the owner-sanity test in
Phase 2 guarding against vacuously green isolation assertions.

## Performance Considerations

Sequential files + per-file `npx supabase status` (~1–2 s each) keep the
whole gate under ~30 s — fine for an ad hoc pre-merge gate.

## Migration Notes

None — no schema changes; the local DB is only mutated (and reset) during
the Phase 5 manual gate.

## References

- `context/changes/testing-api-rls-integration/research.md`
- `context/foundation/test-plan.md` §2 #2/#5, §3 Phase 1, §5, §6
- `context/foundation/lessons.md` (default-ACL lesson)
- `supabase/migrations/20260808210821_create_subscriptions.sql`,
  `20260808213726_revoke_subscriptions_default_privileges.sql`

## Progress

### Phase 1: Integration test infrastructure

#### Automated
- [ ] config split, script, helpers, preflight; all gates green

### Phase 2: RLS isolation suite

#### Automated
- [ ] 8 isolation tests green

### Phase 3: ACL regression assertion

#### Automated
- [ ] ACL matrix + relrowsecurity green

### Phase 4: Injection / validation parity

#### Automated
- [ ] 6 parity tests green

### Phase 5: Adversarial gate + docs

#### Automated
- [ ] full suites green post-reset
#### Manual
- [ ] deliberate-break result documented here

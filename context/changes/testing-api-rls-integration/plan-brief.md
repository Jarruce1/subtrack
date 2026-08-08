# API & RLS Integration Tests — Plan Brief

**Change**: `testing-api-rls-integration` · **Date**: 2026-08-08

## What & why

First integration suite on the REAL local Supabase stack, covering
test-plan risks #2 (IDOR/RLS + ACL lesson) and #5 (injection parity).
Isolation is enforced by the database, so tests go straight at PostgREST
with real user sessions — no Astro server, no mocks.

## Shape

- New Vitest project: `vitest.integration.config.ts` +
  `src/tests/integration/` (excluded from `npm test`; sequential files);
  `npm run test:integration`; NOT in CI (test-plan §5 ad hoc gate).
- Helpers: runtime key discovery (`npx supabase status -o json`), per-run
  `tst-` users via auth signup (confirmations off locally), service-role
  `auth.admin.deleteUser` teardown (FK cascade), `psql` via execSync for
  SQL assertions.
- Suites: preflight (stack diagnostics) · rls-isolation (8: owner sanity,
  B read/update/delete denied at DB, anon 42501, forged user_id on
  insert/update 42501) · table-acl (has_table_privilege matrix — only
  authenticated×DML true; relrowsecurity) · injection-parity (6: script
  tag stored literal, negative amount / bad cycle-interval pair ×2 /
  oversized note / oversized name → 23514).
- Phase 5: deliberate break (weaken `subscriptions_select_own` via psql →
  suite must go red → `db reset` → green), then test-plan §3/§6 + AGENTS.md
  "How we test".

## Risks

- Local-stack coupling: mitigated by diagnostic preflight.
- Vacuous greens: owner-sanity test + break gate.

## Phases

1. Infra (config split, script, helpers, preflight)
2. RLS isolation suite
3. ACL regression assertion
4. Injection parity suite
5. Adversarial gate + docs (test-plan, AGENTS.md)

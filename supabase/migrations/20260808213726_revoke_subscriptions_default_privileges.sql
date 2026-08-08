-- F-01 impl-review fix: strip RLS-exempt default privileges from the API roles.
--
-- The Supabase postgres 17 image's default ACL for tables created by postgres
-- in schema public grants anon/authenticated/service_role the "Dxtm" bits —
-- TRUNCATE, REFERENCES, TRIGGER, MAINTAIN — on every new table. RLS policies
-- only govern SELECT/INSERT/UPDATE/DELETE; TRUNCATE in particular is NOT
-- subject to row-level security, so an API role holding it could wipe the
-- whole table across all users if any SQL path ever exposed the verb
-- (PostgREST exposes none today — this is least-privilege hardening, not a
-- live exploit). None of these four privileges is usable by the app's roles
-- legitimately, so revoke them all.
--
-- Kept as a separate migration (rather than editing 20260808210821) so any
-- environment that already applied the original file converges via db push.

revoke truncate, references, trigger, maintain
  on table public.subscriptions
  from anon, authenticated, service_role;

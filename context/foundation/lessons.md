# Lessons Learned

<!--
Entry format — copy for each new lesson:

## <Short imperative title>
**Context**: <where it happened — task, file, feature>
**Problem**: <what the agent got wrong and how it surfaced>
**Rule**: <the checkable rule that prevents a repeat>
**Applies to**: frame | research | plan | plan-review | implement | impl-review | all

No entries yet.
-->

## supabase-js auth calls return `{ error }` — an un-destructured await is a swallowed failure

**Context**: Phase 3 error-path hardening — `src/pages/api/auth/signout.ts` (`await supabase.auth.signOut();` then unconditional `redirect("/")`); found by the swallowed-error audit, pinned red by `src/tests/integration/error-contracts.test.ts` before the fix.
**Problem**: Every supabase-js call (auth AND PostgREST) resolves — never throws — and reports failure only through the returned `{ error }`. Awaiting without destructuring compiles, lints, and looks done, but drops the failure: here a network/5xx logout failure leaves the session cookie alive (supabase-js returns early without clearing it) while the user sees the signed-out landing page — a fake success on a live credential.
**Rule**: Never discard a supabase-js result object: destructure `{ error }` (or `{ data, error }`) and propagate a non-success response on error. Verify with `grep -rn "await supabase\." src/ | grep -v "= await"` — any bare `await supabase.…` call is a finding. When the failure surfaces in a redirect URL, use a fixed generic message, never `error.message` (no backend detail in URLs — risk #6).
**Applies to**: implement | impl-review

## Workers assets `not_found_handling` swallows SSR routes

**Context**: First production deploy of the Astro SSR app to Cloudflare Workers with static assets.
**Problem**: `"not_found_handling": "404-page"` in wrangler.jsonc made the asset layer answer 404 for `/dashboard` (no matching asset, no 404.html) instead of forwarding the request to the worker — SSR routes silently dead in prod while local preview worked.
**Rule**: With a `main` worker doing SSR, do not set `assets.not_found_handling`; let non-asset requests fall through to the worker. Verify prod routes with `wrangler tail` when a route 404s but works locally.
**Applies to**: implement

## New tables inherit RLS-exempt privileges from the default ACL

**Context**: F-01 `private-subscription-store` — `supabase/migrations/20260808210821_create_subscriptions.sql`; found in impl review via `pg_class.relacl`.
**Problem**: Implement correctly discovered the postgres 17 image grants API roles no DML by default and added an explicit `grant ... to authenticated` — but the same default ACL silently grants `anon`/`authenticated`/`service_role` TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on every new `public` table. RLS governs only SELECT/INSERT/UPDATE/DELETE; TRUNCATE bypasses it, so `authenticated` held a latent whole-table (cross-tenant) wipe privilege that RLS verification never exercises.
**Rule**: Every new-table migration must set the ACL in both directions: grant the intended DML to the intended roles AND `revoke truncate, references, trigger, maintain ... from anon, authenticated, service_role`. Verify with `select relacl from pg_class where relname = '<table>'` that only the intended bits remain — do not stop at policy-level checks.
**Applies to**: plan | implement | impl-review

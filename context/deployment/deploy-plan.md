# Deploy plan — first production deployment

Based on @context/foundation/infrastructure.md (Cloudflare Workers) and
@context/foundation/tech-stack.md. Executed with user consent.

## Preconditions (done)

- [x] `npx wrangler login` (OAuth, account confirmed)
- [x] Worker name `subtrack` in wrangler.jsonc (renamed from starter default)
- [x] Supabase cloud project `kgtbhixlksduoyipnzqw` (eu-central-1), anon key issued
- [x] Local `.env` / `.dev.vars` populated (gitignored)
- [x] GitHub repo pushed; Actions secrets `SUPABASE_URL`, `SUPABASE_KEY` set

## Steps

1. `npm run build` — production build with Cloudflare adapter
2. `npx wrangler deploy` — first deploy (creates the worker, public `*.workers.dev` URL)
3. `npx wrangler secret put SUPABASE_URL` / `SUPABASE_KEY` — production secrets
   (each put creates a new worker version with the secret attached)
4. Verify: fetch `/` (200), `/auth/signin` (200), `/dashboard` redirects to signin
5. Manual smoke later: signup → e-mail confirm → dashboard

## Rollback

`npx wrangler rollback` (works while bindings are unchanged — see risk (d) in
infrastructure.md). Worst case: `npx wrangler delete` removes the worker.

## Out of scope

- CI-driven deploy (GitHub Actions builds and lints only; deploy stays manual
  until quality gates from module 3 exist)
- Custom domain, Cloudflare Access on preview URLs

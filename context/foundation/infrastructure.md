---
project: subtrack
researched_at: 2026-08-08
recommended_platform: Cloudflare Workers (with static assets)
runner_up: Netlify
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 6 (SSR, output "server") + React 19 islands
  runtime: Cloudflare workerd (nodejs_compat), Node 22 toolchain
---

## Recommendation

**Deploy on Cloudflare Workers (with static assets) — not Cloudflare Pages.**

Cloudflare is the only candidate that scores Pass on all five agent-friendly criteria, it is the only platform the project is already wired for (`@astrojs/cloudflare` ^13.5.0 adapter + `wrangler.jsonc` with `main` + `assets` binding = a Workers config), and its free tier (100k requests/day, unlimited static-asset requests) comfortably covers a small-scale hobby app at ~0 zł. The interview answers drove this: cost is the top priority (free tier required), no persistent connections are needed (stateless SSR fits the serverless model), the owner's existing familiarity is Cloudflare, and the data layer is external (Supabase cloud), so co-located services are irrelevant.

**Important correction to `tech-stack.md`**: its hint says `deployment_target: cloudflare-pages`, but the actual configuration targets **Workers**. `@astrojs/cloudflare` v13 dropped Pages support entirely, and Cloudflare recommends Workers for new projects (Pages is GA but feature-frozen). The deploy command for this project is `npx wrangler deploy` — **not** `npx wrangler pages deploy <dir>`, which is the Pages command and will not work with this config.

## Platform Comparison

All research checked 2026-08-08 against live pricing/docs pages.

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass | 5 Pass |
| Netlify | Partial | Pass | Pass | Pass | Pass | 4 Pass, 1 Partial |
| Vercel | Pass | Pass | Pass | Pass | Partial (Beta) | 4 Pass, 1 Partial |
| Render | Partial | Pass | Partial | Partial | Pass (GA) | 2 Pass, 3 Partial |
| Railway | Partial | Pass | Partial | Partial | Pass | 2 Pass, 3 Partial |
| Fly.io | Pass | Pass | Pass | Partial | Pass | 4 Pass, 1 Partial* |

Score notes:

- **Cloudflare** — `wrangler` covers deploy, rollback, secrets, log tail non-interactively; docs publish `llms.txt` + markdown page variants; `wrangler deploy` / `wrangler rollback` / `wrangler versions` are GA; remote MCP servers for Docs, Workers Bindings, Workers Builds, Observability. Free: 100k req/day, 10ms CPU/invocation, 3MB gzip bundle; static asset requests free and unlimited.
- **Netlify** — Partial on CLI: no CLI rollback (dashboard one-click "publish previous deploy" only). Free tier is credit-based for accounts after Sept 2025 (300 credits/mo; a production deploy costs 15 credits, ~20 deploys/mo before eating bandwidth budget; site pauses at zero credits). Strong, actively maintained MCP; free PR previews (zero credits); no commercial-use restriction.
- **Vercel** — Strong CLI incl. `vercel rollback` (Hobby: previous deploy only); good free compute (1M invocations, 100 GB). MCP is Beta since Aug 2025 and stagnant. Hobby tier is **non-commercial use only** — a hard blocker if SubTrack ever monetizes.
- **Render** — Only true free-tier PaaS of the container trio (750 instance-hrs/mo, no card), but: 15-min idle spin-down with ~30-60s cold starts, preview environments paid-only ($25/mo Pro), rollback dashboard-only, limited env-var CLI. MCP is GA (Aug 2025).
- **Railway** — Best DX of the container trio but no permanent free tier ($5 one-time trial credit, then $1/mo credit — won't run an always-on app). Rollback dashboard-only. Official MCP in CLI.
- **Fly.io** — *Effectively eliminated by the cost weight: free allowances removed for new signups (Oct 2024+), credit card required, ~$2-5/mo minimum. No native rollback (redeploy a prior image by digest).

Soft weights applied: Q2 "minimize cost" heavily penalizes Fly.io and Railway; Q3 "familiar with Cloudflare" breaks the top tie in Cloudflare's favor; Q4 "single region fine" neutralizes edge as a differentiator (it remains a free bonus); Q5 "external providers fine" removes co-location (Railway/Render's main draw) from scoring.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Only 5/5 on the criteria; zero migration cost (adapter + wrangler.jsonc already in repo, matching the owner's familiarity); the most generous relevant free tier (100k req/day, unlimited free static-asset requests — most of an Astro site's traffic); full CLI operational loop (`wrangler deploy` / `rollback` / `tail` / `secret put`); GA preview URLs (`wrangler versions upload`) plus optional Workers Builds git integration with automatic PR preview comments (GA, 3,000 build-min/mo free); rich MCP surface.

#### 2. Netlify

Best alternative if the workerd runtime ever becomes a fight: full Node runtime, day-one Astro 6 adapter support, free PR previews, actively maintained MCP, docs as llms.txt + `.md` URLs, no commercial-use restriction. Gap vs. Cloudflare: no CLI rollback, and the credit-based free tier meters production deploys (15 credits each) and pauses the site at exhaustion.

#### 3. Vercel

Strongest raw free compute (1M invocations, 100 GB transfer, 6,000 build-min) and true CLI rollback. Gap: Hobby tier is non-commercial only (blocks future monetization without a $20/mo jump), MCP stuck in Beta, and switching would — like Netlify — require swapping the adapter and abandoning working config for no functional gain.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **10ms CPU per invocation on the free plan.** Astro SSR that server-renders React 19 islands does real CPU work; a heavy page (long subscription list + renewal math + hydration payload serialization) can blow the 10ms budget and throw error 1102 in production while working fine in dev. The paid escape hatch is $5/mo — cheap, but it breaks the 0 zł constraint.
2. **3MB gzip server-bundle limit (free).** `astro` + `react-dom/server` + `@supabase/supabase-js` + `@supabase/ssr` already form a non-trivial bundle; a few careless dependency additions can hit the wall, and the failure appears only at deploy time.
3. **workerd is not Node.** `nodejs_compat` covers most of `@supabase/supabase-js`, but any future dependency assuming full Node APIs (fs, native addons, long-lived sockets) fails at runtime. Every dependency decision inherits a "does it run in workerd?" check.
4. **Stale-docs trap is already in this repo.** `tech-stack.md` says `cloudflare-pages`; most tutorials in training data and on the web describe the Pages workflow (`wrangler pages deploy`, Pages dashboard, `platformProxy`, `Astro.locals.runtime`). Adapter v13 removed all of that. Following old docs produces confidently wrong commands.
5. **Rollback has a sharp edge.** `wrangler rollback` is blocked if bindings were deleted or modified between versions — exactly the situation after a config refactor, i.e., when you most want a rollback.

### Pre-Mortem — How This Could Fail

Six months in, the project is a mess. The developer trusted the `cloudflare-pages` hint and spent a weekend on Pages tutorials before discovering adapter v13 doesn't support Pages at all. Once on Workers, dev worked flawlessly — adapter v13 runs `astro dev` in workerd, so runtime parity felt guaranteed — but production intermittently threw 1102 errors: the dashboard page rendering ninety subscriptions crossed the 10ms free-tier CPU limit under real latency to Supabase-serialized data, something no local test surfaced. Meanwhile the Supabase free-tier project auto-paused after a week of inactivity; the developer burned an evening debugging "Cloudflare" before noticing the database was asleep. A preview URL on workers.dev — public by default — was shared in the course Slack with seeded personal data. When a bad deploy shipped, `wrangler rollback` refused to run because the ASSETS binding had been renamed the day before, and both CI (GitHub Actions) and Workers Builds were deploying on merge, so every push produced two racing deployments. Each assumption was small; unexamined, they compounded.

### Unknown Unknowns

- **Adapter v13 changed the local workflow.** `astro dev` *and* `astro preview` now run in workerd via the Cloudflare Vite plugin — `wrangler dev` is unnecessary, and older patterns (`platformProxy`, `Astro.locals.runtime`) are removed. Secrets in dev come from `.dev.vars`, which feeds `astro:env/server`.
- **Preview URLs are public.** `wrangler versions upload` previews and workers.dev subdomains have no auth; gating them requires Cloudflare Access (extra setup). Never seed previews with real personal data.
- **Two deploy paths can race.** The repo already has `.github/workflows/ci.yml`; if Workers Builds git integration is also enabled, both will build on merge. Pick exactly one deploy trigger (recommended: extend GitHub Actions with `cloudflare/wrangler-action`; leave Workers Builds off).
- **The failure that looks like Cloudflare is usually Supabase.** Supabase free-tier projects pause after ~7 days of inactivity — a paused DB manifests as 500s from the Worker. This dependency risk lives outside the platform choice but dominates the hobby-app outage profile.
- **Astro docs are no longer agent-readable as llms.txt.** `docs.astro.build/llms.txt` 404s (removed ~May 2026); Cloudflare's llms.txt remains. Agents should fetch Astro docs pages directly rather than assuming an llms index.
- **`wrangler.jsonc` still names the worker `10x-astro-starter`** — deploying as-is creates a worker with the starter's name; rename to `subtrack` before first deploy (a later rename creates a *new* worker with a new URL).

Product-owner decision after cross-check: **proceed with Cloudflare Workers — risks noted** and carried into the register below. Swapping to Netlify/Vercel would trade known, mitigable limits for adapter migration work and loss of the pre-wired config.

## Operational Story

- **Preview deploys**: On a PR, CI runs `npx wrangler versions upload --preview-alias pr-<n>` (wrangler ≥4.21; project pins ^4.90) → public URL `pr-<n>-subtrack.<account>.workers.dev`; alternative is Workers Builds git integration (GA, 3,000 build-min/mo free, 1 concurrent, auto PR comments) — enable at most one of the two. Preview URLs are workers.dev-only and unprotected unless Cloudflare Access is added; keep real data out.
- **Secrets**: Local dev — `.dev.vars` (gitignored, verified) holding `SUPABASE_URL` / `SUPABASE_KEY`, consumed via `astro:env/server`. Production — Workers secrets via `npx wrangler secret put SUPABASE_URL` and `... SUPABASE_KEY` (write-only after set; readable only by the running Worker). CI — GitHub Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (for deploys), plus `SUPABASE_URL`/`SUPABASE_KEY` already referenced by `ci.yml` for the build step. Rotation: generate new key in Supabase dashboard → `wrangler secret put` again → update GitHub secret → old key revoked in Supabase.
- **Rollback**: `npx wrangler rollback [version-id]` (list with `npx wrangler versions list`); takes seconds, keeps last 100 versions. Caveats: blocked if bindings changed between versions; Supabase schema migrations do **not** roll back with the Worker — treat DB migrations as forward-only (expand/contract).
- **Approval**: Human-only — Cloudflare/Supabase/GitHub account creation, API token creation and rotation, first production deploy, `wrangler secret put` with real values, deleting the worker or database. Agent may do unattended — build, lint, `wrangler versions upload` (preview), `wrangler tail` / log reads, `wrangler versions list`, drafting config changes.
- **Logs**: `npx wrangler tail` (live, read-only; `observability.enabled: true` is already set in wrangler.jsonc, so the dashboard/API also retain logs). CI logs via `gh run view --log`. MCP options: Cloudflare Observability MCP and Workers Builds MCP (remote servers at `*.mcp.cloudflare.com/mcp`).

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| SSR page exceeds 10ms free-tier CPU → 1102 errors in prod only | Devil's advocate | M | H | Prerender static pages, paginate the subscription list, keep renewal math lean; monitor via `wrangler tail`; $5/mo Workers Paid as escape hatch |
| Server bundle exceeds 3MB gzip free limit | Devil's advocate | L | M | Check bundle size in CI on each build; audit new deps; paid tier raises to 10MB |
| Future dependency incompatible with workerd | Devil's advocate | M | M | Adapter v13 runs dev/preview in workerd, so breakage surfaces locally; prefer web-standard libraries; check runtime compat before adding deps |
| Following stale Pages/`platformProxy` docs breaks workflow | Devil's advocate / config audit | H | L | This document + fix `tech-stack.md` hint; canonical commands: `wrangler deploy`, adapter v13 docs only |
| `wrangler rollback` blocked after binding change | Devil's advocate / Pre-mortem | L | H | Don't couple binding renames with feature deploys; fallback: `git revert` + redeploy |
| Supabase free project pauses after ~7 days inactivity → app 500s | Pre-mortem / Unknown unknowns | H | M | Expect it on a hobby cadence; restore from dashboard; optionally a weekly scheduled ping (cron trigger) to keep it warm |
| Public preview URL leaks seeded personal data | Pre-mortem / Unknown unknowns | M | M | Only fake data in previews; add Cloudflare Access if previews ever need real data |
| Double deploys: GitHub Actions + Workers Builds both fire on merge | Unknown unknowns | M | L | Use exactly one trigger — extend existing `ci.yml` with wrangler-action; leave Workers Builds disabled |
| Worker deployed under starter name `10x-astro-starter` | Unknown unknowns | H | L | Rename `name` to `subtrack` in wrangler.jsonc before first deploy |
| wrangler v4 → v5 major upgrade breaks CI deploy | Research finding (fast-moving toolchain) | M | M | Pin wrangler via package.json (already ^4.90); upgrade deliberately, re-verify deploy in preview first |

## Getting Started

Validated against the pinned versions: astro ^6.3.1, @astrojs/cloudflare ^13.5.0, wrangler ^4.90.0, Node 22. Adapter v13 already gives `astro dev`/`astro preview` workerd runtime fidelity — no `wrangler dev` step needed.

1. **Rename the worker**: in `wrangler.jsonc`, change `"name": "10x-astro-starter"` → `"subtrack"` (do this before the first deploy; the name becomes the workers.dev URL).
2. **Create the Supabase cloud project** (region: EU, e.g. Frankfurt), grab URL + publishable/anon key, put them in `.dev.vars` locally; verify `npm run dev` talks to it.
3. **Authenticate Cloudflare**: `npx wrangler login` (or create a scoped API token — see Approval section — and export `CLOUDFLARE_API_TOKEN`).
4. **Set production secrets**: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`.
5. **First deploy**: `npm run build && npx wrangler deploy` → note the `subtrack.<account>.workers.dev` URL. Rollback if needed: `npx wrangler rollback`.
6. **Wire CI deploys** (when ready — CI/CD config itself is out of scope here): push repo to GitHub, add `CLOUDFLARE_API_TOKEN` (scope: Workers Scripts:Edit on this account only) + `CLOUDFLARE_ACCOUNT_ID` to GitHub Actions secrets, extend `ci.yml` with `cloudflare/wrangler-action` (`command: deploy` on main, `command: versions upload --preview-alias pr-<n>` on PRs).

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)

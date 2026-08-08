# Repository Guidelines

SubTrack — a subscription cost & renewal tracker (product scope: @context/foundation/prd.md). Astro 6 SSR app with React 19 islands, Tailwind 4, Supabase auth, and shadcn/ui, deployed to Cloudflare Workers. Stack rationale: @context/foundation/tech-stack.md.

## Hard rules

- Every new Supabase table must have RLS enabled with granular per-operation, per-role policies. This enforces the PRD's privacy guardrail (one user's data never visible to another).
- Renewal-date and cost-normalization arithmetic must handle month-end (start on the 31st) and leap-year cases per the PRD's acceptance criteria; silently wrong totals are the top product risk.
- `SUPABASE_URL` / `SUPABASE_KEY` are server-only secrets (`astro:env/server`, schema in @astro.config.mjs). Never import them into client code. Local values go in `.env` (Node) or `.dev.vars` (Cloudflare dev, gitignored).
- Merge Tailwind classes with `cn()` from `@/lib/utils`; do not concatenate class strings manually.
- No Next.js directives (`"use client"` etc.) in React components.

## Commands

- `npm run dev` / `npm run build` / `npm run preview` (scripts: @package.json)
- `npm run lint` / `npm run lint:fix` — type-checked ESLint (`strictTypeChecked` + `stylisticTypeChecked`); `no-console` warns, unused vars must be `_`-prefixed (@eslint.config.js)
- `npx supabase start` — local Supabase (requires Docker); `npx wrangler deploy` — deploy
- Node 22.14.0 (@.nvmrc). Pre-commit: lefthook (@lefthook.yml — `eslint --fix` + `vitest related` on staged files). CI (@.github/workflows/ci.yml) runs `astro sync` + lint + test + build on push/PR to `main`; build needs `SUPABASE_URL`/`SUPABASE_KEY` repo secrets.

## How we test

Full strategy, risk map, and cookbook: @context/foundation/test-plan.md — read it before writing any new test.

- **Unit** (`npm test`, ~71 tests): pure logic and zod schemas, colocated as `src/lib/**/*.test.ts`. Runs in CI and via lefthook's `vitest related` pre-commit. Oracles are hand-derived from the PRD, never from the implementation.
- **Integration** (`npm run test:integration`, `src/tests/integration/`, own config @vitest.integration.config.ts): RLS isolation, table ACL, and DB-constraint parity against the REAL local Supabase stack (`npx supabase start` first). We never mock the database for RLS. Deliberately NOT in CI (Docker dependency) — it is the mandatory local gate before merging any migration or API-route change, and every new table needs its isolation + ACL + CHECK-parity probes (test-plan §6.2/§6.4).
- **E2E / secret scan**: not built yet — test-plan §3 Phases 2–4.

## Structure & conventions

- Path alias `@/*` → `./src/*` (@tsconfig.json).
- Astro components (`.astro`) for static content and layout; React components only where client interactivity is needed.
- shadcn/ui primitives live in `src/components/ui/` ("new-york" variant, @components.json); add new ones with `npx shadcn@latest add [name]`, don't hand-write them.
- React hooks go in `src/components/hooks/`; services/business logic in `src/lib/` (extracted services in `src/lib/services/`); shared types (entities, DTOs) in `src/types.ts`.
- API routes in `src/pages/api/` validate input with zod (not yet a dependency — install it with the first validated route).
- Auth: @src/middleware.ts resolves the session into `context.locals.user` and gates paths listed in its `PROTECTED_ROUTES`; add new protected pages there. The Supabase SSR client factory @src/lib/supabase.ts returns `null` when env vars are missing — callers must handle that.
- Supabase migrations: `supabase/migrations/`, named `YYYYMMDDHHmmss_short_description.sql`.
- `src/db/database.types.ts` is generated against the local schema (`npx supabase gen types typescript --db-url "postgresql://postgres:postgres@127.0.0.1:54322/postgres" --schema public` — the `--local` flag is broken in CLI 2.113.0 — then `npx prettier --write` it), committed, and regenerated manually after every migration; app code imports domain types from `src/types.ts`, never from the generated file.

## Commits & process

- Conventional Commits prefixes as seen in history (`chore:`, `docs:`, `feat:`, `fix:`).
- Record recurring agent mistakes in @context/foundation/lessons.md; check it before starting frame/plan/implement work.

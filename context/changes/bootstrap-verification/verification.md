---
bootstrapped_at: 2026-08-08T18:03:05Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: subtrack
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

## Hand-off

Verbatim frontmatter from `context/foundation/tech-stack.md`:

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: subtrack
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

Why this stack (from hand-off body): A solo developer shipping SubTrack — a
subscription tracker with e-mail/password auth and per-user data isolation — in
3 weeks of after-hours work needs a battle-tested, agent-friendly starter with
auth, database, and deploy solved out of the box. 10x Astro Starter (Astro 6 +
React 19 + TypeScript + Tailwind 4 + Supabase + Cloudflare) is the recommended
default for (web, js) and matches the owner's stated prior of Astro +
Cloudflare + Supabase exactly: Supabase Auth covers FR-001–003 e-mail/password
flows, and Supabase row-level security enforces the PRD's hard privacy
guardrail that one user's data is never visible to another. The stack clears
all four agent-friendly gates (typed, convention-based, popular in training,
well documented). Bootstrapper confidence is first-class — registered with a
valid CLI, expect mostly-smooth scaffolding. Payments, realtime, AI, and
background jobs are out of scope per the PRD; renewal math is pure per-user
arithmetic well served by typed domain functions. Deploys to Cloudflare Pages
(starter default) with GitHub Actions auto-deploy-on-merge.

## Pre-scaffold verification

| Signal      | Value                                                          | Severity | Notes                                                              |
| ----------- | -------------------------------------------------------------- | -------- | ------------------------------------------------------------------ |
| npm package | not run                                                        | n/a      | cmd_template starts with `git clone` — no create-* CLI to resolve  |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-05-17      | fresh    | from card.docs_url; `gh` unauthenticated, fell back to GitHub REST |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone
**Exit code**: 0
**Files moved**: 19 top-level entries (`.github/`, `.husky/`, `.vscode/`, `node_modules/`, `public/`, `src/`, `supabase/`, `.env.example`, `.gitignore`, `.nvmrc`, `.prettierrc.json`, `astro.config.mjs`, `components.json`, `eslint.config.js`, `package-lock.json`, `package.json`, `README.md`, `tsconfig.json`, `wrangler.jsonc`)
**Conflicts (.scaffold siblings)**: `CLAUDE.md.scaffold` (cwd `CLAUDE.md` preserved)
**.gitignore handling**: moved silently (absent in cwd)
**.bootstrap-scaffold cleanup**: deleted (`.bootstrap-scaffold/.git/` removed before move-up so upstream starter history does not leak; cwd `.git/` untouched)

Notes:
- `context/` preserved verbatim — the scaffold shipped no `context/` paths, and the conflict policy protects it regardless.
- `npm install` ran as part of the starter's own cmd_template (773 packages). Local npm `allowScripts` policy held back postinstall scripts for `esbuild`, `fsevents`, `sharp`, `supabase`, `workerd` — build succeeded regardless; approve via `npm approve-scripts` if a tool later misbehaves.
- `.env.example` ships with placeholders (`SUPABASE_URL=###`, `SUPABASE_KEY=###`). No real secrets created; copy to `.env` and fill with your Supabase project values.

## Post-scaffold audit

**Tool**: `npm audit --json` (exit code 1 — informational; non-zero is expected when findings exist)
**Summary**: 1 CRITICAL, 13 HIGH, 7 MODERATE, 2 LOW (23 total; 895 dependencies: 449 prod, 316 dev)
**Direct vs transitive**: 0/1/2/0 direct of total 1/13/7/2 — direct findings: `astro` (HIGH), `supabase` (MODERATE, via tar), `wrangler` (MODERATE, via esbuild)

#### CRITICAL findings

- `tar` <=7.5.20 (transitive, via supabase CLI) — node-tar PAX size-override header parsing differential (file smuggling); process crash via PAX numeric path type confusion. Fix available via `npm audit fix`.

#### HIGH findings

- `astro` <=7.0.9 (DIRECT) — Reflected XSS via unescaped slot name; Host header SSRF in prerendered error page fetch. Fix available (upgrade astro).
- `brace-expansion` (transitive) — DoS via exponential-time expansion. Fix available.
- `devalue` 5.6.3–5.8.0 (transitive) — DoS via sparse array deserialization. Fix available.
- `fast-uri` 3.0.0–3.1.4 (transitive) — host confusion via backslash authority. Fix available.
- `js-yaml` 4.0.0–4.3.0 (transitive) — quadratic-complexity DoS in merge-key handling. Fix available.
- `miniflare` (transitive, via sharp/undici) — inherited. Fix available.
- `nanoid` <=3.3.16 (transitive) — non-secure generators can loop indefinitely. Fix available.
- `postcss` <=8.5.22 (transitive) — path traversal via sourceMappingURL, arbitrary .map file disclosure. Fix available.
- `sharp` <0.35.0 (transitive) — inherited libvips CVEs (CVE-2026-33327/33328/35590/35591). Fix available.
- `svgo` 4.0.0–4.0.1 (transitive) — removeScripts plugin leaves some executable scripts intact. Fix available.
- `undici` 7.0.0–7.28.0 (transitive) — TLS cert validation bypass via SOCKS5 ProxyAgent; HTTP header injection via Set-Cookie percent-decoding. Fix available.
- `vite` 7.0.0–7.3.3 (transitive) — `server.fs.deny` bypass on Windows; launch-editor NTLMv2 hash disclosure. Fix available.
- `ws` 8.0.0–8.20.1 (transitive) — uninitialized memory disclosure; memory-exhaustion DoS. Fix available.

#### MODERATE findings

- `supabase` CLI 1.1.6–2.98.2 (DIRECT, dev) — via vulnerable `tar`. Fix available.
- `wrangler` (DIRECT, dev) — via vulnerable `esbuild`. Fix available.
- `@astrojs/language-server`, `@cloudflare/vite-plugin`, `volar-service-yaml`, `yaml` (stack overflow via deeply nested collections), `yaml-language-server` (all transitive). Fixes available.

#### LOW / INFO findings

- `@babel/core` <=7.29.0 (transitive) — arbitrary file read via sourceMappingURL comment. Fix available.
- `esbuild` 0.27.3–0.28.0 (transitive) — arbitrary file read from dev server on Windows. Fix available.

No auto-fix was applied (bootstrapper informs; the user decides). Most findings
are dev-tooling transitives; the one direct production finding is `astro`
itself — upgrading astro is the highest-value single action.

## Build / lint / type-check verification (extra, run at owner's request)

| Check                        | Command          | Result                                                                    |
| ---------------------------- | ---------------- | ------------------------------------------------------------------------- |
| Production build             | `npm run build`  | PASS (exit 0; Cloudflare adapter, server mode)                            |
| Lint                         | `npm run lint`   | PASS (0 errors after build generated Astro types; 20 pre-sync errors were all missing-generated-types artifacts) |
| Type check                   | `npx astro check`| PASS (28 files, 0 errors, 0 warnings, 4 hints)                            |
| Unit tests                   | —                | Not run — the starter ships no test runner or `test` script               |

Build warnings (non-blocking): sitemap integration skipped (no `site` set in
`astro.config.mjs`); one Tailwind content-scan CSS warning from a non-class
token in repo docs.

## Hints recorded but not acted on

| Hint                    | Value              |
| ----------------------- | ------------------ |
| bootstrapper_confidence | first-class        |
| quality_override        | false              |
| path_taken              | standard           |
| self_check_answers      | null               |
| team_size               | solo               |
| deployment_target       | cloudflare-pages   |
| ci_provider             | github-actions     |
| ci_default_flow         | auto-deploy-on-merge |
| has_auth                | true               |
| has_payments            | false              |
| has_realtime            | false              |
| has_ai                  | false              |
| has_background_jobs     | false              |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history. (This cwd already has `.git/` — the cloned starter's history was discarded, yours is untouched.)
- Review `CLAUDE.md.scaffold` (the starter's shipped agent instructions) against the existing `CLAUDE.md` and merge what is useful.
- Copy `.env.example` to `.env` and fill in real Supabase credentials (never commit `.env`).
- Set `site` in `astro.config.mjs` to enable the sitemap integration.
- Address audit findings per your project's risk tolerance — upgrading `astro` clears the only direct production HIGH; `npm audit fix` covers most transitives.

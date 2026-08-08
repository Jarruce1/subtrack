═══════════════════════════════════════════════════════════
  PLAN REVIEW: API & RLS Integration Tests (Test-Plan Phase 1)
  Mode: Deep  |  Date: 2026-08-08
  Findings: 0 critical, 0 warnings, 3 observations
═══════════════════════════════════════════════════════════

  End-State Alignment    PASS ✅  (matches test-plan §2 #2/#5 oracles,
                                   §3 Phase 1 scope, §5 no-CI directive)
  Lean Execution         PASS ✅  (no new deps, no Astro server, no
                                   mocks; PostgREST-direct is the
                                   cheapest layer per research)
  Architectural Fitness  PASS ✅  (suite split keeps unit gate + lefthook
                                   `vitest related` untouched; helpers
                                   follow supabase-js patterns already in
                                   the repo)
  Blind Spots            PASS ✅  (vacuous-green guarded by owner-sanity
                                   test + Phase 5 break gate; anon
                                   asserted at privilege layer, not as
                                   empty result)
  Plan Completeness      PASS ✅  (every phase has automated criteria;
                                   manual gate has a documented oracle)

  Grounding: all referenced paths exist (migrations, service, routes,
  vitest.config.ts, config.toml); relacl and psql availability verified
  live in research; brief↔plan consistent.
  ► Overall: SOUND

═══════════════════════════════════════════════════════════
  OBSERVATIONS 👁
═══════════════════════════════════════════════════════════

  O1 — sql() helper must avoid shell quoting traps
    Impact: 🏃 LOW · Dimension: Blind Spots · Location: Phase 1, helpers
    Detail: SQL text is full of single quotes; `execSync` with string
    interpolation invites quoting bugs.
    Fix: use `execFileSync("psql", [dbUrl, "-tA", "-c", query])` —
    argument array, no shell.

  O2 — hookTimeout, not just testTimeout
    Impact: 🏃 LOW · Dimension: Plan Completeness · Location: Phase 1
    Detail: signups happen in `beforeAll`; Vitest's hook timeout is
    separate from test timeout.
    Fix: set both (`testTimeout: 15000`, `hookTimeout: 30000`).

  O3 — node:child_process types under `astro check`
    Impact: 🏃 LOW · Dimension: Blind Spots · Location: Phase 1
    Detail: repo has no direct `@types/node` devDep; if `astro check`
    can't resolve node types in `src/tests/**`, typecheck fails.
    Fix: verify in Phase 1; add `@types/node` devDependency only if the
    gate actually fails (don't pre-add).

  Also verified (Vitest 4): overriding `exclude` replaces defaults — the
  plan's `[...defaults, "src/tests/integration/**"]` via `configDefaults`
  is the correct form.

═══════════════════════════════════════════════════════════
  VERDICT: SOUND — proceed to /10x-implement phase 1
═══════════════════════════════════════════════════════════

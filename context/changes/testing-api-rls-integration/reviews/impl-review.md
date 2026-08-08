<!-- IMPL-REVIEW-REPORT -->

═══════════════════════════════════════════════════════════
  IMPLEMENTATION REVIEW: testing-api-rls-integration
  Scope: full plan (phases 1–5)  |  Date: 2026-08-09
  Findings: 0 critical, 3 warnings (all fixed), 8 observations
  (5 fixed, 3 accepted)
═══════════════════════════════════════════════════════════

  Plan drift          PASS ✅  10/10 planned changes MATCH; no skipped
                              items; "What We're NOT Doing" fully
                              respected (migrations, dashboard/form/API
                              files, CI, deps all untouched — verified
                              via git diff over the 5 phase commits)
  Safety & security   PASS ✅  (after fixes) no secrets, shell-free
                              psql, locality now hard-guarded
  Reliability         PASS ✅  (after fixes) exec timeouts, retryable
                              teardown; no order-dependent false greens
                              found in the shared-row design
  Test quality        PASS ✅  oracles are independent facts (Postgres
                              error codes, migration DDL constraint
                              names, lessons.md ACL rule); vacuous-green
                              guards verified; break gate proved the
                              suite can fail (2 reds under weakened
                              policy, green after db reset)
  Success criteria    PASS ✅  all Progress checkboxes ticked; gates
                              green post-fix: 22 integration + 71 unit,
                              lint 0, astro check 0, build ok

  ► Verdict: PASS (all warnings resolved in the same session)

───────────────────────────────────────────────────────────
  TRIAGE LOG
───────────────────────────────────────────────────────────

  W1 (helpers.ts, security) — no locality guard: sql() runs as the
      postgres superuser against whatever `supabase status` returns;
      the only host check was a soft preflight assertion.
      → FIXED: assertLocal() inside getStack() — throws unless API_URL
      and DB_URL hosts are 127.0.0.1/localhost/[::1]; every consumer
      inherits the guard.

  W2 (helpers.ts, reliability) — execFileSync calls had no timeout;
      sync child blocks the worker, so Vitest timeouts can't fire →
      a wedged Docker/psql hangs the run indefinitely.
      → FIXED: timeout 15 s (supabase status) / 10 s (psql) +
      PGCONNECT_TIMEOUT=5.

  W3 (injection-parity, coverage) — only 3 of 5 named CHECKs probed;
      this suite is the §6.2 reference others will copy.
      → FIXED: added whitespace-only name (lower bound), lowercase
      currency, out-of-range interval (121) probes — parity suite now
      covers all 5 constraints (9 tests), integration total 22.

  O1 (preflight comment) — claimed "fails first"; Vitest orders files
      by size/cache, not name. → FIXED: comment reworded; getStack()'s
      loud failure is the real guard.
  O2 (rls-isolation) — forgery re-read asserted B owns zero rows
      table-wide; future legitimate B-inserts would false-red it.
      → FIXED: scoped to the probe's name.
  O3 (cleanup) — pop-before-delete dropped failed ids from state.
      → FIXED: snapshot iteration, remove only on success.
  O4 (table-acl) — literal-only interpolation invariant undocumented.
      → FIXED: invariant comment added.
  O5 (stale "~16 tests" comment in integration config) → FIXED.

  Accepted (no change):
  A1 execFileSync instead of planned execSync — safer (no shell),
     recorded in plan-review O1; benign drift.
  A2 validSubscription() helper beyond the Phase 1 contract — additive,
     documented in test-plan §6.2.
  A3 `./helpers` relative import vs unit tests' `@/` alias — helpers is
     test-infra in the same directory, not a src module; relative is
     idiomatic here.

  Post-fix verification: npm run test:integration 22/22, npm test 71/71,
  lint 0 errors, astro check 0 errors, build complete.

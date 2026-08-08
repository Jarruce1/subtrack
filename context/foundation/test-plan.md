# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-08-09

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   that area" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   owner-stated concerns, and codebase *signal* (churn, structure, test
   base). It does NOT claim to know which line owns the failure. That
   knowledge is produced by `/10x-research` during each rollout phase. If
   the plan and research disagree about where the failure lives, research
   is the ground truth.

Hot-spot scope used for likelihood weighting: `src/`,
`supabase/migrations/`, `.github/workflows/` (excluding `dist/`,
`node_modules/`, `.astro/`, lockfiles).

Test-base profile: **sparse** — Vitest configured with ~71 unit tests
(billing arithmetic example + property tests, update-schema validation)
clustered in one library area; zero integration tests against the
database, zero e2e, zero auth-flow coverage. The rollout builds outward
from this island: real-database integration first, then browser e2e, then
gate wiring.

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|--------------------------|--------|------------|--------------------------------|
| 1 | A user sees a silently wrong renewal date or cost total — month-end/leap clamping, rounding, or the active-only aggregation rule drifting apart across dashboard, category, and renewals views as S-04/S-06 land | High | Medium | PRD Guardrails ("totals must never be silently wrong"), US-02; roadmap S-04/S-06 (aggregation rule cuts across views); hot-spot dir `src/lib/` (13 commits/30d); owner-stated concern (partially covered by unit tests) |
| 2 | **Abuse — IDOR/isolation:** a logged-in user reads, modifies, or mass-deletes another account's subscriptions because a new migration or endpoint ships with an RLS/ACL gap | High | Medium | PRD privacy guardrail + Access Control; lessons.md (default ACL granted `authenticated` a TRUNCATE that bypasses RLS); archived F-01 plan (isolation verified only once, manually, via psql); S-03 plan (foreign-id 404s checked only via manual curl) |
| 3 | An API route swallows a failure: a save/edit/delete fails server-side but the response reads as success or a generic error, so the UI shows a subscription as tracked when it is not | Medium | High | Owner-stated concern (known pattern, fix scheduled for a later lesson); hot-spot dirs `src/pages/api/` + `src/lib/` churn; no integration tests exist to catch it (test-base profile) |
| 4 | North-star flow regression: a new user cannot complete signup → add subscription → dashboard, or a gated page stops redirecting unauthenticated visitors | High | Medium | PRD primary success criterion (US-01, FR-001–003); hot-spot dirs `src/components/auth/` (6 commits/30d), `src/pages/api/auth/` (4 commits/30d); zero automated coverage of any auth or browser flow (test-base profile) |
| 5 | **Abuse — untrusted input:** a crafted form payload (name/note/cost/cycle) bypasses server-side validation parity or corrupts stored data and rendered output | Medium | Medium | PRD FR-004 validation rules; AGENTS.md hard rule (zod on every API route); abuse lens — forms are the only user input surface |
| 6 | **Abuse — secret leakage:** a server-only Supabase key or session token escapes into the client bundle, logs, or an error body | High | Low | AGENTS.md hard rule (server-only secrets via `astro:env/server`); abuse lens — auth product with server secrets |
| 7 | Deploy works locally but a route or asset config leaves prod silently broken after a manual `wrangler deploy` | High | Low | lessons.md (prod SSR routes dead via `not_found_handling` while local preview worked); roadmap Baseline (observability absent, deploy manual) |

Risk #7 is primarily an observability/smoke concern, not a test-suite
concern — it is addressed by the post-deploy smoke gate in §5, not by a
dedicated test phase.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | With mixed-cycle fixtures (weekly, monthly, custom-N, yearly, paused/cancelled), every rendered total and renewal date equals a hand-derivable value from PRD Business Logic §1–§4, identically on dashboard, category, and renewals views | "The unit tests already cover arithmetic" — they cover the pure functions, not the aggregation rule applied consistently across views and statuses | Where each view derives its totals; whether views share one aggregation path or re-implement it; how status filtering enters the query | unit for new arithmetic; e2e assertion on rendered numbers for cross-view consistency | Oracle copied from the implementation — expected values must come from the PRD formulas, computed by hand in the test |
| #2 | With two real accounts on a real database, account B's requests to read/update/delete account A's rows return not-found/denied and change nothing; table ACL holds no RLS-exempt privileges (TRUNCATE etc.) for API roles | "RLS is on, so isolation holds" — the lessons.md burn proves privileges outside RLS's scope can still cross tenants; also "401 handling implies ownership checks" | How sessions are minted for two test users; which roles/claims the policies key on; the ACL verification query; how the API surfaces foreign-id access | integration against local Supabase (real RLS), plus a SQL ACL assertion per table | Mocking the database client — a mocked client proves nothing about RLS; must run against real Postgres |
| #3 | Forcing a database/backend failure during create/update/delete yields a non-2xx response with a usable error body, and the UI does not report success | "Final status 200 means the operation happened"; "an empty result means not-found" | The error translation path from service to route to UI; which failures are currently caught-and-dropped; what contract the fix (scheduled lesson) will define | integration on API routes with induced failures | Happy-path-only suite; asserting the current (swallowing) behavior as the expected contract |
| #4 | A browser completes signup with a fresh unique e-mail, adds a subscription, and lands on a dashboard showing the correct normalized cost and renewal date; an unauthenticated visit to a gated page redirects to sign-in | "Auth worked in prod so far" — no test has ever exercised it; also "middleware gating covers new pages automatically" | The real signup flow (e-mail confirmation on/off locally), session cookie shape, the gated-route list mechanism, test-user cleanup strategy | e2e (Playwright), one signup flow + one gating check | Selector-brittle tests (CSS/XPath), `waitForTimeout`, shared test users colliding between runs |
| #5 | Malicious/edge payloads (oversized note, non-ISO dates, negative amounts, script tags in name, forged cycle/interval pairs) are rejected server-side with 4xx regardless of client-side validation, and accepted names render inert | "The client form already validates"; "React/Astro escaping makes stored XSS impossible everywhere" | Which schemas gate each route; any render surface that bypasses default escaping; DB CHECK constraints as the second net | unit on schemas (extend existing suite) + a few integration probes through real routes | Testing the schema in isolation only — parity means the deployed route rejects it, not just the zod object |
| #6 | The built client bundle contains no server secret values; error responses and logs contain no keys or tokens | "`astro:env/server` makes leakage impossible" — a refactor or logging line can still leak values into bodies or the bundle | Build output location; what the server logs on failures; which error bodies reach the client | build-output scan (deterministic grep in CI) + assertions on error bodies in the #3 integration tests | A one-off manual check — this only stays true if it runs on every build |
| #7 | After a deploy, the production URL serves the signin page, a gated route redirects, and an authenticated API answers | "It worked in local preview" — the recorded burn is precisely local-pass/prod-dead | (none — smoke script, not a test; kept out of rollout phases) | manual post-deploy smoke checklist, scriptable later | Building an e2e suite against prod — too slow/fragile; three curl-level checks give the signal |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|----------------|------------|--------|----------------|
| 1 | API & RLS integration | Prove two-account isolation and honest API error/validation contracts on a real local database | #2, #5 (#3 → Phase 3) | integration (local Supabase), SQL ACL assertions | done | `context/changes/testing-api-rls-integration/` |
| 2 | E2E critical flow | Prove signup → add → dashboard works in a real browser and shows hand-verifiable numbers | #4, #1 | e2e (Playwright) | done | `context/changes/e2e-critical-flow/` |
| 3 | Error-path & secret hardening | Pin the swallowed-error fix with failing-first tests and make secret leakage mechanically checkable | #3, #6 | integration (induced failures), build-output scan | done | `context/changes/error-path-hardening/` |
| 4 | Quality-gates wiring | Lock the floor: e2e in CI, secret scan in CI, post-deploy smoke checklist | cross-cutting, #7 | gates, manual smoke script | done | — (wired directly: ci.yml, `scripts/post-deploy-smoke.sh`) |

Phase 3 is intentionally sequenced to land with (or immediately after) the
upcoming error-handling fix: its tests define the error contract
failing-first, so the fix cannot regress silently. Phase ordering follows
cost × signal: the database-level abuse risks (#2) are both the highest
combined risk and cheaper to test than browser flows.

## 4. Stack

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + property | Vitest + fast-check | 4.1 / 4.9 | Exists: ~71 tests; `vitest run` only (bare `vitest` hangs in watch mode); `AI_AGENT=1` forces the agent reporter |
| validation schemas | zod | 4.4 | Schemas already unit-tested; Phase 1 extends with abuse payloads |
| integration (DB/API) | supabase CLI + Docker (local stack) | 2.23 | none yet — see Phase 1; real Postgres + RLS, two seeded users via local auth API (pattern proven manually in the F-01 archive) |
| e2e | Playwright (Chromium) | 1.62 | Exists: 4 tests + auth setup in `e2e/` (`npm run test:e2e`, local stack required — see §6.3); generation governed by the `/10x-e2e` skill (CLAUDE.md): role-based locators, no `waitForTimeout`, independent tests with unique ids, `seed.spec.ts` exemplar |
| secret scan | deterministic grep over build output | n/a | Exists: `npm run scan:secrets` (build + `scripts/scan-secrets.mjs` over `dist/client/**`; exit 2 on hit, needle names only — never values); CI runs `scan:secrets:dist` against the `ci` job's build |
| (optional) AI-native | `/10x-e2e` review loop; vision caps only for visual-only risks — checked: 2026-08-08 | n/a | DOM snapshot is the default; do not use vision where a deterministic assertion exists |

**Stack grounding tools (current session):**
- Docs: none — no Context7/framework-docs MCP exposed; recommendations grounded in local manifests, `vitest.config.ts`, `lefthook.yml`, CI workflow, and the S-02 research notes (version-pinned findings); checked: 2026-08-08
- Search: web search available but not used — local evidence was sufficient and version-specific gotchas were already recorded in the S-02 archive; checked: 2026-08-08
- Runtime/browser: `claude-in-chrome` skill available as a manual verification aid; Playwright MCP not exposed — Phase 2 uses plain Playwright, not an MCP; checked: 2026-08-08
- Provider/platform: Atlassian Rovo MCP (Jira/Confluence) — no quality-gate relevance for this repo; not used; checked: 2026-08-08

Role of AI in testing: AI generates and maintains tests under the
cookbook's rules (below) and the `/10x-e2e` anti-pattern review; the
oracle for every assertion comes from the PRD or a hand-derived value,
never from the implementation under test. AI-native layers (vision
review, healers) are admitted only where deterministic checks have no
signal — currently nowhere in this product.

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck (type-checked ESLint, `astro sync`) | local pre-commit (lefthook, staged files) + CI | required (wired) | type drift, convention breaks |
| unit — related tests on staged files | local pre-commit (lefthook `vitest related`) | required (wired) | arithmetic/schema regressions at commit time |
| unit — full suite | CI on push/PR to `main` | required (wired) | anything the related-run missed |
| integration — RLS isolation + API contracts | local, ad hoc: mandatory before merging any migration or API-route change; not in CI (needs Docker) | required after §3 Phase 1 | cross-account leaks, swallowed failures, validation gaps |
| e2e — critical flows | CI on push/PR (`e2e` job: local Supabase stack + Playwright) and locally pre-push when touching auth/flow surfaces | required (wired) | broken north-star flow, gating regressions |
| secret-leak bundle scan | CI on push/PR (`scan:secrets:dist` after the `ci` job's build) | required (wired) | server secrets in client output |
| post-deploy smoke (3-check list) | `npm run smoke:prod [-- <url>]` manually after `wrangler deploy` (`scripts/post-deploy-smoke.sh`) | recommended (wired: scripted) | local-pass/prod-dead config failures |

No gate is aspirational: every non-wired row is owned by a named rollout
phase. Integration stays out of CI deliberately (solo project, Docker
dependency, low PR volume) — the mandatory-before-merge rule is the
honest equivalent; revisit if the team grows or the rule gets skipped in
practice.

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a unit test (exists today)

- **Location**: next to the module under test, `src/lib/**/<module>.test.ts`
  (property tests: `<module>.properties.test.ts`).
- **Reference tests**: `src/lib/billing.test.ts` (PRD-traceable examples),
  `src/lib/billing.properties.test.ts` (fast-check invariants),
  `src/lib/validation/subscriptions.test.ts` (schema rules).
- **Oracle rule**: expected values are hand-derived from PRD Business
  Logic §1–§5 and cited in a comment — never read from the function under
  test.
- **Run locally**: `npm test` (full) or `npx vitest related <file> --run`.

### 6.2 Adding an integration test (DB/API, two-account isolation)

- **Location**: `src/tests/integration/*.test.ts` — a separate Vitest
  project (`vitest.integration.config.ts`); excluded from `npm test` and
  from lefthook's `vitest related`, sequential files
  (`fileParallelism: false`, one shared local DB).
- **Run locally**: `npx supabase start` once, then
  `npm run test:integration`. NOT in CI (deliberate, §5): mandatory ad
  hoc gate before merging any migration or API-route change.
- **Mocking policy**: **we do not mock the database for RLS** — a mocked
  client proves nothing about isolation. Tests hit PostgREST
  (`http://127.0.0.1:54321`) with real sessions; that is the same
  enforcement path the app uses (the service layer never touches
  `user_id`).
- **Helpers** (`src/tests/integration/helpers.ts`): `createTestUser()`
  (real signup, `tst-…@example.com`, live session — confirmations are off
  locally), `createAnonClient()`, `cleanupTestUsers()` (service-role
  `auth.admin.deleteUser`; FK cascade removes rows — call in `afterAll`),
  `sql()` (psql, for SQL-level oracles), `validSubscription(overrides)`.
- **Oracles, not statuses**: cross-account denial is proven by a 0-rows
  result PLUS a re-read as the owner showing data unchanged; anon denial
  by Postgres `42501` (privilege layer, not an empty list); forged
  `user_id` by `42501` (policy WITH CHECK); CHECK violations by `23514`
  naming the constraint; ACL by the `has_table_privilege` matrix
  (`table-acl.test.ts` — the lessons.md TRUNCATE regression, extend it
  for every new table).
- **Reference tests**: `rls-isolation.test.ts` (two accounts + anon +
  forgery), `table-acl.test.ts` (ACL matrix + `relrowsecurity`),
  `injection-parity.test.ts` (DB CHECKs without zod), `preflight.test.ts`
  (stack diagnostics).
- **Trust check**: the suite was verified to fail under a deliberately
  weakened policy (see the change folder's plan Progress) — if you touch
  policies, re-run that manual break gate.

### 6.3 Adding an e2e test

- **Location**: `e2e/<scenario>.spec.ts` — one scenario per file, name
  bound to the test-plan risk it protects. Run: `npm run test:e2e`
  (all) or `npx playwright test <name>` (one spec). Requires the local
  Supabase stack (`npx supabase start` first) — global setup fails fast
  with a diagnostic when it's down. Runs in CI too (`e2e` job in ci.yml:
  `npx supabase start`, env files pointed at the CI-local stack, then
  `npm run test:e2e`).
- **Pattern**: model every new test on `e2e/seed.spec.ts` — role/label
  locators, one setup → action → assert → cleanup cycle per test, state
  waits only (`waitForURL` / `toBeVisible` / `toHaveCount`), unique
  `Date.now()` ids. The hard rules live in CLAUDE.md (`/10x-e2e`).
- **Auth (storageState)**: the `setup` project (`e2e/auth.setup.ts`)
  signs up one fresh `e2e-*` user per run through the real UI and saves
  `playwright/.auth/user.json`; the `chromium` project consumes it via
  `storageState` — tests never log in through the UI. Tests asserting
  EXACT per-user sums create a private user instead: API signup with an
  `origin` header (Astro CSRF `checkOrigin` 403s form posts without
  one), or UI signup only when signup itself is the flow under test.
- **Env & server**: `.dev.vars`/`.env` point at the CLOUD project, and
  the Cloudflare adapter reads `.dev.vars` over process env — so
  `e2e/support/global-setup.ts` swaps both files to local-stack values,
  boots `astro dev --port 4406` itself (Playwright starts a `webServer:`
  block BEFORE globalSetup, which would boot it with cloud env), and
  `global-teardown.ts` kills the server and restores the files
  byte-identically. A hard-killed run leaves `*.e2e-backup` files —
  restore manually; backups are never overwritten.
- **Data policy**: users are `e2e-`-prefixed and stay in local auth
  (`npx supabase db reset` clears them); subscription rows are cleaned
  per test (`afterEach` via the API, or the UI delete when deletion is
  part of the flow). Unique ids make crash leftovers collision-free.
- **Oracle rule**: expected values are hand-derived from PRD Business
  Logic §1–§4 as in-test constants/helpers with the derivation in a
  comment — never imported from `src/lib/billing.ts`.
- **Trust check**: the suite demonstrably fails when protected behavior
  is inverted (see the change folder's Progress: `normalizeCost` ×2 →
  north-star red; paused included in `summarizeActive` → cross-view
  red). Re-run that break gate when touching billing/aggregation.
- **Gotcha**: React islands hydrate after load — call
  `waitForIslands(page)` (`e2e/support/hydration.ts`) before filling
  forms or clicking island buttons, or controlled inputs lose the fill.

### 6.4 Adding a test for a new API endpoint

- **Data-layer risks first** (isolation, constraints): test them at
  PostgREST per §6.2 — an endpoint adds nothing to what RLS enforces, so
  don't spin up the Astro server to prove database facts.
- Every new table an endpoint touches gets: a two-account isolation
  probe + an ACL-matrix assertion (extend `table-acl.test.ts`) + parity
  probes for its CHECK constraints.
- **Route-level contracts** (status codes, error bodies, induced
  failures): pin them with the induced-failure pattern from
  `src/tests/integration/error-contracts.test.ts` (§3 Phase 3). Astro API
  routes are plain functions of `APIContext` — import the handler and
  invoke it with a minimal context stand-in. Every route reaches Supabase
  through the single `@/lib/supabase` seam, so `vi.mock("@/lib/supabase")`
  plus a chainable/thenable stub (any `await` on the builder resolves to
  `{ data: null, error }`) induces a deterministic backend failure without
  touching the real stack. **Mocking carve-out**: §6.2's no-mocks rule is
  scoped to proving RLS; these tests target the routes' error-translation
  layer, where a real database cannot be made to fail on demand — the two
  policies are complementary, not contradictory. Oracles to pin for every
  new endpoint: induced failure → non-2xx with a usable `{ error }` body
  that carries no backend detail (risk #6); the 401 `{ error }` shape; the
  PGRST116 → 404 mapping where `.single()` no-rows means not-found; for
  form-post routes, failure → redirect with a short `?error=` CODE from
  `src/lib/auth-errors.ts` (never free text, never a fake success
  redirect) — pages map codes to fixed messages and collapse unknown
  codes to the generic one.

### 6.5 Per-rollout-phase notes

(Filled by each phase's final sub-phase with anything surprising the
phase taught.)

- **Phase 4 (quality-gates wiring)**: the e2e CI job needs NO pre-created
  env files — global-setup's swap handles absent `.env`/`.dev.vars` (writes
  local values, teardown deletes them); CI still creates them from
  `supabase status` as a fail-fast contract check. The stack key match is
  version-coupling, not luck: `npx supabase` resolves the repo-pinned CLI
  devDependency, so the minted demo anon JWT equals the one
  `e2e/support/env.ts` hardcodes — an unpinned setup-cli "latest" could
  mint the new `sb_publishable_…` format and break the swap silently. The
  `e2e` job runs parallel to `ci` (no `needs`): solo project, feedback
  speed beats the marginal cost. The scan step reuses the `ci` job's build
  (`scan:secrets:dist`) and gets the repo secrets in env so the VALUE scan
  is not hollow (the scanner warns when it would be). Smoke oracle: the
  pinned 401 from an unauthenticated API GET doubles as the "API surface
  alive in prod" probe — 404/500 there is exactly the local-pass/prod-dead
  burn. Follow-up landed with the phase: signin/signup/signout redirect
  with short `?error=` codes mapped in `src/lib/auth-errors.ts`; pages
  collapse unknown codes to a generic message (content spoofing dead).
- **Phase 3 (`error-path-hardening`)**: the audit found the JSON API
  already honest — the one real swallow was auth-shaped:
  `await supabase.auth.signOut();` discarded `{ error }`, and supabase-js
  keeps the session cookie alive on network/5xx logout failures, so "/"
  faked a signed-out state (failing-first tests proved it red before the
  fix). Route handlers are directly invokable under Vitest because every
  `astro` import in `src/pages/api/**` is type-only — one mocked seam
  (`@/lib/supabase`) suffices. The scanner's break-gate matters as much as
  the scan: a planted key value, an `sb_secret_` literal, and a
  service-role JWT each had to exit 2 before the clean run counted
  (risk #6 anti-pattern: a check that never fires). `service_role` inside
  a JWT is base64url-encoded — a plain grep misses it; decode the payload.
- **Phase 2 (`e2e-critical-flow`)**: Playwright 1.62 starts `webServer:`
  BEFORE `globalSetup` (verified in the runner source) — an env-file swap
  must own the dev-server lifecycle inside globalSetup itself. Astro's
  CSRF `checkOrigin` 403s form-encoded API posts without an `Origin`
  header. Pre-hydration form fills are silently lost by controlled React
  inputs (wait for `astro-island[ssr]` to detach). Playwright text
  assertions normalize the NBSP `Intl.NumberFormat` emits, so
  `PLN 43.00` with a plain space matches.

## 7. What We Deliberately Don't Test

Exclusions decided at rollout scoping (owner directives in lieu of the
interview). Future contributors should respect these unless the
underlying assumption changes.

- **shadcn/ui primitives** (`src/components/ui/`) — generated via the CLI,
  vendor-maintained patterns; testing them tests the generator.
  Re-evaluate if a primitive is hand-modified.
- **Pixel/visual snapshot tests** — solo project, no design contract to
  defend; layout drift is caught by the e2e flow's functional assertions.
  Re-evaluate if a paying design surface appears.
- **Load/performance testing** — PRD targets small scale and low QPS; the
  2-second dashboard NFR is checked ad hoc, not gated.
- **Supabase Auth internals** — vendor behavior (token refresh, password
  hashing); we test our gating and session use, not their implementation.
- **Coverage thresholds** — no percentage gates; the risk map, not a
  number, decides where tests go.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-08-08
- Stack versions last verified: 2026-08-08
- AI-native tool references last verified: 2026-08-08

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.

# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-08-08

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
| 1 | API & RLS integration | Prove two-account isolation and honest API error/validation contracts on a real local database | #2, #3, #5 | integration (local Supabase), SQL ACL assertions, schema unit extensions | not started | — |
| 2 | E2E critical flow | Prove signup → add → dashboard works in a real browser and shows hand-verifiable numbers | #4, #1 | e2e (Playwright) | not started | — |
| 3 | Error-path & secret hardening | Pin the swallowed-error fix with failing-first tests and make secret leakage mechanically checkable | #3, #6 | integration (induced failures), build-output scan | not started | — |
| 4 | Quality-gates wiring | Lock the floor: e2e in CI, secret scan in CI, post-deploy smoke checklist | cross-cutting, #7 | gates, manual smoke script | not started | — |

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
| e2e | Playwright | n/a | none yet — see Phase 2; generation governed by the `/10x-e2e` skill (CLAUDE.md): role-based locators, no `waitForTimeout`, independent tests with unique ids |
| secret scan | deterministic grep over build output | n/a | none yet — see Phase 3; no AI needed for an exact-string check |
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
| e2e — critical flows | CI on PR (and locally pre-push when touching auth/flow surfaces) | required after §3 Phase 2 | broken north-star flow, gating regressions |
| secret-leak bundle scan | CI on PR | required after §3 Phase 3 | server secrets in client output |
| post-deploy smoke (3-check list) | manually after `wrangler deploy` | recommended after §3 Phase 4 | local-pass/prod-dead config failures |

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

- TBD — see §3 Phase 1 for the cross-account access-denial pattern and
  the per-table ACL assertion.

### 6.3 Adding an e2e test

- TBD — see §3 Phase 2 for the signup → add → dashboard pattern.
  Hard rules already fixed by CLAUDE.md `/10x-e2e`: role/label/text
  locators, no `waitForTimeout`, independent tests with unique-id data
  and cleanup.

### 6.4 Adding a test for a new API endpoint

- TBD — see §3 Phase 1 for the request → response + side-effect pattern
  and §3 Phase 3 for the induced-failure error-contract pattern.

### 6.5 Per-rollout-phase notes

(Filled by each phase's final sub-phase with anything surprising the
phase taught.)

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

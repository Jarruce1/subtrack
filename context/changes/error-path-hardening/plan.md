# Error-Path & Secret Hardening Implementation Plan

## Overview

Test-plan §3 Phase 3 (risks #3 and #6): pin the API error contract with
failing-first induced-failure tests, fix the one real swallowed error the
audit found (sign-out discards `signOut()`'s error and fakes success), and
make secret leakage into the client bundle mechanically checkable with a
deterministic scan (`npm run scan:secrets`).

## Current State Analysis

Full audit: `context/changes/error-path-hardening/research.md`. Summary:

- The JSON API surface is already honest: every Supabase call in
  `src/lib/services/subscriptions.ts` checks `error` and throws; every
  route catch translates to non-2xx `{ error }`
  (`src/pages/api/subscriptions/index.ts:43-49`, `[id].ts:53-62,80-88`,
  `duplicate-check.ts:50-57`); islands report success only on the exact
  success status. **Nothing pins this** — no route-level test exists, so a
  refactor could silently regress it (risk #3's stated likelihood driver).
- **One real swallow**: `src/pages/api/auth/signout.ts:7` discards
  `supabase.auth.signOut()`'s `{ error }` and redirects to `/`
  unconditionally. supabase-js returns early on network/5xx logout
  failures WITHOUT clearing the local session — the cookie stays a live
  credential while the UI shows the signed-out landing page.
- `src/middleware.ts:14-16` ignores `getUser()`'s error but is fail-closed
  (error → treated as unauthenticated → redirect/401). Accepted, documented
  in research; not a fix target.
- Zero `console.*` in `src/`, `e2e/`, scripts. Secrets are
  `astro:env/server` only (`src/lib/supabase.ts:3`,
  `src/lib/config-status.ts:1`). No scan exists to keep this true
  (test-plan §5 gate "secret-leak bundle scan" is unwired).
- Test infra: integration project `vitest.integration.config.ts` includes
  `src/tests/integration/**/*.test.ts`, sequential, excluded from `npm test`
  and from lefthook's `vitest related` (unit config excludes the dir) — a
  temporarily-red failing-first test does not block unrelated commits.
- Build layout: `astro build` (Cloudflare adapter) emits `dist/client/`
  (browser-served assets) and `dist/server/` (worker bundle).

## Desired End State

- Induced-failure tests exist for every subscriptions route
  (POST/PATCH/DELETE/duplicate-check) asserting non-2xx + `{ error }` body
  that leaks no DB detail, and for sign-out asserting failure is surfaced,
  not swallowed. All green after the fix; the sign-out test is
  demonstrably red before it.
- `POST /api/auth/signout` propagates a `signOut()` failure to the user
  (redirect with `?error=`, sibling pattern of signin/signup) and never
  fakes success; dashboard renders the error message.
- `npm run scan:secrets` builds and scans `dist/client/**` for server
  secret values and secret-shaped patterns; exit 0 clean, exit 2 on a hit,
  never prints a secret value. Proven able to detect via a planted canary.
- Test-plan §3 Phase 3 → done, §6.4 route-contract pattern filled, §6.5
  phase note added; lessons.md carries the sign-out swallow rule.

### Key Discoveries:

- `createClient` in `src/lib/supabase.ts` is the single seam between
  routes and Supabase, and the only transitive `astro:env/server` import
  in route modules — `vi.mock("@/lib/supabase")` lets Vitest import and
  invoke the Astro route handlers directly with stub clients (all other
  route imports of `astro` are type-only and erased).
- Test-plan §6.2's "no DB mocks" policy is scoped to RLS proofs ("a mocked
  client proves nothing about isolation"). Route-level error translation is
  the opposite case: risk #3's own guidance prescribes "integration on API
  routes with induced failures", and a real local DB cannot be made to fail
  on demand deterministically. The stub carve-out must be documented in
  §6.4 so the two policies don't read as contradictory.
- supabase-js `GoTrueClient.signOut` ignores only 401/403/404 from the
  logout endpoint (session already dead — sign-out effectively succeeded)
  and returns `{ error }` without clearing local cookies on other failures.
- Auth form-post routes use the redirect-with-`?error=` contract
  (`signin.ts:16`, `signup.ts:16`), not the JSON `{ error }` one — a
  browser form POST must not land on raw JSON.
- lefthook pre-commit runs `vitest related` under the UNIT config, which
  excludes `src/tests/integration/**` — the failing-first commit is safe.

## What We're NOT Doing

- No fix for `src/middleware.ts`'s ignored `getUser()` error — fail-closed
  by design, documented in research.
- No change to the FR-014 duplicate-check fail-open contract in
  `SubscriptionForm.checkDuplicate` — deliberate advisory behavior (US-03).
- No React-island (jsdom) tests — "UI does not report success" is already
  enforced by exact-status checks pinned at the route level and verified in
  the audit; adding a DOM test runner is Phase-4-of-test-plan territory if
  ever.
- No CI wiring of the scan or of integration tests — that is test-plan §3
  Phase 4 (quality-gates wiring).
- No logging framework / observability work; no changes to RLS suites.
- No deploy, no push, no cloud-DB changes.

## Implementation Approach

Failing-first: land the error-contract suite first and record the sign-out
test red (run output in Progress notes). Then the minimal fix (2 files)
turns the suite green. The scan script is pure Node (no new dependency),
deterministic, and value-redacting. Docs close the loop per test-plan §3/§6
and lessons.md format.

## Critical Implementation Details

- **Vitest module isolation**: the error-contract suite mocks
  `@/lib/supabase` with `vi.mock` at file top; per-test behavior is driven
  by `vi.mocked(createClient).mockReturnValue(<stub>)`. The stub query
  builder must be thenable-and-chainable (PostgREST builders are awaited at
  any chain depth): a self-returning object whose `then` resolves to
  `{ data: null, error: { message, code } }` covers insert/update/delete/
  select chains without modeling the real builder.
- **Sign-out error message**: use a fixed generic string, NOT
  `error.message` — the redirect lands in a URL and risk #6 forbids tokens/
  backend detail in URLs, logs, or error bodies. This deliberately diverges
  from signin/signup (which forward Supabase's message) because sign-out
  failures can reference session internals.
- **Scanner redaction**: on a hit the script prints the file path and the
  NAME of the matched needle (`SUPABASE_KEY value`, `sb_secret_ pattern`),
  never the matched text. Exit codes: 0 clean, 1 usage/setup error (no
  `dist/client`), 2 hit.

## Phase 1: Failing-first error-contract tests

### Overview

Pin the route error contract (test-plan §2 risk #3 "must challenge" line:
forced failure → non-2xx with usable error body) for all four subscriptions
handlers and sign-out. The sign-out expectation encodes the DESIRED
contract, so it is red against current code — recorded as evidence.

### Changes Required:

#### 1. Error-contract suite

**File**: `src/tests/integration/error-contracts.test.ts` (new)

**Intent**: Import the five route modules and invoke their handlers with a
minimal `APIContext` stand-in and a mocked `@/lib/supabase` whose client
fails on demand, asserting the error contract each route must keep.

**Contract**: One `vi.mock("@/lib/supabase")` at top; a
`failingDb(error)` helper returning a chainable/thenable stub (see Critical
Implementation Details) and a `redirectContext()` helper reproducing
Astro's `context.redirect` (302 + `Location`). Assertions:

- POST `/api/subscriptions` (valid body, insert fails) → 500, JSON
  `{ error }` non-empty string, body does NOT contain the induced Postgres
  message (details stay server-side).
- PATCH `/api/subscriptions/[id]` (valid id+body, update fails with a
  non-PGRST116 error) → 500 `{ error }`; and PGRST116 → 404
  `{ error: "Not found" }` (pins the not-found mapping honestly, risk #3
  anti-oracle "empty result means not-found" is exactly what PGRST116 is,
  so the distinction matters).
- DELETE `/api/subscriptions/[id]` (delete fails) → 500 `{ error }`.
- GET `/api/subscriptions/duplicate-check?name=x` (select fails) → 500
  `{ error }`.
- All four with `locals.user` unset → 401 `{ error }` (pins the existing
  auth contract shape the fix must stay consistent with).
- POST `/api/auth/signout`, `signOut()` resolves `{ error }` →
  **redirect location is NOT `/`** and carries `error=` (the honest
  contract; RED today), and the location contains no `error.message`
  content (generic message only).
- POST `/api/auth/signout`, `signOut()` resolves `{ error: null }` →
  redirect `/` (pins the success path so the fix can't break it).

### Success Criteria:

#### Automated Verification:

- `npm run test:integration` shows the new suite with exactly the two
  sign-out failure-contract assertions failing (red evidence recorded in
  Progress note) and every other new assertion passing
- `npm test` (unit, 99) untouched and green
- `npm run lint` green

#### Manual Verification:

- Red output pasted/summarized into the Progress note as failing-first
  evidence

---

## Phase 2: Propagate the sign-out failure

### Overview

Minimal fix (2 files): sign-out surfaces failure via the sibling
redirect-with-`?error=` contract; dashboard renders it. Suite goes green.

### Changes Required:

#### 1. Sign-out route checks the result

**File**: `src/pages/api/auth/signout.ts`

**Intent**: Destructure `{ error }` from `signOut()`; on error redirect to
`/dashboard?error=<generic message>` (user is still authenticated — the
middleware lets the dashboard render and the message is visible where the
sign-out button lives); on success keep redirecting to `/`.

**Contract**: `context.redirect("/dashboard?error=" +
encodeURIComponent("Sign out failed. Please try again."))` — fixed generic
string, never `error.message` (see Critical Implementation Details).

#### 2. Dashboard renders the error banner

**File**: `src/pages/dashboard.astro`

**Intent**: Read `Astro.url.searchParams.get("error")` and, when present,
render a `role="alert"` notice above the header (Astro's default escaping
keeps a crafted `?error=` inert).

**Contract**: Presentation-only addition; no data-flow change. Styling
mirrors the existing destructive-alert pattern used by the form islands.

### Success Criteria:

#### Automated Verification:

- `npm run test:integration` fully green (26+ tests incl. new suite)
- `npm run lint`, `npx astro check`, `npm run build`, `npm test` green

#### Manual Verification:

- Mirror check of the audit finding: grep confirms no remaining
  `await supabase.auth.signOut();` without error handling; smoke the
  failure path by rerunning only the sign-out tests

---

## Phase 3: Secret-leak scan of the client bundle

### Overview

Deterministic build-output scan (test-plan §2 risk #6 cheapest layer:
"build-output scan — deterministic grep"). No AI, no new dependency.

### Changes Required:

#### 1. Scanner script

**File**: `scripts/scan-secrets.mjs` (new)

**Intent**: Scan every file under `dist/client/` for (a) the actual VALUES
of `SUPABASE_URL` / `SUPABASE_KEY` collected from `process.env`, `.env`,
and `.dev.vars` (whichever exist; values shorter than 12 chars skipped as
false-positive guards), (b) the pattern `sb_secret_[A-Za-z0-9_-]{10,}`
(new-format Supabase secret keys), (c) the literal `service_role` and any
JWT-shaped token whose decoded payload contains `"role":"service_role"`
(legacy service keys).

**Contract**: Node ≥22 ESM, zero deps (`node:fs`, `node:path`). Exit 0
clean / 1 when `dist/client` is missing (build not run) / 2 on any hit.
Output lists relative file path + needle NAME only — never the matched
value. Also warns (without failing) when no env value could be collected,
so a hollow value-scan can't masquerade as a real one.

#### 2. npm script

**File**: `package.json`

**Intent**: `"scan:secrets": "npm run build && node scripts/scan-secrets.mjs"`
— the gate is build-then-scan in one command, as test-plan §5 expects to
wire into CI in Phase 4.

**Contract**: scripts block only; no dependency changes.

### Success Criteria:

#### Automated Verification:

- `npm run scan:secrets` exits 0 on the real build
- Canary break-gate: planting the real `SUPABASE_KEY` value (and,
  separately, an `sb_secret_…` literal) into a temp file under
  `dist/client/` makes the scanner exit 2 naming the file; removing it
  restores exit 0 (proves the scan can detect — test-plan §2 risk #6
  anti-pattern is a check that never runs/never fires)
- `npm run lint` green (script covered by eslint flat config or ignored)

#### Manual Verification:

- Scanner output on a hit shows needle name, not the secret value

---

## Phase 4: Docs, ledger, and mirror verification

### Overview

Close the loop: test-plan status + cookbook + phase note, lessons entry
for the found-and-fixed swallow, full mirror verification (every source
that showed a problem now shows its absence).

### Changes Required:

#### 1. Test plan updates

**File**: `context/foundation/test-plan.md`

**Intent**: §3 Phase 3 row → `done` + change folder link; §6.4 fill the
"Route-level contracts" TBD with the induced-failure pattern (where the
suite lives, the `@/lib/supabase` mock seam, the stub-vs-RLS-policy
boundary, the error-shape oracles); §6.5 add the Phase 3 note (what the
phase taught); bump `Last updated`.

**Contract**: §1–§5 strategy stays frozen except the §3 Status cell and §5
gate table already anticipating this phase; only §6 cookbook grows.

#### 2. Lessons entry

**File**: `context/foundation/lessons.md`

**Intent**: Append an entry in the file's format for the sign-out swallow:
auth mutations return `{ error }` like every other supabase-js call —
`await client.auth.<op>()` without destructuring is a silent-failure bug;
rule: never discard a supabase-js result object; verify with grep.

**Contract**: Existing entry format (Context/Problem/Rule/Applies to).

#### 3. AGENTS.md secret-scan line

**File**: `AGENTS.md`

**Intent**: Update the "Secret scan: not built yet" bullet in "How we
test" to point at `npm run scan:secrets` (Phase 4 of the test plan still
owns CI wiring).

**Contract**: One-bullet edit.

### Success Criteria:

#### Automated Verification:

- Full gate battery green: `npm run lint`, `npx astro check`,
  `npm run build`, `npm test`, `npm run test:integration`,
  `npm run scan:secrets`
- `npm run test:e2e` 5/5 green (final confidence pass; local stack up)

#### Manual Verification:

- Mirror table complete in Progress note: sign-out swallow (test red →
  green; grep clean), scan (canary fires → real build clean)

---

## Testing Strategy

### Unit Tests:

- None added — no pure-logic change (the scanner is exercised end-to-end
  by its canary break-gate, cheaper and more honest than unit-testing fs
  walking).

### Integration Tests:

- `src/tests/integration/error-contracts.test.ts` as specified in Phase 1;
  runs in the existing sequential integration project. It does NOT need
  the local Supabase stack (mocked seam) but deliberately lives in the
  integration suite: it tests route contracts, which §6.2/§6.4 declare the
  integration layer's job, and keeps `npm test` network-free.

### Manual Testing Steps:

1. Phase 1: run `npm run test:integration`, confirm exactly the sign-out
   failure assertions are red; record output.
2. Phase 3: canary break-gate as described (plant value → exit 2 → remove
   → exit 0).
3. Phase 4: run the full battery + e2e once.

## Performance Considerations

None — the scan walks a small `dist/client` tree once per invocation; the
test suite adds no DB round-trips.

## Migration Notes

None — no schema, no data, no deploy-surface changes.

## References

- Related research: `context/changes/error-path-hardening/research.md`
- Test plan: `context/foundation/test-plan.md` (§2 #3/#6, §3 Phase 3, §6)
- Honest-contract exemplars: `src/pages/api/subscriptions/index.ts:43-49`,
  `src/lib/services/subscriptions.ts:16-78`
- Redirect-with-error exemplar: `src/pages/api/auth/signin.ts:15-17`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Failing-first error-contract tests

#### Automated

- [ ] 1.1 `npm run test:integration` shows the new suite with exactly the two sign-out failure-contract assertions failing and every other new assertion passing
- [ ] 1.2 `npm test` (unit, 99) untouched and green
- [ ] 1.3 `npm run lint` green

#### Manual

- [ ] 1.4 Red output pasted/summarized into the Progress note as failing-first evidence

### Phase 2: Propagate the sign-out failure

#### Automated

- [ ] 2.1 `npm run test:integration` fully green (26+ tests incl. new suite)
- [ ] 2.2 `npm run lint`, `npx astro check`, `npm run build`, `npm test` green

#### Manual

- [ ] 2.3 Mirror check: grep confirms no unhandled `signOut()` remains; sign-out tests rerun green

### Phase 3: Secret-leak scan of the client bundle

#### Automated

- [ ] 3.1 `npm run scan:secrets` exits 0 on the real build
- [ ] 3.2 Canary break-gate: planted secret → exit 2 naming the file; removed → exit 0
- [ ] 3.3 `npm run lint` green

#### Manual

- [ ] 3.4 Scanner hit output shows needle name, not the secret value

### Phase 4: Docs, ledger, and mirror verification

#### Automated

- [ ] 4.1 Full gate battery green: lint, astro check, build, unit, integration, scan:secrets
- [ ] 4.2 `npm run test:e2e` 5/5 green

#### Manual

- [ ] 4.3 Mirror table complete in Progress note

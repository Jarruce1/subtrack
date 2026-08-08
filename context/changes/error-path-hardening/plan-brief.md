# Error-Path & Secret Hardening — Plan Brief

> Full plan: `context/changes/error-path-hardening/plan.md`
> Research: `context/changes/error-path-hardening/research.md`

## What & Why

Test-plan §3 Phase 3 (risks #3 and #6): a save/edit/delete that fails
server-side must never read as success, and no server secret may reach the
client bundle. The audit found the JSON API already honest but unpinned,
and one real swallow: sign-out discards `signOut()`'s error and fakes
success while the session cookie stays alive.

## Starting Point

99 unit + 22 integration + 5 e2e tests exist; none exercise induced route
failures. `src/pages/api/auth/signout.ts:7` ignores its result. No secret
scan exists (test-plan §5 gate unwired). Zero `console.*` in src/e2e.

## Desired End State

Induced-failure tests pin non-2xx + `{ error }` for every subscriptions
route and an honest sign-out failure redirect; `npm run scan:secrets`
deterministically fails (exit 2) if a secret value or secret-shaped
pattern lands in `dist/client/**`; test-plan §3/§6.4/§6.5 and lessons.md
updated.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Failure induction | Mock `@/lib/supabase` seam, invoke route handlers directly | Only deterministic way to force DB failure; §6.2's no-mock rule is scoped to RLS proofs, documented in §6.4 | Research |
| Suite placement | `src/tests/integration/` (integration project) | Route contracts are the integration layer's job; keeps `npm test` network-free | Plan |
| Sign-out failure contract | Redirect `/dashboard?error=<generic>` + dashboard banner | Sibling form-post pattern (signin/signup); raw JSON on a browser form POST would be its own dishonesty | Research |
| Error message content | Fixed generic string, never `error.message` | Risk #6: no backend/session detail in URLs or bodies | Plan |
| Scan scope | `dist/client/**`; values from env/.env/.dev.vars + `sb_secret_`/`service_role`/JWT patterns; exit 2 on hit, redacted output | Deterministic grep is the risk-#6 cheapest layer; printing values would itself leak | Plan |
| Middleware `getUser()` ignored error | Accepted, no fix | Fail-closed (error → treated as unauthenticated), never fakes success | Research |

## Scope

**In scope:** error-contract test suite; sign-out fix (+ dashboard error
banner); `scripts/scan-secrets.mjs` + `scan:secrets` npm script; test-plan
§3/§6.4/§6.5, lessons.md, AGENTS.md doc updates.

**Out of scope:** middleware getUser handling; duplicate-check fail-open
contract; jsdom island tests; CI wiring (test-plan Phase 4); deploy/push/
cloud-DB changes.

## Architecture / Approach

Failing-first: Phase 1 lands the suite with the sign-out expectations red
(evidence recorded); Phase 2 is the 2-file minimal fix that turns it
green; Phase 3 adds the pure-Node scanner with a canary break-gate proving
it can detect; Phase 4 closes docs and runs the full battery + e2e.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Failing-first tests | Route error contract pinned; sign-out swallow proven red | Stub builder must be chainable/thenable |
| 2. Sign-out fix | Honest failure redirect + dashboard banner; suite green | None — 2 files, sibling pattern |
| 3. Secret scan | `npm run scan:secrets`, deterministic, redacted, canary-proven | False positives from short/common values (guarded by min length) |
| 4. Docs & mirror | Test-plan/lessons/AGENTS updates; full battery + e2e 5/5 | None |

**Prerequisites:** local Supabase running (integration/e2e), Node 22.14.
**Estimated effort:** one session, 4 commits (test/fix/chore/docs, pN-tagged).

## Open Risks & Assumptions

- Assumes route modules import no runtime Astro internals beyond types
  (verified for all five routes in research).
- Assumes `dist/client/` remains the browser-asset root under the
  Cloudflare adapter (scanner exits 1 loudly if not).

## Success Criteria (Summary)

- Induced failure on any write path → non-2xx with usable `{ error }`, and
  the sign-out failure is user-visible, never a fake signed-out state.
- A planted secret in the client bundle fails the scan (exit 2); the real
  build passes (exit 0).
- All suites green: lint, astro check, build, 99 unit, integration, e2e 5/5.

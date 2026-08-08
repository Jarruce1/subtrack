<!-- PLAN-REVIEW-REPORT -->

# Plan Review: First Subscription to Dashboard (S-01)

- **Plan**: context/changes/first-subscription-dashboard/plan.md
- **Mode**: Deep
- **Date**: 2026-08-08
- **Verdict**: SOUND (after fixes — initial verdict REVISE-lite: 2 warnings, 3 observations, 0 critical)
- **Findings**: 0 critical, 2 warnings, 3 observations — all FIXED during triage

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS (after F5 fix) |
| Architectural Fitness | PASS (after F3 fix) |
| Blind Spots | WARNING → PASS after F2 fix |
| Plan Completeness | WARNING → PASS after F1/F4 fixes |

## Grounding

9/9 existing paths ✓ (`src/lib/services/subscriptions.ts`, `src/lib/supabase.ts`, `src/types.ts`, `src/middleware.ts`, `src/pages/dashboard.astro`, `src/pages/api/auth/signin.ts`, `src/components/auth/SignInForm.tsx`, `components.json`, `supabase/migrations/20260808210821_create_subscriptions.sql`); 6 new paths correctly absent and marked "(new)" (`src/lib/billing.ts`, `src/lib/format.ts`, `src/lib/validation/`, `src/pages/api/subscriptions/`, `src/pages/subscriptions/`, `src/components/subscriptions/`); symbols ✓ (`PROTECTED_ROUTES` + `startsWith` at `src/middleware.ts:4,18`; zod absent from `package.json` as the plan claims; `billing_interval_months?: number | null` in the generated Insert type — the schema's `null` output is assignable; `output: "server"` at `astro.config.mjs:11` — no `prerender` opt-outs needed); `docs/reference/contract-surfaces.md` absent → surface check skipped; brief↔plan ✓ (phases, decisions, scope match).

Consistency scans: no contradiction (clamping rules in-scope vs S-02 "hardening" is explicitly disambiguated: rules now, proof harness later); no promise gap (Desired End State 1→P1, 2–3→P2, 4–5→P3, 6→all phases); contract flow traced (form island → create schema → `POST /api/subscriptions` 400 shape → field mapping; schema output → `CreateSubscriptionInput` → `createSubscription`; `TypedSupabaseClient` reused as in F-01); Progress↔Phase ✓ (one `## Progress`, phase names match, every Success Criteria bullet numbered — 1.1–1.8, 2.1–2.7, 3.1–3.10 — no checkboxes outside Progress). `lessons.md` priors checked: ACL lesson (no new tables here) and Workers `not_found_handling` (no deploy-config change) — neither triggered; F-01 impl-review F2 handoff (empty-patch guard → S-01 zod layer) is explicitly closed by Phase 2 change #2 — the exact item that review told this plan-review to check for.

Codebase verification of riskiest claims: (1) middleware sets `locals.user` for API routes too, and `"/subscriptions"` does not prefix-match `/api/subscriptions` — the 401-in-endpoint / redirect-for-pages split holds; (2) generated `Insert` type has `status?` and `note?: string | null`, so the zod defaults/normalizations line up; (3) `components.json` aliases match the planned `npx shadcn@latest add` targets; (4) blast radius of the signin-redirect change: only `Topbar.astro`/`Welcome.astro` link to auth routes, nothing reads the redirect target — safe; (5) `amount` is `number` in generated types (PostgREST numeric→JSON number), as the billing contract assumes.

## Findings

### F1 — 400 wire contract pinned to a zod method, not a shape

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 2 — Create endpoint contract
- **Detail**: The 400 body was specified as "zod flattened: fieldErrors + formErrors". zod v4 (what `npm install zod` installs) deprecates `.flatten()` in favor of `z.flattenError()`; more importantly the client form maps these errors, so the JSON shape itself — not a library call — is the contract. Leaving it method-shaped invites client/server drift.
- **Fix**: Pin the exact wire shape `{"errors": {"formErrors": string[], "fieldErrors": {"<field>": string[]}}}` in the endpoint contract and note the v4 helper.
- **Decision**: FIXED

### F2 — All-paused dashboard state unspecified

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 — Dashboard page contract
- **Detail**: The contract covered zero subscriptions (empty state) and the normal case, but not "subscriptions exist, none active": `summarizeActive` returns `[]` while the list is non-empty, leaving the totals block an unspecified gap — risking exactly the zero-filled/confusing report US-01's AC warns against, and this state is reachable in S-01 (the form can create a paused subscription).
- **Fix**: Specify the totals block renders a "No active subscriptions" note when the list is non-empty but no subscription is active; list still renders.
- **Decision**: FIXED

### F3 — Client-safety constraint on the validation module unstated

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — Subscription schemas
- **Detail**: The form island bundles `src/lib/validation/subscriptions.ts`. If that module (now or in S-03) ever imports `astro:env/server` or another server-only module, the client build breaks — an invariant the plan relied on ("client-safe") without stating it as a rule on the module.
- **Fix**: Add the constraint to the module contract: zod + type-only `@/types` imports only; no server-only imports ever.
- **Decision**: FIXED

### F4 — "2-decimal display" vs the PRD's per-currency rounding NFR

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 3 — Formatting helpers
- **Detail**: `formatMoney` was described as "2-decimal display", but `Intl.NumberFormat` with a currency applies that currency's minor-unit digits (0 for JPY). The PRD NFR says "correct rounding to two decimal places **per currency**" — Intl's behavior is the correct reading; the plan's wording could push an implementer to force 2 digits everywhere.
- **Fix**: Reword the contract: Intl's per-currency minor-unit digits are the intended behavior.
- **Decision**: FIXED

### F5 — Dashboard null-client branch is unreachable; don't build UI for it

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Lean Execution
- **Location**: Phase 3 — Dashboard page contract
- **Detail**: `/dashboard` sits behind the middleware gate; an authenticated `locals.user` implies `createClient` succeeded, so the page's `null` branch can never render for a real user. The contract read as if a "not configured" screen should be designed; that's dead UI (Layout's env banner already covers visible messaging).
- **Fix**: Reword: the `null` branch is a type-level guard (AGENTS.md: callers must handle `null`) — one-line notice, stop, no UI investment.
- **Decision**: FIXED

## Triage summary

| Finding | Decision |
|---|---|
| F1 | FIXED — explicit 400 wire shape + zod v4 note in Phase 2 endpoint contract |
| F2 | FIXED — all-paused totals-block rendering specified in Phase 3 dashboard contract |
| F3 | FIXED — client-safety rule added to the schema module contract |
| F4 | FIXED — `formatMoney` contract reworded to Intl per-currency minor units |
| F5 | FIXED — null branch reworded as type-level guard, no UI |

## Verdict

**SOUND** — 0 critical findings; both warnings and all observations fixed in the plan during triage. The two upstream obligations were verified explicitly: the F-01 F2 empty-patch guard has a named home (update schema, Phase 2) and the plan honors the roadmap's S-01/S-02 boundary (clamping rules implemented now, verification harness deferred). Safe to proceed to `/10x-implement first-subscription-dashboard phase 1`.

<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Private Subscription Store (F-01)

- **Plan**: context/changes/private-subscription-store/plan.md
- **Scope**: Phases 1–3 of 3 (full plan) — commits f7ebbc7, 09359e2, c0629ce, 87802e6
- **Date**: 2026-08-08
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 4 observations
- **Mode**: autonomous triage (M2L3 solo review); all decisions final, none PENDING

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING (benign extras — F4) |
| Safety & Quality | WARNING (F1 — fixed during review) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Verification evidence (re-run during review, not taken from Progress notes)

- `npx supabase db reset` — applies from zero, both migrations. PASS
- `npm run lint` — 0 errors/warnings. PASS
- `npm run build` — completes without a running DB. PASS
- Type regeneration idempotent — regenerated via `--db-url`, prettier-formatted, zero diff vs committed `src/db/database.types.ts`. PASS
- Behavioral RLS spot-check via PostgREST (two signup users): A's insert visible only to A; B sees `[]`; B's forged `user_id` insert rejected `42501` ("violates row-level security policy"); anon select rejected `42501` ("permission denied"). Confirms Progress items 1.2–1.4 were not rubber-stamped. PASS
- Post-fix smoke: authenticated insert (custom cycle + interval), update (`updated_at` bumped by trigger), delete (1 row) all work; anon still denied.

## Findings

### F1 — API roles hold RLS-exempt TRUNCATE on subscriptions

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (data safety)
- **Location**: supabase/migrations/20260808210821_create_subscriptions.sql:71-79
- **Detail**: The postgres 17 image's default ACL (`pg_default_acl`: `anon=Dxtm`, `authenticated=Dxtm`, `service_role=Dxtm` for tables created by `postgres` in `public`) grants TRUNCATE, REFERENCES, TRIGGER, MAINTAIN to all three API roles on every new table. The migration's comment claims "Only authenticated gets DML" and "anon ... denied at the privilege layer", but `pg_class.relacl` showed `anon=Dxtm`, `authenticated=arwdDxtm`, `service_role=Dxtm`. TRUNCATE is not subject to row-level security — `authenticated` held a latent whole-table, cross-tenant wipe privilege. Not exploitable via PostgREST today (no TRUNCATE verb), hence WARNING rather than CRITICAL: least-privilege hardening, not a live hole.
- **Fix**: New migration `20260808213726_revoke_subscriptions_default_privileges.sql` revoking truncate, references, trigger, maintain from anon, authenticated, service_role. Separate file (not an edit of the applied migration) so any environment that already ran the original converges via `db push`.
  - Strength: Post-fix `relacl` = `{postgres=arwdDxtm,authenticated=arwd}` — exactly the intended surface; CRUD smoke + anon denial re-verified.
  - Tradeoff: Second migration file slightly dilutes the "one migration owns the schema" story.
  - Confidence: HIGH — verified empirically before and after on the local stack.
  - Blind spot: If the original migration was already pushed to prod, the revoke must also be pushed there (owner's manual step, per plan's Migration Notes).
- **Decision**: FIXED — commit 825ded1 + ACCEPTED-AS-RULE: "New tables inherit RLS-exempt privileges from the default ACL" (context/foundation/lessons.md)

### F2 — updateSubscription with empty input maps to a false "not found"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (reliability)
- **Location**: src/lib/services/subscriptions.ts:45-58
- **Detail**: Verified live: PostgREST answers `PATCH ... {}` with `200 []`, so `.update({}).eq(...).select().single()` yields PGRST116 and the function returns `null` — indistinguishable from not-found — even though the row exists and is owned. `UpdateSubscriptionInput` (all-optional) permits `{}` at the type level.
- **Fix**: Guard `Object.keys(input).length === 0` (throw or delegate to `getSubscription`).
- **Decision**: SKIPPED — no callers exist yet, and the plan explicitly keeps input validation out of this layer ("zod belongs to the first validated API route"). The correct home for the guard is S-01's zod schema (`.refine` non-empty update). Recorded here so S-01's plan review can check for it; adding service-layer validation now would contradict the reviewed plan's own contract. This is the deliberate, documented dismissal required by the review process.

### F3 — Audit timestamps client-settable on INSERT via direct REST

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (data safety)
- **Location**: supabase/migrations/20260808210821_create_subscriptions.sql:40-41
- **Detail**: `created_at`/`updated_at` have defaults but no insert-time enforcement; the generated `Insert` type marks them optional-settable, and a user hitting PostgREST directly (publishable key + own JWT) can forge them on insert. The trigger corrects `updated_at` only on UPDATE. `user_id` forgery, by contrast, is policy-rejected. App-path is safe: `CreateSubscriptionInput` omits all identity/audit fields.
- **Fix**: BEFORE INSERT trigger forcing `created_at`/`updated_at` to `now()`, or a column-privilege approach.
- **Decision**: SKIPPED — a user can only misstate timestamps on their own rows; no cross-tenant or integrity impact, and no product logic reads these fields yet. Revisit only if audit fields become load-bearing (e.g. billing history).

### F4 — Files changed beyond the plan's "Changes Required" lists

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: .gitignore, context/foundation/roadmap.md
- **Detail**: `.gitignore` gained `supabase/.temp/` + `supabase/.branches/` (needed for the Phase 2 lint criterion — eslint's `includeIgnoreFile` reads only the root file); `roadmap.md` F-01 status flipped planning → in-progress → (epilogue). Neither file appears in any phase's "Changes Required". Both are documented in commit messages and Progress notes. No "What We're NOT Doing" boundary is touched.
- **Fix**: None needed — documentation already exists in-plan (Progress notes act as the addendum).
- **Decision**: DISMISSED — benign process bookkeeping; roadmap status tracking is required by the repo's own process, and the .gitignore line is a prerequisite of a planned success criterion.

### F5 — Documented deviations from planned procedure

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: supabase/migrations/20260808210821_create_subscriptions.sql:79, AGENTS.md:29, src/db/database.types.ts:1-5
- **Detail**: Two deviations, both discovered at implement time and both written back: (a) `gen types --local` broken in CLI 2.113.0 → equivalent `--db-url` command, recorded in AGENTS.md and the generated file's header; (b) explicit DML grant to `authenticated` added because image defaults lack DML for API roles, recorded in the migration comment and Phase 1 verification notes. Everything else matches the plan contracts exactly (all enum labels, all CHECK constraints, subselect policy form, `user_id` default, service signatures, the seven exported type names).
- **Fix**: None — this is drift handled the way drift should be handled.
- **Decision**: DISMISSED — deviations are documented at every surface a future agent reads; F1's deeper implication of (b) is captured as a lesson.

## Triage summary

| Finding | Decision |
|---------|----------|
| F1 | FIXED (825ded1) + lesson recorded |
| F2 | SKIPPED — guard belongs to S-01's zod layer; noted for S-01 plan review |
| F3 | SKIPPED — self-scoped forgery, no product reads of audit fields yet |
| F4 | DISMISSED — benign, documented bookkeeping |
| F5 | DISMISSED — deviations properly documented |

## Verdict

**APPROVED** (course scale: **Approve**) — 0 critical findings; the single warning was fixed and re-verified during review; both warning-level dimension marks are benign after triage. The isolation guarantee — the reason F-01 exists — was re-proven behaviorally, not just read off the checklist.

<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Private Subscription Store (F-01) Implementation Plan

- **Plan**: context/changes/private-subscription-store/plan.md
- **Mode**: Deep
- **Date**: 2026-08-08
- **Verdict**: SOUND (after fixes; REVISE before fixes)
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | WARNING → PASS after F2 fix |
| Blind Spots | WARNING → PASS after F3 fix |
| Plan Completeness | WARNING → PASS after F1 fix |

## Grounding

5/5 existing paths ✓ (`src/lib/supabase.ts`, `src/middleware.ts`, `src/env.d.ts`, `supabase/config.toml`, `AGENTS.md`); 4 new paths correctly absent and marked "(new)" in the plan (`src/types.ts`, `src/db/`, `src/lib/services/`, `supabase/migrations/`); 3/3 symbols ✓ (`createServerClient` at `src/lib/supabase.ts:9`, `strictTypeChecked` at `eslint.config.js:15`, zero `service_role` references in `src/` and `astro.config.mjs`); `docs/reference/contract-surfaces.md` absent → surface check skipped; brief↔plan ✓ (phases, decisions, scope match).

Consistency scans: no contradiction (Current State's "CI has no DB" is honored by every CI-facing criterion); no promise gap (Desired End State items 1–6 each trace to a phase: 1–3 → Phase 1, 4+6 → Phase 2, 5 → Phase 3); contracts consistent (`TypedSupabaseClient` exported in Phase 2 is the type Phase 3 signatures consume; `CreateSubscriptionInput`/`UpdateSubscriptionInput` defined in Phase 2, used in Phase 3); Progress↔Phase ✓ (one `## Progress`, phase names match, every Success Criteria bullet has a numbered entry, no checkboxes outside Progress). `lessons.md` prior checked — single entry (Workers `not_found_handling`) is deploy-config, not applicable; plan records this explicitly.

## Findings

### F1 — Test-user seeding method is brittle

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; the RLS verification is the point of the whole change, so the procedure must be executable as written
- **Dimension**: Plan Completeness
- **Location**: Phase 1 — Manual Verification preamble
- **Detail**: The plan offered "create two users via the local Supabase auth or `auth.users` inserts". Direct inserts into `auth.users` are brittle (NOT NULL columns, `instance_id`, password hashing, GoTrue-managed triggers) and can leave half-formed users that make the isolation checks fail for the wrong reason.
- **Fix**: Specify the local auth REST signup endpoint (`POST http://127.0.0.1:54321/auth/v1/signup` with the local anon key from `npx supabase status`) as the only seeding method, then read uuids from `auth.users`; also pin the role-simulation snippet to a `begin … rollback` transaction with `"role":"authenticated"` in the claims.
- **Decision**: FIXED — plan edited accordingly.

### F2 — New `src/db/` convention unrecorded in AGENTS.md

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — the generated-file rule (regenerate after every migration, never import directly) only works if future agents can discover it
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — Generated database types
- **Detail**: AGENTS.md says shared types live in `src/types.ts`; the plan introduces a second types location (`src/db/database.types.ts`, generated). The rationale is sound (CI has no DB, generated artifact ≠ hand-written entities), but the convention lived only inside this plan — S-01+ agents reading AGENTS.md would not know it and could import the generated file directly or edit it by hand.
- **Fix**: Add a Phase 2 change entry: one line in AGENTS.md "Structure & conventions" documenting the generated file, the regeneration command/trigger, and the import rule.
- **Decision**: FIXED — Phase 2 change #4 added.

### F3 — Hidden ordering prerequisite in Phase 2 automated criteria

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — Automated Verification
- **Detail**: "Regeneration is idempotent" requires the local stack running with the Phase 1 migration applied, while the neighboring lint/build criteria are deliberately no-DB (CI-compatible). Unstated, an implementer could run the check against an empty or stale DB and get a spurious diff.
- **Fix**: State the prerequisite inline (local-only check, Phase 1 stack running and migrated) and contrast it with the no-DB criteria.
- **Decision**: FIXED — criterion annotated.

## Notes

Checks that passed without findings, verified rather than assumed: insert anti-forgery is closed both ways (`user_id default auth.uid()` + `WITH CHECK` on insert **and** update); `anon` denial is an explicit per-role decision (no policy = deny) rather than an omission; `(select auth.uid())` initplan form used in all four policies; the cycle/interval CHECK is bidirectional (`custom` requires N, non-custom forbids N) so no ambiguous rows can exist; nullable `note` passes its length CHECK via NULL semantics; `set_updated_at` with empty `search_path` still resolves `now()` (pg_catalog is always searched); enum labels with spaces/`&` are valid and flow into the generated TS unions; rollback story present (greenfield drop, safe pre-S-01); zod deferral matches AGENTS.md; scope contains no S-01+ leakage.

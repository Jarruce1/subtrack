# Duplicate Name Warning (S-07) — Plan Brief

> Full plan: `context/changes/duplicate-name-warning/plan.md`

## What & Why

When a user adds — or renames to — a subscription name whose normalized form
(trimmed, lowercased, inner whitespace collapsed) matches one they already track,
show a warning they can dismiss and save anyway (US-03, FR-014). Double-tracked
costs silently corrupt the totals the product exists to get right; but blocking
would break the legitimate two-accounts-on-one-service case, so the warning must
never block a save.

## Starting Point

S-01/S-03 are done: one dual-mode form (`SubscriptionForm.tsx`) drives both add
(POST `/api/subscriptions`) and edit/rename (PATCH `/api/subscriptions/[id]`),
with a service layer (`src/lib/services/subscriptions.ts`) as the only table
access and RLS scoping every query. No duplicate logic or GET endpoint exists.

## Desired End State

Submitting " netflix  " when "Netflix" exists shows an inline warning naming the
match and relabels the button "Save anyway"; a second submit persists the row.
Unmatched names save exactly as today. The save endpoints are unchanged, so the
warning structurally cannot block persistence.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Detection surface | Read-only GET `/api/subscriptions/duplicate-check` + pure `src/lib/duplicates.ts` | Save routes stay byte-identical ("never blocks" by construction) and the rule is curl-verifiable server-side |
| Matching rule | Exact match on normalized form only | PRD Business Logic §5 wording; fuzzy matching is scope creep |
| Warning UX | Inline advisory alert + "Save anyway" resubmit, keyed on acknowledged normalized name | Cheapest dismiss-and-proceed flow; no modal, save button never disabled |
| Failure policy | Fail-open — any check failure falls through to save | The check is advisory; FR-014 forbids it ever gating persistence |
| Data reader | New lean `listSubscriptionNames` (id+name) in the existing service | Follows the "all table access via service" convention without over-fetching |
| DB changes | None (no normalized column/index/constraint) | A UNIQUE constraint would block saves; 5-30 rows need no index |

## Scope

**In scope:** pure normalization/detection module + unit tests; duplicate-check
endpoint; service name-reader; form submit-path wiring for add and rename.

**Out of scope:** fuzzy matching; DB schema changes; changes to POST/PATCH save
contracts; duplicate badges on list/dashboard; `dashboard.astro`/`billing.ts`
(S-06 territory).

## Architecture / Approach

Form submit → client zod parse → (first time per candidate name) GET
duplicate-check → service reads RLS-scoped `{id,name}` pairs →
`findDuplicateName` (shared pure logic, `exclude=<id>` in edit mode) → on match
the form shows the warning and stops; resubmit (or no match / check failure)
falls through to the existing unchanged save fetch.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Pure logic + unit tests | `normalizeName` / `findDuplicateName` + `duplicates.test.ts` | Normalization drift from PRD wording (pinned by hand-derived oracles) |
| 2. Reader + check endpoint | `listSubscriptionNames` + GET duplicate-check | Route conventions drift from siblings (401/400/500 contract) |
| 3. Form warning flow | Warning UI + save-anyway resubmit in both modes | Accidentally gating the save (fail-open contract violated) |

**Prerequisites:** local Supabase stack for the smoke; S-01/S-03 shipped (done).
**Estimated effort:** 1 session, 3 small phases.

## Open Risks & Assumptions

- Acknowledgement is keyed on the normalized name — editing the name re-arms the
  check; identical resubmit saves. Assumed acceptable for MVP.
- Static route `duplicate-check.ts` shadows `[id].ts` only for that literal path
  and `[id].ts` has no GET — no collision (verified against Astro routing rules).

## Success Criteria (Summary)

- Unit suite pins trim/lowercase/collapse + detection incl. excludeId self-match.
- Smoke: add dup warns → save-anyway persists; rename dup warns; no match silent;
  unchanged-name edit does not self-warn.
- POST/PATCH routes untouched by the diff (never-blocks guarantee).

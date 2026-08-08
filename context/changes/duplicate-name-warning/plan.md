# Duplicate Name Warning (S-07) Implementation Plan

## Overview

Implement FR-014 / US-03: when a user adds a subscription — or renames one in the edit
flow — whose normalized name (trimmed, lowercased, inner whitespace collapsed) matches
one of their existing subscriptions, they see a warning they can dismiss and save
anyway. The warning never blocks a save: two legitimate same-name subscriptions (two
accounts on the same service) must remain possible.

## Current State Analysis

- `src/components/subscriptions/SubscriptionForm.tsx` is the single dual-mode form
  (add via POST `/api/subscriptions`, edit via PATCH `/api/subscriptions/[id]`).
  Client pre-validates with `subscriptionCreateSchema`, then fetches; on success it
  navigates away. No duplicate logic exists anywhere.
- `src/lib/services/subscriptions.ts` is the only module touching the
  `subscriptions` table; the injected session client + RLS scope every query to the
  caller's rows. There is no name-only reader.
- `src/pages/api/subscriptions/index.ts` (POST) and `[id].ts` (PATCH/DELETE) own
  their 401s; middleware does not redirect API routes. There is no GET endpoint.
- `src/lib/validation/subscriptions.ts` is the client-safe shared-validation
  pattern: zod only, type-only imports — the model for any module the form island
  bundles.
- Tests: Vitest unit suites exist under `src/lib/` (`billing.test.ts`,
  `validation/subscriptions.test.ts`); `npm test` = `vitest run`. Test-plan §6.1:
  unit tests live next to the module, oracle values hand-derived from PRD.
- Astro routing: a static file `src/pages/api/subscriptions/duplicate-check.ts`
  takes precedence over the dynamic sibling `[id].ts`, and `[id].ts` exports no GET,
  so a new GET route cannot collide.

## Desired End State

- Adding "Netflix" then submitting " netflix  " (add) or renaming another entry to
  " netflix  " (edit) shows a dismissible warning naming the match; pressing the
  submit button again ("Save anyway") persists the row.
- A name with no normalized match saves exactly as today, with zero extra friction.
- The save endpoints (POST/PATCH) are byte-for-byte unchanged — the warning cannot
  block a save by construction.
- Verify: unit tests for normalization + detection pass; smoke scenarios (add dup,
  dismiss-and-save, rename dup, no match) pass against the local stack.

### Key Discoveries:

- `SubscriptionForm.tsx:84-131` — `handleSubmit` is the single choke point for both
  add and rename; the duplicate check slots in after client zod validation and
  before the save fetch.
- `services/subscriptions.ts:16-22` — `listSubscriptions` pattern to mirror for a
  lean `id,name`-only reader; RLS scoping means the service never filters user_id.
- `api/subscriptions/[id].ts:22` — `z.uuid()` pre-check pattern for id params.
- `validation/subscriptions.ts:9-10` — "client-safe module" convention the new
  `src/lib/duplicates.ts` must follow (form island imports it).
- Astro's `security.checkOrigin` applies to POST/PATCH but not GET — the check
  endpoint stays curl-friendly; the smoke's write calls need an `Origin` header.

## What We're NOT Doing

- No fuzzy matching (Levenshtein, substrings) — exact match on normalized form only
  (PRD Business Logic §5).
- No DB-side normalized-name column, index, or constraint — a UNIQUE constraint
  would block saves, the opposite of FR-014; 5-30 rows need no index.
- No blocking/confirmation modal — the warning is inline and passive; the save
  button stays enabled.
- No changes to POST `/api/subscriptions` or PATCH `/api/subscriptions/[id]`
  contracts (S-06 owns `dashboard.astro`/`billing.ts`; also out of bounds here).
- No warning on the subscriptions list or dashboard for pre-existing duplicates —
  detection fires on add/rename only (PRD §5 wording).

## Implementation Approach

Three small layers, each independently testable:

1. **Pure logic** (`src/lib/duplicates.ts`): `normalizeName` (trim, lowercase,
   collapse inner whitespace) and `findDuplicateName` (first normalized match among
   existing `{id, name}` entries, with an optional `excludeId` so edit mode ignores
   the row being edited). Client-safe module (zod-free, import-free) so the form
   island can share the exact normalization the server uses.
2. **Read-only check endpoint** (GET `/api/subscriptions/duplicate-check?name=…
   [&exclude=<uuid>]`): authenticated like its siblings, loads the caller's
   `{id, name}` pairs via a new lean service reader, answers
   `{ duplicate, match }`. Because it is a separate read path, the save routes are
   untouched and the warning can never block persistence.
3. **Form flow** (`SubscriptionForm.tsx`): on submit, after zod passes and before
   the save fetch, call the check once per candidate name. On a fresh match: render
   a warning alert, relabel the button "Save anyway", and stop. A second submit
   with the same normalized name proceeds to save. Any check failure (non-200,
   network) proceeds to save — fail-open, never blocks.

## Critical Implementation Details

- **Fail-open contract**: the duplicate check is advisory. Every failure path in
  the form (check endpoint 4xx/5xx, network error, JSON parse error) must fall
  through to the save fetch. Only a successful `{ duplicate: true }` answer with a
  not-yet-acknowledged normalized name may interrupt submit.
- **Acknowledgement keying**: track the acknowledged name in normalized form. If
  the user edits the name after seeing the warning, the acknowledgement resets
  (different normalized value → re-check); resubmitting the identical name skips
  straight to save.
- **Edit-mode self-match**: the check must exclude the row being edited
  (`exclude=<id>`), otherwise every edit-mode save of an unchanged name would warn.

## Phase 1: Pure duplicate-detection logic + unit tests

### Overview

The normalization and matching rules as pure functions, with the unit suite that
pins PRD Business Logic §5 (the only layer where the arithmetic of the rule lives).

### Changes Required:

#### 1. Duplicate logic module

**File**: `src/lib/duplicates.ts` (new)

**Intent**: Single source of truth for FR-014 name normalization and duplicate
detection, shared by the check endpoint (server) and the form island (client), in
the style of `src/lib/validation/subscriptions.ts` (client-safe, dependency-free).

**Contract**:
- `normalizeName(name: string): string` — trims, lowercases, collapses every inner
  whitespace run to a single space (`"  Netflix   HD "` → `"netflix hd"`).
- `findDuplicateName(candidate: string, existing: readonly { id: string; name: string }[], excludeId?: string): { id: string; name: string } | null`
  — first entry whose `normalizeName(name)` equals `normalizeName(candidate)`,
  skipping `excludeId`; `null` when the normalized candidate is empty or unmatched.

#### 2. Unit tests

**File**: `src/lib/duplicates.test.ts` (new)

**Intent**: Pin normalization (trim, case, inner-whitespace collapse, unicode
whitespace, empty/whitespace-only input) and detection (US-03 "Spotify " vs
"spotify" case, excludeId self-match skip, no-match, first-match-wins). Oracle
values hand-derived from PRD US-03 + Business Logic §5, cited in comments per
test-plan §6.1.

**Contract**: New standalone test file — extends no existing suite; `npm test`
picks it up via the default Vitest glob.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Unit tests pass (incl. new `duplicates.test.ts`): `npm test`
- Build passes: `npm run build`

#### Manual Verification:

- (none — pure functions are fully covered by the unit suite)

---

## Phase 2: Lean name reader + duplicate-check endpoint

### Overview

The server surface: a service function returning the caller's `{id, name}` pairs
and a read-only authenticated GET endpoint that applies Phase 1's logic.

### Changes Required:

#### 1. Service reader

**File**: `src/lib/services/subscriptions.ts`

**Intent**: Add `listSubscriptionNames(supabase)` so the check endpoint reads only
what it needs (RLS-scoped `id, name` pairs) instead of full rows.

**Contract**: `listSubscriptionNames(supabase: TypedSupabaseClient): Promise<Pick<Subscription, "id" | "name">[]>`
— mirrors `listSubscriptions` error handling (throw `Error(error.message)`); no
ordering needed.

#### 2. Duplicate-check endpoint

**File**: `src/pages/api/subscriptions/duplicate-check.ts` (new)

**Intent**: FR-014 advisory read path. Static route wins over `[id].ts`; sibling
conventions apply (own 401, `json()` helper, service delegation, no DB details in
error bodies).

**Contract**: `GET /api/subscriptions/duplicate-check?name=<string>[&exclude=<uuid>]`
- 401 `{ error }` when unauthenticated; 500 when Supabase unconfigured (sibling
  pattern).
- 400 `{ error }` when `name` is missing/empty or `exclude` is present but not a
  uuid (`z.uuid()` pre-check pattern from `[id].ts`).
- 200 `{ duplicate: boolean, match: { id: string, name: string } | null }` —
  `findDuplicateName(name, rows, exclude)`; `match.name` is the stored (original)
  name for display in the warning.
- 500 `{ error: "Could not check for duplicates" }` on service throw.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Unit tests pass: `npm test`
- Build passes: `npm run build`

#### Manual Verification:

- Authenticated curl against the local stack: exact dup → `duplicate: true`;
  normalized dup (" netflix  ") → `true`; no match → `false`; `exclude=<own id>` →
  `false`; unauthenticated → 401. (Rolled into the Phase 3 smoke session.)

---

## Phase 3: Form warning flow (add + rename)

### Overview

Wire the advisory check into `SubscriptionForm.tsx`'s submit path with the
fail-open, acknowledge-and-resubmit UX; run the full end-to-end smoke.

### Changes Required:

#### 1. Submit-path duplicate check + warning UI

**File**: `src/components/subscriptions/SubscriptionForm.tsx`

**Intent**: Between successful zod parse and the save fetch, consult the check
endpoint once per candidate name; surface a dismissible inline warning; let a
repeat submit save anyway. Never block: any check failure falls through to save.

**Contract**:
- New state: `duplicateWarning: { matchName: string } | null` plus an
  acknowledged-normalized-name marker (e.g. `acknowledgedNameRef`/state holding
  `normalizeName(name)` of the warned candidate).
- Submit flow: zod OK → if `normalizeName(name)` differs from the acknowledged
  marker, fetch `/api/subscriptions/duplicate-check` with the query built via
  `URLSearchParams` (`name`, plus `exclude=subscription.id` in edit mode) so
  names containing `&`, `+`, or `%` survive encoding; on `200 && duplicate` → set warning +
  marker, `return` (no save, `submitting` reset). Otherwise (no dup, non-200,
  thrown fetch, or already acknowledged) → existing save fetch unchanged.
- Warning UI: non-destructive alert (amber styling, `role="status"`) above the
  submit button: “You already track a subscription named "<match>". You can save
  anyway — duplicates are allowed.”; button label flips to "Save anyway" while the
  warning is showing. Editing the name field clears the warning (marker stays until
  a different normalized name is submitted; identical resubmit saves).
- No changes to payload construction, error rendering, or navigation.

### Success Criteria:

#### Automated Verification:

- Lint passes: `npm run lint`
- Type check passes: `npx astro check`
- Unit tests pass: `npm test`
- Build passes: `npm run build`

#### Manual Verification:

- Smoke against local stack (dev server :4404, fresh `s07-*` users, curl writes
  carry `Origin`):
  1. Add "Netflix", then submit " netflix  " → warning appears, nothing saved yet.
  2. Submit again ("Save anyway") → 201, row persists (dismiss never blocks).
  3. Rename another subscription to an existing name → warning; save anyway → 200.
  4. Unrelated name → no warning, saves directly.
  5. Edit-mode save with unchanged name → no self-match warning.

---

## Testing Strategy

### Unit Tests:

- `src/lib/duplicates.test.ts` (new, standalone — NOT in `billing.test.ts`):
  - `normalizeName`: trim; lowercase; inner-whitespace collapse (spaces, tabs,
    newlines, multiple runs); combined US-03 case `" Spotify "` vs `"spotify"`;
    idempotence; empty and whitespace-only strings.
  - `findDuplicateName`: match via normalization; no match; excludeId skips the
    edited row (and only that row); empty candidate never matches; first match
    wins on multiple duplicates; empty existing list.

### Integration Tests:

- None in this slice (test-plan §3 Phase 1 owns DB/API integration; the check
  endpoint is exercised by the smoke below and inherits sibling route patterns).

### Manual Testing Steps:

1. Start local Supabase + dev server on :4404 with local-stack env (swap
   `.dev.vars` for the smoke, restore after).
2. Sign up fresh `s07-a@…`; POST "Netflix" (Origin header).
3. GET duplicate-check with `name=%20netflix%20%20` → `duplicate: true`.
4. POST " netflix  " anyway → 201 (save never blocked).
5. Rename flow: POST "Spotify", then check `name=spotify&exclude=<netflix-id>` →
   `true`; PATCH the rename through → 200.
6. Check an unrelated name → `duplicate: false`; check own name with
   `exclude=<own-id>` → `false`.
7. Browser pass over the form on :4404 for the warning UI + "Save anyway" label.

## Performance Considerations

One extra GET per first submit of a candidate name; reads `id, name` only for a
user's 5-30 rows. No index or caching warranted at MVP scale.

## Migration Notes

No schema changes; no data migration. Feature is purely additive; rollback =
revert the three commits.

## References

- Roadmap: `context/foundation/roadmap.md` S-07 (`duplicate-name-warning`)
- PRD: `context/foundation/prd.md` US-03, FR-014, Business Logic §5
- Form: `src/components/subscriptions/SubscriptionForm.tsx`
- Route conventions: `src/pages/api/subscriptions/index.ts`, `src/pages/api/subscriptions/[id].ts`
- Service pattern: `src/lib/services/subscriptions.ts`
- Client-safe module pattern: `src/lib/validation/subscriptions.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Pure duplicate-detection logic + unit tests

#### Automated

- [x] 1.1 Lint passes: `npm run lint`
- [x] 1.2 Type check passes: `npx astro check`
- [x] 1.3 Unit tests pass (incl. new `duplicates.test.ts`): `npm test`
- [x] 1.4 Build passes: `npm run build`

### Phase 2: Lean name reader + duplicate-check endpoint

#### Automated

- [ ] 2.1 Lint passes: `npm run lint`
- [ ] 2.2 Type check passes: `npx astro check`
- [ ] 2.3 Unit tests pass: `npm test`
- [ ] 2.4 Build passes: `npm run build`

#### Manual

- [ ] 2.5 Authenticated curl checks: exact dup, normalized dup, no match, exclude self, 401

### Phase 3: Form warning flow (add + rename)

#### Automated

- [ ] 3.1 Lint passes: `npm run lint`
- [ ] 3.2 Type check passes: `npx astro check`
- [ ] 3.3 Unit tests pass: `npm test`
- [ ] 3.4 Build passes: `npm run build`

#### Manual

- [ ] 3.5 Smoke: add dup warns, save-anyway persists, rename dup warns, no-match silent, no self-match

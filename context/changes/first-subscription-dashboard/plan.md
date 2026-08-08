# First Subscription to Dashboard (S-01) Implementation Plan

## Overview

Ship the north-star slice end-to-end: an authenticated user adds their first subscription through a validated form and immediately sees a dashboard with the subscription's normalized monthly/yearly cost, per-currency totals, and next renewal date — with an explanatory empty state before the first add. This slice introduces the three assets everything later builds on: pure billing arithmetic (`src/lib/billing.ts`), the first zod-validated API route (`POST /api/subscriptions`), and the real dashboard SSR page.

## Current State Analysis

- **Data layer done (F-01).** `public.subscriptions` exists with RLS + per-operation policies and ACL hardening (`supabase/migrations/20260808210821_create_subscriptions.sql`, `20260808213726_revoke_subscriptions_default_privileges.sql`). Custom-N cycles are stored relationally: `billing_cycle = 'custom'` + `billing_interval_months smallint` (1–120), mutually locked by `subscriptions_cycle_interval_check`. Amounts are `numeric(12,2)` with `amount > 0`; currency CHECK `^[A-Z]{3}$`; note ≤ 500 chars; name trimmed-non-empty ≤ 120.
- **Service layer done (F-01).** `src/lib/services/subscriptions.ts` exposes `listSubscriptions` / `getSubscription` / `createSubscription` / `updateSubscription` / `deleteSubscription`, all taking an injected `TypedSupabaseClient` (`src/lib/supabase.ts:29-31`). No page or endpoint touches `.from("subscriptions")` directly; RLS scopes everything; inserts rely on the `user_id` default.
- **F-01 impl-review handoff (F2, SKIPPED there → owed here):** PostgREST answers an empty `PATCH {}` with `200 []`, so `updateSubscription(supabase, id, {})` returns `null` — a false "not found". The recorded decision: the guard belongs to S-01's zod layer (non-empty update refine), not the service.
- **Domain types done (F-01).** `src/types.ts` exports `Subscription`, `CreateSubscriptionInput`, `UpdateSubscriptionInput`, and the three enum unions. App code never imports `src/db/database.types.ts` directly.
- **Auth works end-to-end.** Signup → `/auth/confirm-email` → signin → redirect `/` (`src/pages/api/auth/signin.ts:19`). `src/middleware.ts` resolves `locals.user` on every request (API routes included) and gates `PROTECTED_ROUTES = ["/dashboard"]` by redirect.
- **Dashboard is a placeholder.** `src/pages/dashboard.astro` renders a welcome card + sign-out form; no domain UI anywhere. No `/subscriptions/*` pages or API routes exist.
- **zod is not installed** (`package.json` has no zod). AGENTS.md: install it with the first validated API route — that route is this slice's.
- **shadcn/ui**: only `button` (+`LibBadge.astro`) in `src/components/ui/`; new primitives arrive via `npx shadcn@latest add`, never hand-written. React form patterns exist under `src/components/auth/` (`FormField`, `SubmitButton`, `ServerError` — controlled inputs, client-side pre-validation, `noValidate`).
- **No test harness.** Roadmap: the automated harness arrives with S-02, whose acceptance criteria need it. S-01's arithmetic must therefore live in pure, trivially-testable functions so S-02 only adds tests, not refactors.
- **Lint is type-checked** (`strictTypeChecked`), so `npm run lint` doubles as type verification; CI (`astro sync` + lint + build) has no database.
- **`lessons.md` checked**: the ACL lesson applies to new-table migrations (none here — no schema change); the Workers `not_found_handling` lesson applies to deploy config (untouched here). Neither adds S-01 work; noted so implement doesn't re-check.

## Desired End State

A user can: register → confirm → sign in (landing on `/dashboard`) → see an explanatory empty state with an add prompt → open `/subscriptions/new` → submit "Netflix, 43 PLN, monthly, started 2026-07-15, Streaming, active" → land back on `/dashboard` showing monthly 43.00 PLN, yearly 516.00 PLN, and next renewal 2026-08-15 — with no manual refresh (US-01).

Concretely:

1. `src/lib/billing.ts` computes normalized costs (Business Logic §1), anchored next-renewal dates with month-end/leap-year clamping (§2), and active-only per-currency totals (§3) as pure functions of their inputs — no I/O, no `Date.now()` inside.
2. `POST /api/subscriptions` rejects unauthenticated calls (401) and invalid payloads (400 with field errors from zod), creates via the F-01 service, and returns the created row (201).
3. The zod schema module also carries the update schema with the non-empty refine, closing F-01 finding F2's recorded handoff.
4. `/dashboard` is SSR over live data: per-subscription raw cost, normalized monthly/yearly, next renewal (active subs), per-currency active-only totals, status visible, empty state at zero subscriptions.
5. `/subscriptions/new` is a protected page with a React island form covering the full FR-004 field set including custom-N cycles and the predefined category list.
6. `npm run lint` and `npm run build` pass without a running database (CI-compatible).

### Key Discoveries:

- `src/lib/services/subscriptions.ts:33-42` — `createSubscription` takes `CreateSubscriptionInput` and throws `Error(postgres message)` on constraint violations; the zod layer must pre-empt every DB CHECK so users see field errors, not Postgres messages.
- `src/types.ts:16-17` — `CreateSubscriptionInput` omits `id`/`user_id`/`created_at`/`updated_at`; the zod create schema's output must be assignable to it (compile-time check, see Phase 2).
- `src/db/database.types.ts` — `amount: number` (PostgREST serializes `numeric` as a JSON number); billing math consumes plain `number`.
- `src/middleware.ts:4` — `PROTECTED_ROUTES` uses `startsWith`; adding `"/subscriptions"` gates both `/subscriptions/new` and future S-03 pages. It must NOT gate `/api/subscriptions` (redirect is wrong for an API; the endpoint answers 401 itself) — `"/subscriptions"` does not prefix-match `/api/subscriptions`, so this holds.
- `src/pages/api/auth/signin.ts:19` — signin redirects to `/`; the S-01 flow lands the user on the dashboard instead (one-line change, exercises FR-001..003 end-to-end per the roadmap note).
- `src/components/auth/SignInForm.tsx` — the established island form pattern: controlled state, client pre-validation, `noValidate`, shared field components. The subscription form follows it but posts JSON via `fetch` (needs field-level server errors without losing form state — see Implementation Approach).
- PRD Business Logic §2 — occurrences are always computed from the original start date (anchor), never from a previously clamped date; the start date itself is occurrence k=0, so a future start date is its own next renewal.
- PRD NFR — "totals never show rounding artifacts": round once at display time, never accumulate rounded values.

## What We're NOT Doing

- **No edit/delete/list-management UI or endpoints** (S-03) — the update zod schema is *defined* here (F2 handoff) but no `PATCH`/`PUT`/`DELETE` route exists until S-03.
- **No automated test harness** (S-02) — billing functions are shaped for S-02's tests; verification here is manual spot-checks against the PRD's worked examples.
- **No month-end/leap-year *verification hardening*** (S-02) — the clamping/anchoring rules ARE implemented now (they're the algorithm, not an add-on); S-02 adds the exhaustive edge-case proof.
- **No status-lifecycle UI** (S-04) — the form includes the FR-004 status field; the dashboard already applies the active-only aggregation rule, but there is no way to change status after creation until S-03/S-04.
- **No upcoming-renewals list** (S-05), **no per-category breakdown** (S-06), **no duplicate-name warning** (S-07).
- **No schema or migration changes**, no service-layer changes (the F-01 contract stands; the F2 guard lives above the service by recorded decision).
- **No currency conversion** — totals are per currency (PRD non-goal).
- **No auth flow rebuilding** — signup/confirm/signin stay as-is except the post-signin landing page.

## Implementation Approach

Three phases along the dependency chain: pure domain arithmetic → validated API → UI that consumes both.

- **Billing arithmetic is pure and date-only.** `src/lib/billing.ts` works on ISO `YYYY-MM-DD` strings and plain numbers; `today` is always a parameter. Calendar math uses `Date.UTC` internally (or integer y/m/d arithmetic) so local timezones can never shift a date. This is what makes S-02 a pure test-writing slice.
- **Validation is a shared zod module, not endpoint-inline.** `src/lib/validation/subscriptions.ts` exports the create and update schemas. The create schema mirrors every DB CHECK (so the DB constraint layer is a backstop, not the UX) and its output type is compile-checked against `CreateSubscriptionInput`. The update schema is `partial` + non-empty refine — F-01 review F2's recorded fix, landing here because S-03's endpoint must not be able to forget it. The React form reuses the create schema client-side: one source of truth for both sides of the wire.
- **JSON API + full-page navigation on success.** The form posts JSON via `fetch`; 400 responses carry zod field errors so the form re-renders errors without losing state (the auth pattern's redirect-with-query-param can't carry per-field errors across 8 fields). On 201 the island does a full navigation to `/dashboard`, so the dashboard is always SSR-computed from the store — "no stale aggregates" for free, no client cache to invalidate.
- **Dashboard is Astro-only.** Pure display of server-computed data — no interactivity, so no island (AGENTS.md: React only where needed). All arithmetic happens in the frontmatter via `billing.ts`; the page only formats.

## Critical Implementation Details

- **Rounding rule (NFR "no rounding artifacts")**: `normalizeCost` returns unrounded numbers; totals sum unrounded values; rounding to 2 decimals happens exactly once, at display, via a single `formatMoney` helper (`Intl.NumberFormat` with the row's currency code — available in the Workers runtime). Never sum already-rounded values.
- **Renewal algorithm anchoring**: for monthly/custom-N, candidate occurrence k is "anchor month + k·step, day = min(anchor day, days in that month)"; iterate k upward from 0 (or a floor estimate) until occurrence ≥ today. Never advance from the previously clamped date — Jan 31 → Feb 28 → **Mar 31**, not Mar 28. Yearly: same month/day each year; Feb 29 anchors clamp to Feb 28 in non-leap years. Weekly: `start + 7k days`. k=0 (the start date) is a valid occurrence.
- **"Today" is the server's UTC date.** Workers run UTC; a Polish user near midnight may see a renewal flip an hour or two "early". Accepted MVP limitation — date-only arithmetic, no timezone setting (out of PRD scope); record in code comment.
- **Cycle/interval invariant crosses the wire**: DB CHECK `(billing_cycle = 'custom') = (billing_interval_months is not null)` means the create schema must *output* `billing_interval_months: null` for non-custom cycles even if the client sent a stale value (e.g. user picked custom, typed 3, switched to monthly, submitted) — normalize, don't reject, on that path; *require* a valid interval when cycle is custom.
- **Middleware ordering**: `locals.user` is set for API routes too, so the endpoint reads `context.locals.user` for the 401 check and still builds its own `createClient(...)` for the RLS-scoped service call — the client is not stored in locals (F-01 pattern: each consumer creates it from the request).

## Phase 1: Billing domain logic

### Overview

The pure arithmetic core — cost normalization, next-renewal dates with clamping, active-only per-currency aggregation — plus the shared DTO types. No I/O, no framework imports; this is the module S-02 will pin down with tests.

### Changes Required:

#### 1. Domain result types

**File**: `src/types.ts`

**Intent**: Shared DTO shapes for computed billing results, next to the entity types, so dashboard (S-01), lifecycle totals (S-04), and category breakdown (S-06) all speak the same shape.

**Contract**: Add two exported types; do not touch the existing F-01 exports:

```ts
export interface NormalizedCost {
  monthly: number; // unrounded
  yearly: number; // unrounded
}
export interface CurrencyTotal {
  currency: string;
  monthly: number;
  yearly: number;
}
```

#### 2. Billing module

**File**: `src/lib/billing.ts` (new)

**Intent**: Implement PRD Business Logic §1 (normalization), §2 (next renewal), §3 (aggregation) as pure functions. Deterministic: `today` is a parameter, never read inside.

**Contract** (signatures are load-bearing — S-02 tests them, S-04/S-06 reuse them):

```ts
normalizeCost(amount: number, cycle: BillingCycle, intervalMonths: number | null): NormalizedCost
nextRenewalDate(startDate: string, cycle: BillingCycle, intervalMonths: number | null, today: string): string
summarizeActive(subscriptions: Subscription[]): CurrencyTotal[]
```

- `normalizeCost`: weekly → monthly = amount × 52 / 12, yearly = amount × 52; monthly → yearly = ×12; yearly → monthly = ÷12; custom-N → monthly = ÷N, yearly = ×12/N. Unrounded outputs. `custom` with `null`/invalid interval throws (impossible via DB constraint — defensive).
- `nextRenewalDate`: dates are ISO `YYYY-MM-DD` in and out; earliest anchored occurrence ≥ `today` per the clamping rules in Critical Implementation Details; date-only arithmetic (`Date.UTC` or integer y/m/d — no local-time `Date` parsing).
- `summarizeActive`: filters `status === "active"`, sums *unrounded* `normalizeCost` results per currency, returns totals sorted by currency code (stable render order). Empty input → `[]`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes (module compiles under `strictTypeChecked`)
- `npm run build` passes without a running database

#### Manual Verification:

Spot-check the PRD's worked examples via a scratch script (`npx tsx` or dev-console; script not committed — the committed harness is S-02):

- US-01: 43 monthly → monthly 43, yearly 516; start 2026-07-15, today 2026-08-08 → next renewal 2026-08-15
- Weekly 12 → monthly 52.00 (12 × 52 / 12), yearly 624; custom-3 30 → monthly 10, yearly 120
- US-02 clamping: monthly start 2026-01-31 → today 2026-02-10 gives 2026-02-28; today 2026-03-01 gives 2026-03-31 (anchor preserved)
- Leap year: yearly start 2024-02-29 → today 2027-01-01 gives 2027-02-28; today 2027-03-01 gives 2028-02-29
- Boundaries: today == occurrence date returns that date; future start date returns the start date itself
- `summarizeActive` over mixed statuses/currencies: paused/cancelled excluded; PLN and EUR reported separately, never merged

**Implementation Note**: After automated verification passes, pause for manual confirmation of the arithmetic spot-checks before Phase 2 — every later phase renders these numbers.

---

## Phase 2: Validation schemas and create endpoint

### Overview

Install zod, define the shared subscription schemas (create + update with the F2 non-empty guard), and expose `POST /api/subscriptions` — the project's first validated API route.

### Changes Required:

#### 1. zod dependency

**File**: `package.json`

**Intent**: AGENTS.md defers zod to the first validated route — this is it.

**Contract**: `npm install zod` (runtime dependency, current major). No config changes.

#### 2. Subscription schemas

**File**: `src/lib/validation/subscriptions.ts` (new directory)

**Intent**: Single source of truth for subscription input validation, shared by the API route (server) and the add form (client pre-validation). Mirrors every DB CHECK so constraint violations become friendly field errors instead of Postgres messages.

**Contract**: Exports `subscriptionCreateSchema` and `subscriptionUpdateSchema` (plus inferred types). Field rules:

- `name`: string, trimmed, 1–120 chars after trim
- `amount`: number, finite, > 0, at most 2 decimal places, < 10¹⁰ (fits `numeric(12,2)`)
- `currency`: uppercased, then must match `/^[A-Z]{3}$/`
- `billing_cycle`: enum `weekly | monthly | yearly | custom`
- `billing_interval_months`: integer 1–120; **cross-field rule**: required when cycle is `custom`, coerced to `null` in the output when cycle is not custom (normalize, don't reject — see Critical Implementation Details)
- `start_date`: `YYYY-MM-DD` string that is a real calendar date (reject 2026-02-30)
- `category`: enum of the five exact PRD labels (`Streaming`, `Software`, `Health & Fitness`, `News & Media`, `Other`)
- `status`: enum `active | paused | cancelled`, default `active`
- `note`: optional string ≤ 500 chars; empty/whitespace-only → `null` in output

The create schema's output type must be assignable to `CreateSubscriptionInput` — enforce at compile time (e.g. a `satisfies`/assignment check in the module) so schema drift against the DB types fails `npm run lint`.

The module must stay **client-safe**: the form island bundles it, so no `astro:env/server` (or any server-only) imports — only zod plus type-only imports from `@/types` (erased at build).

`subscriptionUpdateSchema`: the same field rules made partial, refined to **reject an empty patch** (`Object.keys(...).length > 0` refine — closes F-01 impl-review F2) and to require `billing_cycle`/`billing_interval_months` to be patched together (keeps the DB pair-CHECK satisfiable without reading current state). No endpoint consumes it until S-03; it lives here so S-03 cannot forget the guard.

#### 3. Create endpoint

**File**: `src/pages/api/subscriptions/index.ts` (new directory)

**Intent**: The write path for US-01 — authenticated, validated create, delegating persistence to the F-01 service.

**Contract**: `POST /api/subscriptions`, JSON in/out:

- No `context.locals.user` → `401 {"error": "Authentication required"}`
- `createClient` returns `null` → `500 {"error": "Supabase is not configured"}` (mirrors the auth routes' handling)
- Non-JSON or unparsable body → `400 {"error": "Invalid JSON body"}`
- `subscriptionCreateSchema.safeParse` failure → `400` with the exact wire shape `{"errors": {"formErrors": string[], "fieldErrors": {"<field>": string[]}}}` — this JSON shape (not a zod method) is the client↔server contract; produce it with zod v4's `z.flattenError(...)` (`.flatten()` is deprecated in v4)
- Success → `createSubscription(supabase, parsed.data)` → `201` with the created `Subscription` row as JSON
- Service throw → `500 {"error": "Could not create subscription"}` (generic message; DB details are server-side only)

No other methods in S-01 (S-03 adds item routes).

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes (schema↔`CreateSubscriptionInput` compile check active)
- `npm run build` passes without a running database

#### Manual Verification:

Against `npm run dev` + local Supabase (`npx supabase start`), using curl (session cookie captured from a signed-in browser or via the signin endpoint):

- No cookie → 401
- Valid US-01 payload (Netflix / 43 / PLN / monthly / 2026-07-15 / Streaming / active) → 201; row visible for that user
- Field errors are per-field: negative amount, 3-decimal amount, `currency: "zł"`, bad date 2026-02-30, out-of-enum category → 400 with the offending field named
- Cycle pair: `custom` without interval → 400; `monthly` with a stale interval value → 201 and stored `billing_interval_months` is `null`
- `status` omitted → 201 with `active`

**Implementation Note**: After automated verification passes, pause for manual confirmation of the curl checks before Phase 3.

---

## Phase 3: Add form and live dashboard

### Overview

The user-visible slice: shadcn form primitives, the add-subscription island + page, the real SSR dashboard with empty state, route protection, and the post-signin landing change.

### Changes Required:

#### 1. shadcn form primitives

**Files**: `src/components/ui/input.tsx`, `label.tsx`, `select.tsx`, `textarea.tsx` (new, generated)

**Intent**: Form controls for the add page, added the sanctioned way.

**Contract**: `npx shadcn@latest add input label select textarea` — generated files land in `src/components/ui/` per `components.json` ("new-york"); do not hand-edit beyond what the generator emits.

#### 2. Money/cycle formatting helpers

**File**: `src/lib/format.ts` (new)

**Intent**: One place where rounding-to-display happens (the only rounding in the app) plus human labels for cycles, shared by dashboard now and list views later.

**Contract**: `formatMoney(amount: number, currency: string): string` via `Intl.NumberFormat("en", { style: "currency", currency })` — Intl applies each currency's minor-unit digits (2 for PLN/EUR/USD, 0 for JPY), which is exactly the PRD's "correct rounding … per currency"; `formatCycle(cycle: BillingCycle, intervalMonths: number | null): string` → "weekly" / "monthly" / "yearly" / "every N months".

#### 3. Add-subscription form island

**File**: `src/components/subscriptions/AddSubscriptionForm.tsx` (new directory)

**Intent**: The interactive FR-004 form. Follows the `SignInForm` island pattern (controlled fields, client pre-validation, `noValidate`) but submits JSON and renders server field errors in place.

**Contract**:

- Fields: name, amount, currency (default `PLN`), billing cycle select (weekly/monthly/yearly/custom — "custom" reveals a required "every N months" number input 1–120), start date (`<input type="date">` via shadcn Input), category select (five PRD labels), status select (default active), note textarea (optional).
- Submit: `subscriptionCreateSchema.safeParse` client-side → field errors without a network call; then `fetch("/api/subscriptions", { method: "POST", headers: { "Content-Type": "application/json" }, body })`.
- `201` → `window.location.assign("/dashboard")` (full navigation → fresh SSR totals). `400` → map `errors.fieldErrors` onto fields, `formErrors` into a form-level error area. `401` → `window.location.assign("/auth/signin")`. Other → generic failure message, form state preserved.
- No `"use client"` directives; `cn()` for class merging.

#### 4. Add page

**File**: `src/pages/subscriptions/new.astro` (new directory)

**Intent**: Protected host page for the form island.

**Contract**: `Layout` + heading + `<AddSubscriptionForm client:load />` + a "Back to dashboard" link. No frontmatter data loading. Auth is enforced by middleware (change #6), not in-page.

#### 5. Dashboard page

**File**: `src/pages/dashboard.astro` (rewrite)

**Intent**: Replace the placeholder with the real US-01 dashboard: SSR over live data, arithmetic from `billing.ts`, formatting from `format.ts`.

**Contract**: Frontmatter: `createClient(Astro.request.headers, Astro.cookies)`; the `null` branch is a type-level guard only — unreachable behind the middleware gate (an authenticated `locals.user` requires the client), so render a one-line "Supabase is not configured" notice and stop; do not build UI for it (Layout's env banner already covers the visible messaging). Otherwise `listSubscriptions`, compute `today` as the server's UTC `YYYY-MM-DD`, derive per-sub `normalizeCost` + `nextRenewalDate` (active subs) and `summarizeActive` totals. Render:

- Header: title, link/button to `/subscriptions/new`, existing sign-out form preserved.
- **Zero subscriptions** → explanatory empty state with an add prompt (US-01 AC: not a zero-filled report) — totals and list sections not rendered.
- Otherwise: per-currency totals block (monthly + yearly per `CurrencyTotal`, one row per currency, never merged) and a read-only subscription list — name, category, status, raw cost + cycle label (FR-009 keeps raw cost visible), normalized monthly/yearly, next renewal date (active subs only; paused/cancelled rows show status instead of a renewal date).
- **Subscriptions exist but none active** (`summarizeActive` → `[]` with a non-empty list): the totals block renders a short "No active subscriptions" note — never an empty gap or zero-filled rows; the list still renders.
- Mobile-first responsive layout (NFR: core flows on a phone-sized screen); all money through `formatMoney`.

#### 6. Route protection

**File**: `src/middleware.ts`

**Intent**: Gate the new pages for FR-003.

**Contract**: `PROTECTED_ROUTES = ["/dashboard", "/subscriptions"]` — prefix-gates `/subscriptions/new` (and S-03's future pages) without touching `/api/subscriptions` (the endpoint owns its 401).

#### 7. Post-signin landing

**File**: `src/pages/api/auth/signin.ts`

**Intent**: Land authenticated users on the product surface, completing the register → add → dashboard flow the slice must exercise end-to-end.

**Contract**: Success redirect changes `/` → `/dashboard`. Error paths unchanged; signup still redirects to `/auth/confirm-email`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` passes (islands + pages under type-checked lint)
- `npm run build` passes without a running database

#### Manual Verification:

Full US-01 flow against `npm run dev` + local Supabase, fresh user:

- Register → confirm (local autoconfirm or Inbucket) → sign in → lands on `/dashboard` showing the empty state with an add prompt (no zero-filled totals)
- Unauthenticated `/dashboard` and `/subscriptions/new` both redirect to `/auth/signin`
- Add Netflix / 43 / PLN / monthly / 2026-07-15 / Streaming / active → returns to dashboard showing monthly 43.00 PLN, yearly 516.00 PLN, next renewal per today's date (e.g. 2026-08-15) — no manual refresh
- Client validation blocks an empty submit with field errors; picking "custom" requires N; switching custom → monthly then submitting succeeds
- Add a second subscription in EUR → totals show two separate currency rows
- Add a paused subscription → visible in the list with status, excluded from totals, no renewal date shown
- Phone-sized viewport (~375 px): form and dashboard usable, no horizontal scroll
- Sign out from the dashboard still works

**Implementation Note**: After automated verification passes, pause for manual confirmation of the full-flow walkthrough before closing the change.

---

## Testing Strategy

### Unit Tests:

- None committed in this change — the harness deliberately arrives with S-02 (roadmap decision). Phase 1's contract (pure functions, `today` as a parameter, ISO-string dates) exists precisely so S-02 can pin US-01/US-02 arithmetic down without refactoring.

### Integration Tests:

- None automated; Phase 2's curl checklist is the API-contract verification, Phase 3's walkthrough is the end-to-end verification over the real client → API → zod → service → RLS → SSR path.

### Manual Testing Steps:

1. `npx supabase start` (+ `npx supabase db reset` if schema state is unclear), `npm run dev` with local env values.
2. Phase 1 arithmetic spot-checks (scratch script, PRD worked examples).
3. Phase 2 curl checklist (401 / 400 field errors / 201 / cycle-pair normalization).
4. Phase 3 full-flow walkthrough (empty state → add → live totals → per-currency → paused exclusion → mobile).
5. `npm run lint && npm run build` — CI parity without a database.

## Performance Considerations

- All arithmetic is O(subscriptions) per dashboard render over ≤ 30 rows (PRD scale) — no caching, no aggregates tables; SSR recompute per request is the "no stale aggregates" mechanism, well within the 2 s NFR.
- `nextRenewalDate`'s occurrence loop is bounded (~52 iterations/year of subscription age for weekly; trivial for monthly/yearly) — no closed-form needed at this scale.
- zod ships in the form island's client bundle (single source of truth for validation); acceptable size cost for one page.

## Migration Notes

- No schema changes; no migrations. Works against the F-01 schema already in prod. Deploy order is a single `npx wrangler deploy` (manual, per baseline); no data backfill, no rollback story beyond redeploying the previous worker version.
- `.dev.vars`/`.env` must point at the intended Supabase instance during manual verification (F-01's Phase 2 notes: `.dev.vars` overrides `.env` under the Cloudflare adapter).

## References

- Roadmap item: `context/foundation/roadmap.md` — S-01 "First subscription to dashboard"
- Requirements: `context/foundation/prd.md` — US-01, FR-001..004, FR-009..011, Business Logic §1–3, NFRs (no stale aggregates, rounding, 2 s, mobile)
- F-01 contract: `context/changes/private-subscription-store/plan.md` (service signatures), `.../reviews/impl-review.md` finding F2 (the zod handoff this plan closes)
- Data layer: `supabase/migrations/20260808210821_create_subscriptions.sql` (CHECK constraints the schemas mirror)
- Types: `src/types.ts`; service: `src/lib/services/subscriptions.ts`; client factory: `src/lib/supabase.ts`; auth gate: `src/middleware.ts`
- Lessons check: `context/foundation/lessons.md` — ACL lesson (new tables: none here), Workers assets lesson (deploy config: untouched)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Billing domain logic

#### Automated

- [x] 1.1 `npm run lint` passes (module compiles under `strictTypeChecked`) — 8bc513c
- [x] 1.2 `npm run build` passes without a running database — 8bc513c

#### Manual

- [x] 1.3 US-01 example: 43 monthly → 43 / 516; 2026-07-15 → next 2026-08-15 — 8bc513c
- [x] 1.4 Weekly and custom-N normalization match Business Logic §1 — 8bc513c
- [x] 1.5 US-02 clamping: 2026-01-31 anchor → Feb 28, then Mar 31 — 8bc513c
- [x] 1.6 Leap year: 2024-02-29 anchor → 2027-02-28, 2028-02-29 — 8bc513c
- [x] 1.7 Boundaries: today == occurrence; future start date returns start date — 8bc513c
- [x] 1.8 `summarizeActive`: non-active excluded; currencies never merged — 8bc513c

> Phase 1 verification notes (run autonomously): 1.1/1.2 — lint exit 0, build exit 0, plus `npx astro check` 0 errors. 1.3–1.8 — 20-assertion scratch script (`npx tsx`, not committed) over the PRD worked examples, all pass: 43 monthly → {43, 516}, start 2026-07-15 + today 2026-08-08 → 2026-08-15; weekly 12 → {52, 624}, custom-3 30 → {10, 120}; anchor 2026-01-31 → 2026-02-28 (today 2026-02-10) then 2026-03-31 (today 2026-03-01, anchor preserved); yearly anchor 2024-02-29 → 2027-02-28 then 2028-02-29; today == occurrence returns that date (monthly and weekly), future start returns itself, today == start returns start; custom-3 anchored clamping (2026-01-31 → 2026-04-30 → 2026-07-31); `summarizeActive` excludes paused/cancelled, keeps PLN/EUR as separate sorted rows, sums unrounded, `[]` on empty; `custom` with null interval throws (defensive).

### Phase 2: Validation schemas and create endpoint

#### Automated

- [x] 2.1 `npm run lint` passes (schema↔`CreateSubscriptionInput` compile check active)
- [x] 2.2 `npm run build` passes without a running database

#### Manual

- [x] 2.3 No cookie → 401
- [x] 2.4 Valid US-01 payload → 201, row visible for that user
- [x] 2.5 Field errors per-field for amount/currency/date/category violations
- [x] 2.6 Cycle pair: custom without N → 400; monthly with stale N → 201, interval stored null
- [x] 2.7 `status` omitted → 201 with `active`

> Phase 2 verification notes (run autonomously): zod 4.4.3 installed; `.flatten()` avoided per plan — the endpoint uses `z.flattenError(...)`; `.finite()` dropped (deprecated no-op in v4 — `z.number()` already rejects NaN/±Infinity). 2.1/2.2 — lint exit 0 (both `AssertAssignable` compile guards active, create and update), build exit 0. 2.3–2.7 — curl against `npm run dev` (port 4322; 4321 was taken) + local stack with `.env`/`.dev.vars` temporarily pointed at it (restored after the phase; note: Astro's CSRF `checkOrigin` requires an `Origin` header matching the host on POSTs, including JSON ones — curl calls send `Origin: http://localhost:4322`): no cookie → `401 {"error":"Authentication required"}`; fresh user s01a@test.local (signup → autoconfirm → signin cookie jar) + US-01 Netflix payload → 201 with the row JSON, and psql shows the row owned by that user; negative amount / 3-decimal amount / `zł` currency / 2026-02-30 / `Gaming` category → five 400s each naming exactly the offending field in `errors.fieldErrors`; `custom` without N → 400 on `billing_interval_months`; `monthly` with stale N=3 → 201 with `billing_interval_months: null` (DB confirms null); status omitted → 201 with `status: "active"`. F2 guard spot-checked via tsx scratch: `{}` rejected ("Provide at least one field to update"), cycle-without-interval and inconsistent pairs rejected, name-only and consistent pairs accepted.

### Phase 3: Add form and live dashboard

#### Automated

- [ ] 3.1 `npm run lint` passes (islands + pages under type-checked lint)
- [ ] 3.2 `npm run build` passes without a running database

#### Manual

- [ ] 3.3 Fresh user: register → sign in → `/dashboard` empty state (no zero-filled report)
- [ ] 3.4 Unauthenticated `/dashboard` and `/subscriptions/new` redirect to signin
- [ ] 3.5 US-01 add → dashboard shows 43.00 / 516.00 PLN + next renewal, no manual refresh
- [ ] 3.6 Client validation: empty submit blocked; custom requires N; custom→monthly switch submits clean
- [ ] 3.7 Second currency renders as a separate totals row
- [ ] 3.8 Paused subscription listed with status, excluded from totals, no renewal date
- [ ] 3.9 Phone-sized viewport usable, no horizontal scroll
- [ ] 3.10 Sign out still works from the dashboard

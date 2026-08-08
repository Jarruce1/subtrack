---
project: "SubTrack"
version: 1
status: accepted
created: 2026-08-08
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# SubTrack — Product Requirements Document

## Vision & Problem Statement

People pay for recurring subscriptions they no longer track. A private individual with 5–30 active subscriptions (streaming, SaaS tools, gym, cloud storage) has charges scattered across bank statements, app stores, and inboxes, with no single place showing the real monthly/yearly total or when each subscription renews next. The pain surfaces when reviewing a statement and finding a forgotten charge, or when an annual renewal lands that they meant to cancel. Today's workaround is ad-hoc spreadsheets or memory; spreadsheets rot because every cost lives in a different cycle (weekly, monthly, yearly, every-3-months), so the "real monthly cost" is never computed correctly and renewal dates are not tracked at all. The cost is forgotten renewals and a chronically underestimated recurring spend.

The insight: the value is not the list — it is the arithmetic. Normalizing mixed billing cycles to a true monthly/yearly cost and computing exact next-renewal dates (including month-end and leap-year edge cases) is exactly what people get wrong by hand, and it is what makes the tracker trustworthy. The domain rules are per-user arithmetic and do not change with scale.

## User & Persona

Primary persona: a private individual — "Marta, 32, works a tech-adjacent job, pays for ~12 subscriptions: 3 streaming services, 2 SaaS tools, a gym membership, cloud storage, a news site". She reaches for SubTrack in two moments: (1) after spotting an unfamiliar charge on her statement, she wants one place that answers "what am I actually paying per month?"; (2) at the start of the month, she wants to know what renews in the next 30 days so she can cancel before being charged.

No secondary persona in the MVP. Single-tenant: each account is one person's private data.

## Success Criteria

### Primary
- A new user can register, add their first subscription, and see a dashboard with normalized monthly cost and next renewal date — the full first flow works end to end.
- With 10+ subscriptions across mixed cycles entered, the dashboard's monthly/yearly totals and next-renewal dates are arithmetically correct, including month-end (start on the 31st) and leap-year cases.

### Secondary
- The user checks the upcoming-renewals list at least once per billing month (the product becomes a habit, not a one-off audit).

### Guardrails
- Privacy: one user's subscription data is never visible to any other user.
- Correctness: totals and renewal dates must never be silently wrong — a wrong number destroys the product's whole reason to exist.

## User Stories

### US-01: First subscription to dashboard (primary MVP flow)

- **Given** a visitor with no account
- **When** they register with e-mail and password, and add a subscription "Netflix", 43 PLN, monthly, started 2026-07-15, category "Streaming", status active
- **Then** they see a dashboard showing monthly cost 43 PLN, yearly cost 516 PLN, and next renewal 2026-08-15

#### Acceptance Criteria
- Empty dashboard (zero subscriptions) shows an explanatory empty state with an add prompt, not a zero-filled report
- After saving, the dashboard reflects the new subscription without any manual refresh action
- Amount must be a positive number; name, cost, cycle, and start date are required; note is optional

### US-02: Month-end renewal date is correct

- **Given** an active monthly subscription with start date 2026-01-31
- **When** the user views its next renewal date during February 2026
- **Then** the date shown is 2026-02-28 (clamped to the last day of the month), and in March it shows 2026-03-31 (anchored to the original day 31, not drifting to the 28th)

#### Acceptance Criteria
- A yearly subscription started 2024-02-29 renews on 2027-02-28 (leap-day clamped in non-leap years) and on 2028-02-29 (restored in leap years)
- Occurrences are always computed from the original start date (anchor), never from a previously clamped date

### US-03: Duplicate warning on add

- **Given** a user who already tracks a subscription named "Spotify "
- **When** they add another subscription named "spotify"
- **Then** they see a warning that a likely duplicate exists, and can still choose to save it

#### Acceptance Criteria
- Match is on normalized name: trimmed, lowercased, inner whitespace collapsed
- The warning never blocks saving — two legitimate same-name subscriptions (e.g. two accounts on the same service) are allowed

### US-04: Pausing removes a subscription from the totals

- **Given** a user with an active gym subscription of 120 PLN monthly
- **When** they set its status to paused
- **Then** the dashboard's monthly and yearly totals drop by 120 PLN / 1440 PLN, and the subscription disappears from upcoming renewals but stays visible in the list

#### Acceptance Criteria
- Cancelled behaves like paused for totals and renewals; both remain listed with a visible status
- Setting the status back to active restores it to totals and renewals immediately

## Functional Requirements

### Authentication

- FR-001: Visitor can create an account with e-mail and password. Priority: must-have
  > Socratic: Counter-argument considered: "auth is overhead for an MVP — a local, no-account version ships faster." Resolution: kept; renewal tracking is only useful if data persists across devices/sessions, and privacy of financial data demands per-user accounts.
- FR-002: Registered user can sign in and sign out. Priority: must-have
  > Socratic: Counter-argument considered: "magic-link/passwordless is less friction." Resolution: kept as e-mail+password; smallest model the persona already understands, no e-mail delivery dependency in MVP.
- FR-003: Unauthenticated visitor cannot reach any subscription data and is directed to sign in. Priority: must-have
  > Socratic: Counter-argument considered: "a public demo mode would help onboarding." Resolution: stands as written; demo mode is scope creep, empty-state on first login serves onboarding.

### Subscription management

- FR-004: User can add a subscription with name, cost (amount + currency), billing cycle (weekly, monthly, yearly, or custom every N months), start date, category (picked from a predefined list: Streaming, Software, Health & Fitness, News & Media, Other), status (active/paused/cancelled), and an optional note. Priority: must-have
  > Socratic: Counter-argument considered: "this form is too heavy for a first add — name+price+cycle would do." Resolution: kept; start date is load-bearing for renewal computation and category for breakdowns. Note and category could default, but the fields stay.
- FR-005: User can view a list of all their subscriptions with status visible. Priority: must-have
  > Socratic: Counter-argument considered: "dashboard alone could be the only view." Resolution: kept; editing and status changes need a list surface distinct from aggregates.
- FR-006: User can edit any field of an existing subscription. Priority: must-have
  > Socratic: Counter-argument considered: "delete + re-add covers editing." Resolution: kept; re-entering start dates loses renewal anchors and punishes typo fixes.
- FR-007: User can delete a subscription. Priority: must-have
  > Socratic: Counter-argument considered: "cancelled status makes delete redundant." Resolution: kept; delete is for entry mistakes, cancelled is for real subscriptions that ended — different intents.
- FR-008: User can change a subscription's status between active, paused, and cancelled. Priority: must-have
  > Socratic: Counter-argument considered: "paused is a niche state — active/cancelled suffices." Resolution: kept; gym memberships and seasonal services genuinely pause, and paused ≠ cancelled in user intent to resume.

### Cost & renewal insights

- FR-009: User can see each active subscription's cost normalized to a monthly and a yearly amount, regardless of its billing cycle. Priority: must-have
  > Socratic: Counter-argument considered: "showing raw cost per cycle is honest; normalization can mislead (52/12 weeks)." Resolution: kept; normalization IS the product's core value. Raw cycle cost stays visible alongside.
- FR-010: User can see the next renewal date of each active subscription. Priority: must-have
  > Socratic: Counter-argument considered: "renewal dates drift from reality (banks charge a day late)." Resolution: kept; the computed date is the contract date from cycle + start date; banking lag is out of scope.
- FR-011: User can see total monthly and yearly cost across active subscriptions, summed per currency. Priority: must-have
  > Socratic: Counter-argument considered: "per-currency totals are confusing; convert everything to one currency." Resolution: kept per-currency; conversion needs exchange rates (external dependency, staleness questions) and is an explicit non-goal for MVP.
- FR-012: User can see cost totals broken down per category. Priority: must-have
  > Socratic: Counter-argument considered: "category breakdown is a v2 nicety." Resolution: kept; "where does the money go" is half the persona's question and it is cheap once normalization exists.
- FR-013: User can see the list of renewals due in the next 30 days, soonest first. Priority: must-have
  > Socratic: Counter-argument considered: "without notifications, an in-app list won't prevent unwanted renewals." Resolution: kept; the persona's habit is a monthly check-in, and notifications are an explicit non-goal — the list is the MVP answer.
- FR-014: User is warned when adding a subscription whose normalized name matches an existing one, and can save anyway. Priority: must-have
  > Socratic: Counter-argument considered: "duplicates are rare with 5–30 items; skip it." Resolution: kept as must-have; it is the cheapest of the five business rules and double-tracked costs directly corrupt the totals the product exists to get right.
- FR-015: User can filter and sort the subscription list by category and status. Priority: nice-to-have
  > Socratic: Counter-argument considered: "with ≤ 30 items, scanning beats filtering." Resolution: accepted — demoted to nice-to-have; ships only if time remains.

## Non-Functional Requirements

- One user's subscription data is never visible to, or modifiable by, any other user.
- Every displayed total and renewal date is consistent with the stored subscriptions at the moment the page is shown — no stale aggregates after a save.
- Renewal dates and normalized costs are correct across month-end and leap-year boundaries; a user can verify any displayed date by hand from the cycle and start date.
- Money is displayed with correct rounding to two decimal places per currency; totals never show rounding artifacts.
- The product is usable on the latest two major versions of mainstream desktop and mobile browsers; core flows work on a phone-sized screen.
- The dashboard becomes usable within 2 seconds on a typical broadband connection for a user with 30 subscriptions.

## Business Logic

SubTrack normalizes every subscription's cost to a canonical monthly and yearly amount and derives exact next-renewal dates from the billing cycle and start date, so the user always sees their true recurring spend and what renews next.

Supporting rules, stated implementation-free:

1. **Cost normalization.** Inputs: amount, currency, billing cycle. Outputs: monthly and yearly equivalents. Weekly: monthly = amount × 52 / 12, yearly = amount × 52. Monthly: yearly = amount × 12. Yearly: monthly = amount / 12. Custom every N months: monthly = amount / N, yearly = amount × 12 / N. Displayed amounts round to two decimals; the user meets these numbers on every subscription row and in all totals.
2. **Next renewal date.** Inputs: billing cycle, start date, today's date. Output: the earliest cycle occurrence on or after today. Occurrences are anchored to the original start date: weekly = start + 7k days; monthly/custom-N = same day-of-month advanced by the cycle length, clamped to the last day of shorter months (start on the 31st renews Feb 28/29, then back on the 31st in March); yearly = same month/day each year, with Feb 29 starts clamped to Feb 28 in non-leap years. Clamping never rewrites the anchor.
3. **Aggregation.** Totals (overall and per category) sum normalized costs of **active** subscriptions only, grouped per currency — amounts in different currencies are never added together or converted. Paused and cancelled subscriptions are excluded from totals and renewals but stay listed.
4. **Upcoming renewals.** The renewals list contains active subscriptions whose next renewal falls within today through today + 30 days, sorted soonest first.
5. **Duplicate detection.** On add (and on rename), the new name is normalized — trimmed, lowercased, inner whitespace collapsed — and compared against the user's existing subscriptions; a match produces a warning the user may override. Detection never blocks a save.

## Access Control

Registration and login with e-mail + password. Flat user model: every registered user has the same single role; there are no admin or shared roles. Each user can see and modify only their own subscriptions — full isolation between accounts. An unauthenticated visitor who hits any gated route is redirected to sign-in. Sign-up and sign-in are separate entry points; sign-out is available from any page.

## Non-Goals

Functional:
- **No bank or statement import** — manual entry only; import is a heavy integration with no MVP payoff.
- **No e-mail/push renewal notifications** — the in-app upcoming-renewals list is the MVP answer; notification delivery is v2.
- **No currency conversion** — totals are computed and shown per currency; exchange rates are an external dependency the MVP does not take.
- **No shared or household accounts** — strictly single-tenant, one person's data per account.
- **No native mobile app** — responsive web only.

Non-functional:
- **No offline-first guarantee** — the product assumes a connection.

## Open Questions

None. (Category taxonomy resolved 2026-08-08 by user: predefined list — Streaming, Software, Health & Fitness, News & Media, Other. See FR-004.)

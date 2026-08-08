---
change_id: e2e-critical-flow
title: Playwright E2E suite for the north-star flow and cross-view total consistency
status: impl_reviewed
created: 2026-08-09
updated: 2026-08-09
archived_at: null
---

## Notes

Test-plan §3 Phase 2 ("E2E critical flow") — first browser-level suite
(Playwright) for the two risks that genuinely need a real browser: #4
(north-star flow: signup → add subscription → dashboard, plus gated-route
redirect) and #1 (cross-view consistency of totals/renewals under mixed
statuses and currencies). Everything runs against the LOCAL Supabase stack
via a dev server on port 4406; `.dev.vars`/`.env` (which point at the cloud
project) are swapped for local values for the duration of the run and
restored afterwards. NOT wired into CI in this change (gates = test-plan
Phase 4). Oracles hand-derived from PRD Business Logic §1–§4, never from
`src/lib/billing.ts`.

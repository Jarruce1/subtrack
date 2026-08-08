---
change_id: status-lifecycle-totals
title: Status lifecycle quick actions drive totals
status: impl_reviewed
created: 2026-08-09
updated: 2026-08-09
archived_at: null
---

## Notes

S-04 (roadmap "Status lifecycle drives totals", US-04, FR-008, PRD Business Logic §3).
The aggregation rule already exists everywhere — summarizeActive, summarizeByCategory
and upcomingRenewals all count active subscriptions only, and the S-03 edit form can
already change status through PATCH /api/subscriptions/[id] (status is in
subscriptionUpdateSchema). The gap is a convenient lifecycle: one-click pause / resume /
cancel (with confirmation) / reactivate directly on the subscription list, without
entering the full edit form, with a full navigation after the action so SSR recomputes
and every total/renewal view reflects the change immediately. This slice is mostly
UI + wiring; keep it small.

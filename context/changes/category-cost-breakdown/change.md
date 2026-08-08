---
change_id: category-cost-breakdown
title: Cost totals per category on the dashboard (S-06)
status: implementing
created: 2026-08-08
updated: 2026-08-08
archived_at: null
---

## Notes

Roadmap S-06 (FR-012, PRD §3 aggregation rule): monthly/yearly cost totals
broken down per category on the dashboard — active subscriptions only, grouped
per currency (never converted or merged), categories with no active
subscriptions absent. Pure derivation `summarizeByCategory(subs)` in
`src/lib/billing.ts` beside `summarizeActive`, unit-tested in the existing
suite style, including the test-plan risk #1 consistency check: per-category
sums per currency must equal `summarizeActive` for the same input.

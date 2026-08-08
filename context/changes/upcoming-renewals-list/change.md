---
change_id: upcoming-renewals-list
title: Upcoming renewals in the next 30 days on the dashboard (S-05)
status: impl_reviewed
created: 2026-08-08
updated: 2026-08-08
archived_at: null
---

## Notes

S-05 z @roadmap.md — FR-013, PRD Business Logic §4. Lista nadchodzących odnowień (aktywne subskrypcje, okno [today, today+30], najbliższe najpierw) na dashboardzie; pusta lista → dyskretny komunikat. Czysta funkcja `upcomingRenewals(subs, today)` w `src/lib/billing.ts` + unit testy. Równolegle powstaje S-03 (`../subtrack-manage`) — dashboard.astro dostaje tam tylko 1 linię linku; sekcja S-05 musi być osobnym, samodzielnym blokiem, żeby merge był czysty. Nie dotykać `src/lib/services/subscriptions.ts` ani `src/lib/validation/subscriptions.ts` (pliki S-03).

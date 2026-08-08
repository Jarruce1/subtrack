---
change_id: duplicate-name-warning
title: Non-blocking duplicate-name warning on add and rename
status: implementing
created: 2026-08-08
updated: 2026-08-08
archived_at: null
---

## Notes

S-07 (roadmap "Duplicate warning on add and rename", US-03, FR-014, PRD Business Logic §5).
On add and on rename: normalize the candidate name (trim, lowercase, collapse inner
whitespace), compare against the user's existing subscriptions; a match produces a
warning the user can dismiss and save anyway. The warning NEVER blocks a save — two
legitimate same-name subscriptions must stay possible (two accounts on one service).
Prerequisites S-01 and S-03 are done; the rename path lives in the S-03 edit flow
(SubscriptionForm.tsx dual mode).

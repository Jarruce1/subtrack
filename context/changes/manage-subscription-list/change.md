---
change_id: manage-subscription-list
title: Subscription list with edit and delete (S-03)
status: implemented
created: 2026-08-08
updated: 2026-08-08
archived_at: null
---

## Notes

Roadmap slice S-03 (FR-005, FR-006, FR-007): a subscription list page (SSR, all of the user's subscriptions with status and normalized costs), editing any field of an entry (prefilled form, PATCH /api/subscriptions/[id] validated by the already-defined subscriptionUpdateSchema — closes the F-01 review F2 handoff end-to-end), and deleting an entry with confirmation (DELETE /api/subscriptions/[id]). 404 for foreign/nonexistent ids. Navigation from the dashboard to the list. Duplicate-name warning on rename is explicitly out (S-07).

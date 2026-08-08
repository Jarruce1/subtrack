---
change_id: error-path-hardening
title: Error-path & secret hardening — honest failure contracts and a secret-leak scan
status: implemented
created: 2026-08-09
updated: 2026-08-09
archived_at: null
---

## Notes

Test-plan §3 Phase 3 (risks #3 and #6): audit swallowed errors across src/,
pin the error contract with failing-first induced-failure integration tests,
fix propagation minimally, and add a deterministic secret-leak scan over the
built client bundle (`npm run scan:secrets`). M3L5 of 10xdevs.

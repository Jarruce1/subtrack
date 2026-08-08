---
change_id: testing-api-rls-integration
title: Integration tests for RLS isolation, ACL regression, and injection parity
status: plan_reviewed
created: 2026-08-08
updated: 2026-08-08
archived_at: null
---

## Notes

Test-plan §3 Phase 1 ("API & RLS integration") — integration tests on the REAL
local Supabase stack for the highest uncovered risks: #2 (IDOR/RLS isolation +
ACL regression from lessons.md) and #5 (injection/validation parity — DB CHECK
constraints hold independently of zod). Scope for this change: RLS isolation
(two real accounts), SQL relacl assertion, malicious payloads straight to
PostgREST. Risk #3 (swallowed errors) stays with Phase 3 per test-plan
sequencing. Gate stays local/ad hoc — NOT added to CI (test-plan §5).

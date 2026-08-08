# Follow-ups from impl-review (error-path-hardening)

Out-of-diff observations queued for later work — neither is a defect of
this change, but the lessons.md rule this change established makes them
worth closing.

## 1. signin/signup forward `error.message` into the redirect URL

`src/pages/api/auth/signin.ts:16` and `src/pages/api/auth/signup.ts:16`
redirect with `?error=${encodeURIComponent(error.message)}` — raw
supabase-js backend detail in a URL. The new lessons.md rule ("no backend
detail in URLs — risk #6") and the sign-out fix both use a fixed generic
message. Follow-up: map auth failures to fixed user-facing messages
(invalid credentials / rate limited / generic) in both routes, then extend
`src/tests/integration/error-contracts.test.ts` to pin it.

## 2. Dashboard `?error=` renders attacker-choosable free text

`src/pages/dashboard.astro` (and, pre-existing, the signin/signup pages)
render the raw `?error=` query value. XSS-safe (Astro escaping + no
`set:html` anywhere, enforced by `astro/no-set-html-directive`), but a
crafted link can display arbitrary text inside a trusted authenticated
page (content spoofing). Only one legitimate producer exists and it emits
one fixed string. Follow-up: switch the contract to short codes
(`?error=signout-failed`) mapped to messages server-side, across all three
pages in one sweep.

---
starter_id: 10x-astro-starter
package_manager: npm
project_name: subtrack
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

A solo developer shipping SubTrack — a subscription tracker with e-mail/password
auth and per-user data isolation — in 3 weeks of after-hours work needs a
battle-tested, agent-friendly starter with auth, database, and deploy solved out
of the box. 10x Astro Starter (Astro 6 + React 19 + TypeScript + Tailwind 4 +
Supabase + Cloudflare) is the recommended default for (web, js) and matches the
owner's stated prior of Astro + Cloudflare + Supabase exactly: Supabase Auth
covers FR-001–003 e-mail/password flows, and Supabase row-level security
enforces the PRD's hard privacy guardrail that one user's data is never visible
to another. The stack clears all four agent-friendly gates (typed,
convention-based, popular in training, well documented). Bootstrapper confidence
is first-class — registered with a valid CLI, expect mostly-smooth scaffolding.
Payments, realtime, AI, and background jobs are out of scope per the PRD;
renewal math is pure per-user arithmetic well served by typed domain functions.
Deploys to Cloudflare Pages (starter default) with GitHub Actions
auto-deploy-on-merge.

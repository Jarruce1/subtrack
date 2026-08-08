# Lessons Learned

<!--
Entry format — copy for each new lesson:

## <Short imperative title>
**Context**: <where it happened — task, file, feature>
**Problem**: <what the agent got wrong and how it surfaced>
**Rule**: <the checkable rule that prevents a repeat>
**Applies to**: frame | research | plan | plan-review | implement | impl-review | all

No entries yet.
-->

## Workers assets `not_found_handling` swallows SSR routes

**Context**: First production deploy of the Astro SSR app to Cloudflare Workers with static assets.
**Problem**: `"not_found_handling": "404-page"` in wrangler.jsonc made the asset layer answer 404 for `/dashboard` (no matching asset, no 404.html) instead of forwarding the request to the worker — SSR routes silently dead in prod while local preview worked.
**Rule**: With a `main` worker doing SSR, do not set `assets.not_found_handling`; let non-asset requests fall through to the worker. Verify prod routes with `wrangler tail` when a route 404s but works locally.
**Applies to**: implement

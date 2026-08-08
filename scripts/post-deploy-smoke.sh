#!/usr/bin/env bash
# Post-deploy smoke checks (test-plan §2 risk #7, §5 gate): three curl-level
# probes that catch the local-pass/prod-dead failure class after a manual
# `wrangler deploy` (the recorded burn: SSR routes dead in prod via
# `not_found_handling` while local preview worked).
#
#   1. `/` answers 200                       — SSR serves at all
#   2. `/dashboard` 302-redirects to sign-in — auth gating alive in prod
#   3. unauthenticated API answers 401       — API surface + auth wired
#                                              (a 404/500 here means dead)
#
# Usage: npm run smoke:prod [-- <base-url>]   (default: production URL)
# Exit: 0 all checks pass · 1 any check failed or the URL is unreachable.

set -u

BASE_URL="${1:-https://subtrack.jarruce1.workers.dev}"
BASE_URL="${BASE_URL%/}"
CURL=(curl --silent --output /dev/null --max-time 15)
FAILURES=0

pass() { printf 'ok   %s\n' "$1"; }
fail() {
  printf 'FAIL %s\n' "$1"
  FAILURES=$((FAILURES + 1))
}

# 1. Landing page serves.
status="$("${CURL[@]}" --write-out '%{http_code}' "$BASE_URL/")" || status=000
if [ "$status" = "200" ]; then
  pass "GET / -> $status"
else
  fail "GET / -> $status (expected 200)"
fi

# 2. Gated route redirects unauthenticated visitors to sign-in. No -L on
# purpose: the redirect itself is the contract (src/middleware.ts).
out="$("${CURL[@]}" --write-out '%{http_code} %{redirect_url}' "$BASE_URL/dashboard")" || out='000 '
status="${out%% *}"
redirect="${out#* }"
if [ "$status" = "302" ] && [[ "$redirect" == */auth/signin ]]; then
  pass "GET /dashboard -> $status -> $redirect"
else
  fail "GET /dashboard -> $status -> ${redirect:-<no redirect>} (expected 302 -> .../auth/signin)"
fi

# 3. An authenticated API answers: without a session the pinned contract is a
# clean 401 (src/tests/integration/error-contracts.test.ts).
status="$("${CURL[@]}" --write-out '%{http_code}' "$BASE_URL/api/subscriptions/duplicate-check?name=smoke")" || status=000
if [ "$status" = "401" ]; then
  pass "GET /api/subscriptions/duplicate-check -> $status"
else
  fail "GET /api/subscriptions/duplicate-check -> $status (expected 401)"
fi

if [ "$FAILURES" -gt 0 ]; then
  printf 'smoke: FAIL — %d of 3 checks failed against %s\n' "$FAILURES" "$BASE_URL"
  exit 1
fi
printf 'smoke: OK — 3/3 checks passed against %s\n' "$BASE_URL"

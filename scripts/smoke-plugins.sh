#!/usr/bin/env bash
# End-to-end smoke test of the plugin host against a fresh local dev server (resets local D1 state).
. "$(dirname "$0")/lib.sh"
start_dev
S=$(login mom@example.com); C="Cookie: __Host-session=$S"

echo "plugin host"
check "dashboard renders the plugin card" "$(curl -s -H "$C" $B/ | grep -c 'data-plugin="example"')" 1
check "loader data reaches the widget" "$(curl -s -H "$C" $B/ | grep -c 'Hello, family')" 1
check "svelte island is emitted" "$(curl -s -H "$C" $B/ | grep -c '<astro-island')" 1
check "api returns ok payload" "$(curl -s -H "$C" $B/api/plugins/example/data | grep -o '"status":"ok"')" '"status":"ok"'
check "api is JSON and uncached" "$(curl -s -D - -o /dev/null -H "$C" $B/api/plugins/example/data | grep -ci 'content-type: application/json')" 1
check "api requires a session" "$(code $B/api/plugins/example/data)" 401
check "unknown plugin is 404" "$(code -H "$C" $B/api/plugins/nope/data)" 404
check "path-ish plugin id is 404" "$(code -H "$C" "$B/api/plugins/..%2Fadmin/data")" 404
check "api is read-only (POST -> 405)" "$(code -X POST -H "$O" -H "$C" $B/api/plugins/example/data)" 405
check "api is read-only (DELETE -> 405)" "$(code -X DELETE -H "$O" -H "$C" $B/api/plugins/example/data)" 405
check "plugin page renders" "$(code -H "$C" $B/p/example)" 200
check "unknown plugin page is 404" "$(code -H "$C" $B/p/nope)" 404
check "plugin page needs a session" "$(code $B/p/example)" 302
check "second call is served from cache (same generatedAt)" "$(a=$(curl -s -H "$C" $B/api/plugins/example/data | grep -o 'generatedAt":[0-9]*'); b=$(curl -s -H "$C" $B/api/plugins/example/data | grep -o 'generatedAt":[0-9]*'); [ "$a" = "$b" ] && echo same)" same
summary

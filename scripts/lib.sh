# Shared helpers for the end-to-end scripts (source it; do not run it).
#   . "$(dirname "$0")/lib.sh"; start_dev; M=$(login mom@example.com); ...; summary
# `login` signs in through the real flow: request a link, read it from the dev server log, confirm it with the
# nonce cookie, and print the session id.
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1
set -u
B=http://localhost:4321; O="Origin: $B"; T=$(mktemp -d)
pass=0; fail=0

check() { if [ "$2" = "$3" ]; then pass=$((pass+1)); echo "  ok   $1"; else fail=$((fail+1)); echo "  FAIL $1 (got '$2', want '$3')"; fi; }
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }
post() { local sid=$1; shift; curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -X POST -H "$O" -H "Cookie: __Host-session=$sid" "$@"; }
get() { curl -s -H "Cookie: __Host-session=$1" "$B$2"; }

# Fresh local D1 plus a dev server; both are cleaned up when the script exits.
start_dev() {
  rm -rf .wrangler/state; npx wrangler d1 migrations apply family-dashboard --local >/dev/null 2>&1
  npx astro dev --port 4321 >/dev/null 2>&1; sleep 6
  trap 'npx astro dev stop >/dev/null 2>&1; rm -rf "$T"' EXIT
}

login() { # email -> session id
  curl -s -o /dev/null -c "$T/j" -X POST -H "$O" -d "email=$1" $B/auth/request; sleep 1
  local tok nonce
  tok=$(npx astro dev logs 2>&1 | grep -o 'auth/verify#token=[0-9a-f]*' | tail -1); tok=${tok##*token=}
  nonce=$(awk '/login-nonce/{print $7}' "$T/j")
  curl -s -c "$T/s" -o /dev/null -X POST -H "$O" -H 'content-type: application/json' -H "Cookie: __Host-login-nonce=$nonce" -d "{\"token\":\"$tok\"}" $B/auth/confirm
  awk '/__Host-session/{print $7}' "$T/s"
}

summary() { echo; echo "passed=$pass failed=$fail"; [ $fail -eq 0 ]; }

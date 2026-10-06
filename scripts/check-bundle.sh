#!/usr/bin/env bash
# Fails if anything that must stay server-side can be found in files served to browsers (dist/client).
# Run after `astro build`.
set -u
cd "$(dirname "$0")/.."
DIR=dist/client
[ -d "$DIR" ] || { echo "no $DIR; run astro build first"; exit 1; }
# Guard against a vacuous pass: the scan is only meaningful if real client code is there.
JS=$(find "$DIR" -name '*.js' | wc -l | tr -d ' ')
[ "$JS" -gt 0 ] || { echo "FAIL: no client JavaScript found in $DIR (scan would prove nothing)"; exit 1; }

PATTERNS=(
  RESEND_API_KEY GOOGLE_SERVICE_ACCOUNT GOOGLE_CALENDAR_ID MEALQ_API_TOKEN
  BOOTSTRAP_MANAGER_EMAIL 'PRIVATE KEY' client_email 'cloudflare:workers'
  api.resend.com oauth2.googleapis.com www.googleapis.com/calendar
  login_tokens D1Database 'Bearer '
)
fail=0
for p in "${PATTERNS[@]}"; do
  hits=$(grep -rlF -- "$p" "$DIR" 2>/dev/null)
  if [ -n "$hits" ]; then echo "FAIL: '$p' found in client files:"; echo "$hits" | sed 's/^/       /'; fail=1; fi
done
# The browser may only ever talk to its own origin: any absolute URL in client files must be a non-contacted
# namespace (XML/SVG). A framework bundling a docs link in a comment would show up here and get reviewed.
# Svelte's runtime names its errors with a docs URL inside console.warn/Error strings (https://svelte.dev/e/<code>);
# it is text, never requested, and only that exact shape is ignored.
EXT=$(grep -rhoE 'https?://[A-Za-z0-9._/-]+' "$DIR" 2>/dev/null | grep -vE '^https://svelte\.dev/e/[a-z_]*$' | sed -E 's#https?://([A-Za-z0-9._-]+).*#\1#' | sort -u | grep -vE '^(www\.w3\.org|localhost)$')
if [ -n "$EXT" ]; then echo "FAIL: client files reference external hosts:"; echo "$EXT" | sed 's/^/       /'; fail=1; fi
[ $fail -eq 0 ] && echo "ok: scanned $(find "$DIR" -type f | wc -l | tr -d ' ') client files ($JS JS) for ${#PATTERNS[@]} server-only markers and for external hosts; none found"
exit $fail

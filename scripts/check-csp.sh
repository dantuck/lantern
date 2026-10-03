#!/usr/bin/env bash
# Builds, serves the PRODUCTION bundle with wrangler, signs in with a seeded session, and verifies that the
# effective CSP (all policies, from headers or <meta>) covers every inline script and style, and that no
# inline event handlers exist. Resets local D1 state.
set -u
cd "$(dirname "$0")/.."
P=8787; B=http://localhost:$P; ST=.wrangler/state; TMP=${TMPDIR:-/tmp}
PUBLIC_ENABLE_EXAMPLE=1 npx astro build >/dev/null 2>&1 || { echo "build failed"; exit 1; }
rm -rf $ST; npx wrangler d1 migrations apply family-dashboard --local --persist-to $ST >/dev/null 2>&1
SID=$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')
HASH=$(node -e 'console.log(require("crypto").createHash("sha256").update(process.argv[1]).digest("hex"))' "$SID")
NOW=$(node -e 'console.log(Date.now())')
npx wrangler d1 execute family-dashboard --local --persist-to $ST --command "
 INSERT INTO users (id,email,role,created_at) VALUES ('u1','mom@example.com','manager',$NOW);
 INSERT INTO sessions (id_hash,user_id,device_label,created_at,last_seen,expires_at) VALUES ('$HASH','u1','csp-check',$NOW,$NOW,$NOW+86400000);" >/dev/null 2>&1
# Job control gives wrangler its own process group, so cleanup can stop it and its workerd child without
# touching any other dev server on the machine.
set -m
npx wrangler dev --config dist/server/wrangler.json --port $P --persist-to $ST >"$TMP/csp-wrangler.log" 2>&1 &
WP=$!; trap 'kill -- -$WP 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -s -o /dev/null $B/login && break; sleep 1; done

fail=0
for path in / /login /auth/verify /devices /admin /p/example; do
  case $path in /login|/auth/verify) COOKIE="X-None: 1" ;; *) COOKIE="Cookie: __Host-session=$SID" ;; esac
  curl -s -D "$TMP/h.txt" -H "$COOKIE" $B$path -o "$TMP/p.html"
  node - "$TMP/p.html" "$TMP/h.txt" "$path" <<'JS' || fail=1
const fs = require('fs'), crypto = require('crypto');
const [, , htmlFile, hdrFile, path] = process.argv;
const html = fs.readFileSync(htmlFile, 'utf8'), hdr = fs.readFileSync(hdrFile, 'utf8');
const status = hdr.split('\n')[0].trim();
const policies = [
  ...hdr.split('\n').filter((l) => /^content-security-policy:/i.test(l)).map((l) => l.replace(/^[^:]+:/, '')),
  ...[...html.matchAll(/<meta http-equiv="content-security-policy" content="([^"]*)"/gi)].map((m) => m[1]),
];
const csp = policies.join(' | ');
const problems = [];
if (!status.includes('200')) problems.push(`status ${status}`);
if (policies.length === 0) problems.push('no CSP at all');
const sha = (s) => "'sha256-" + crypto.createHash('sha256').update(s).digest('base64') + "'";
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
for (const b of scripts) if (!csp.includes(sha(b))) problems.push(`inline script not covered (${b.slice(0, 40).replace(/\s+/g, ' ')}…)`);
for (const b of styles) if (!csp.includes(sha(b))) problems.push(`inline style not covered (${b.slice(0, 40).replace(/\s+/g, ' ')}…)`);
if (/\son[a-z]+="/.test(html)) problems.push('inline event handler present');
if (/unsafe-eval/.test(csp)) problems.push("'unsafe-eval' present");
if (/script-src[^;|]*unsafe-inline/.test(csp)) problems.push("'unsafe-inline' in script-src");
if (!/frame-ancestors 'none'/.test(csp)) problems.push('frame-ancestors missing');
if (!/default-src 'none'/.test(csp)) problems.push("default-src 'none' missing");
console.log(`${problems.length ? 'FAIL' : 'ok  '} ${path.padEnd(14)} inline scripts=${scripts.length} styles=${styles.length}${problems.length ? '\n       ' + problems.join('\n       ') : ''}`);
process.exit(problems.length ? 1 : 0);
JS
done
echo; echo "--- effective CSP for /:"
curl -s -D - -o /dev/null -H "Cookie: __Host-session=$SID" $B/ | grep -i '^content-security-policy' | sed 's/^[^:]*: //; s/;/;\n   /g'
echo "--- island assets reachable:"
for u in $(curl -s -H "Cookie: __Host-session=$SID" $B/ | grep -oE '(component|renderer)-url="[^"]+"' | cut -d'"' -f2); do echo "  $(curl -s -o /dev/null -w '%{http_code}' $B$u) $u"; done

echo "--- static file headers (served by Cloudflare before the Worker):"
ASSET=$(curl -s -H "Cookie: __Host-session=$SID" $B/ | grep -oE '/_astro/[^"]+\.css' | head -1)
want() { # path header-regex description
  local h; h=$(curl -s -D - -o /dev/null "$B$1")
  if echo "$h" | grep -qiE "$2"; then echo "  ok   $1  $3"; else echo "  FAIL $1  $3"; fail=1; fi
}
for f in /sw.js /manifest.webmanifest /offline.html /offline.css /icons/icon-192.png /favicon.svg /robots.txt "$ASSET"; do
  want "$f" '^x-content-type-options: nosniff' nosniff
  want "$f" '^referrer-policy: same-origin' referrer-policy
  want "$f" '^strict-transport-security' hsts
done
want /sw.js '^cache-control: no-cache' 'sw.js is never cached'
want /sw.js '^service-worker-allowed: /' 'scope allowed'
want /manifest.webmanifest '^content-type: application/manifest\+json' 'manifest content-type'
want /offline.html "^content-security-policy: default-src 'none'" 'offline page CSP'
want "$ASSET" '^cache-control: public, max-age=31536000, immutable' 'hashed assets immutable (adapter rule kept)'
echo "--- static files are reachable without a session:"
for f in /sw.js /manifest.webmanifest /offline.html /icons/icon-512.png /icons/maskable-512.png /apple-touch-icon.png; do
  c=$(curl -s -o /dev/null -w '%{http_code}' $B$f); [ "$c" = 200 ] && echo "  ok   $c $f" || { echo "  FAIL $c $f"; fail=1; }
done
[ $fail -eq 0 ]

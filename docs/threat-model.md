# Threat model

What this dashboard protects, from whom, and how. It complements [`SECURITY.md`](../SECURITY.md) (what the
software talks to and its supply-chain stance) and [`you-are-the-host.md`](you-are-the-host.md) (what the operator
must do). It describes one household's deployment on its own Cloudflare account.

## What is worth protecting

1. **Access to the dashboard**: who is allowed in. Behind it sit the household's calendar and meal plan.
2. **The credentials you gave it**: a read-only calendar service account, a read-only MealQ token, and a
   send-only Resend key. All three are Worker secrets.
3. **The member list and audit log**: email addresses and who did what (kept 400 days).
4. **The deployed code**, because whoever controls it can read everything above.

The app is read-only for members: they cannot edit calendars or meal plans through it. The only writes are
sign-in, sign-out, and manager invitations. That keeps the damage of most mistakes small.

## Who might attack it, and what stops them

| Threat | Defence | Where it lives |
|---|---|---|
| **A stranger** finds the address and tries to get in | There is no sign-up. Every route except sign-in needs a session. A sign-in request gets the same response whether or not the address is invited, so addresses cannot be guessed. Requests are rate limited per IP, per address-and-IP, and per address. | `src/middleware.ts`, `src/lib/rateLimit.ts`, `test/hardening.test.ts` |
| **A sign-in link is intercepted, forwarded, or opened by an email scanner** | Links are single-use and valid 10 minutes. The token is in the URL fragment, so it is never sent to servers, logs or `Referer`. The link only works in the browser that asked for it (a host-only cookie holds a matching nonce), so a scanner or a forwarded copy fails. Only a hash of the token is stored. The email also carries an 8-digit code for reading on another device: it works only in the requesting browser (same nonce), is burned after 5 wrong guesses, is rate limited per IP, and only its hash is stored. | `src/pages/auth/*`, `src/lib/auth/loginTokens.ts` |
| **A session is stolen** | Sessions are random 256-bit ids stored only as hashes, in an HttpOnly, Secure, SameSite=Lax cookie, with 30-day idle and 90-day absolute lifetimes. Any device can be signed out by its owner or a manager, instantly. | `src/lib/auth/sessions.ts`, `src/lib/auth/cookies.ts` |
| **A lost or taken phone** | Sign out the device (own *Devices* page, or Admin). The locally saved offline copy is deleted at sign-out and revocation, and refused after 24 hours in any case. Private pages (`/admin`, `/devices`) are never saved offline. | `public/sw.js`, `test/sw.test.ts`, `docs/pwa-manual-check.md` |
| **Cross-site tricks** (forged form posts, framing, injected scripts) | Origin is checked on every state-changing request. A strict Content Security Policy uses hashes with no inline scripts allowed, and the browser may connect only to its own origin. `frame-ancestors 'none'`, HSTS, and `nosniff` are sent. | `src/lib/http.ts`, `astro.config.mjs`, `scripts/check-csp.sh` |
| **A member abuses their access** | Members are read-only. Only managers invite or disable. The last manager cannot be demoted or disabled, including under concurrent requests. Invitations are rate limited. Managers' actions are in the audit log. | `src/lib/auth/admin.ts`, `test/hardening.test.ts` |
| **A leaked backup or database export** | It holds emails, roles and the audit log, but no API keys or tokens (those are Worker secrets) and no usable session or sign-in material (only hashes are stored). Keep backups private anyway: the emails are personal data. | `migrations/`, `scripts/update.mjs` |
| **A leaked API credential** | Each is narrowly scoped, so a leak allows little: read-only calendar for one calendar, a MealQ token that can only read one household's meal plan, a Resend key that can only send. Rotate at the source and re-set the secret. | `docs/you-are-the-host.md` |
| **A widget (plugin) misbehaves** | A plugin receives only the secrets it declared, can reach only the hosts it declared over HTTPS, with a timeout, and redirects are re-checked. This stops mistakes and surprises in reviewed code. | `src/plugins/fetchPolicy.ts`, `src/plugins/host.ts` |
| **An upstream is down or slow** | Widgets time out after 8 seconds and fall back to a stale copy for up to 24 hours. Error details are logged server-side, never sent to the browser. | `src/plugins/host.ts` |
| **Software leaks data by itself** (telemetry, tracking) | None exists, and tests fail if a new network destination, tracking API or dependency appears. | `test/egress.test.ts`, `scripts/check-bundle.sh` |

## What is not defended against

- **Control of your Cloudflare account.** Whoever can log in there can read the database and secrets, change the
  code, and mint sessions. Use two-factor authentication.
- **Control of a member's mailbox.** Sign-in is by emailed link, so the mailbox is the account. A manager can
  disable the member and revoke their devices once they notice.
- **A malicious plugin.** Plugins run inside the same Worker as the app. The restrictions above catch mistakes,
  not hostile code, so only add plugins you have read.
- **A malicious release or dependency that you choose to deploy.** Signed tags, a pinned and audited dependency
  list, and reading the changelog and diff before updating reduce the risk but cannot remove it.
- **A compromised device that is currently signed in.** It can read what that member can read until it is signed
  out.
- **Timing differences.** A known address takes a few milliseconds longer to answer than an unknown one (it
  writes a token). Responses are identical and rate limits make probing impractical, but it is not constant-time.
- **A newly disclosed vulnerability in a dependency before you update.** `npm run verify` blocks releases with
  known high or critical advisories, except those accepted with a written reason in `scripts/audit.mjs`
  (currently two, both build- or dev-time only).

## Assumptions

- Cloudflare, Resend, and Google operate their services as documented, and HTTPS protects traffic in transit.
- The household's own domain and DNS are controlled by the household.
- The operator keeps the software reasonably up to date and has read the changelog for what they deploy.

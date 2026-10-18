# Security and privacy

This dashboard is **self-hosted**: you deploy it to your own Cloudflare account, and the person who wrote the
software never operates it, receives its data, or holds its secrets. This page says exactly what talks to whom,
what is stored where, and where the remaining trust sits.

## What the deployed Worker talks to

Nothing else. A test (`test/egress.test.ts`) fails if a new destination appears in the code without being added
here.

| Destination | Why | What is sent |
|---|---|---|
| `api.resend.com` | Sign-in and invite emails, and the optional emails to managers about reward requests and timers, from your Resend account | Recipient address and the message |
| `oauth2.googleapis.com`, `www.googleapis.com` | Calendar widget, with your service account | A signed token request, then a read-only calendar query |
| `api.open-meteo.com` | Forecast in the calendar's day headers, only if you set `weather` for the calendar | Your latitude and longitude, rounded to two decimals (about 1 km), and your time zone. Nothing that identifies you or the household |
| `api-web.nhle.com` | An NHL team's schedule, only if you add an NHL calendar under the calendar's `feeds` | A plain GET for the team's season schedule. Nothing about you or the household |
| `calendar.google.com` | The US holidays calendar, only if you add the `us-holidays` preset | A plain GET of Google's public holiday feed. Nothing about you or the household |
| Any `.ics` host you list under the calendar's `feeds` | Extra public calendars | A plain GET of the URL you chose. Only public links belong here |
| The MealQ host you configure (default: MealQ's public API, `api-mealq.plantolive.app`) | Meal plan widget | Your MealQ access token and a date range |
| A browser's push service: `fcm.googleapis.com` (Chrome, Edge, Android), `web.push.apple.com` (Safari, iPhone, iPad), `updates.push.services.mozilla.com` (Firefox) or `*.notify.windows.com` (Windows) | The optional "time is up" alert for a screen time timer, and the optional notifications to managers about reward requests and timers, **only if you set the `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` secrets** and a member or manager turns alerts on for a device | An encrypted message (only that device can read it) with a signed token proving it came from your Worker. The address is the one the member's own browser handed over, and it is refused unless it is on one of these services (`PUSH_HOSTS` in `src/lib/push.ts`). The push service sees that your Worker sent a message to that device, not what it says |

The browser only ever talks to your own domain: the Content Security Policy is `default-src 'none'` with
`connect-src 'self'`, and the build fails if any client file references an external host
(`scripts/check-bundle.sh`).

## What is stored, and where

All in **your** Cloudflare account (D1 for everything below except the cache, which is KV):

- **Access:** users (email, role), invites, hashed sessions and sign-in tokens and codes (only SHA-256 digests are
  stored), rate-limit counters, and a 400-day audit log.
- **The household:** its people (name, colour, match words), each person's chores, which days each was ticked off (kept
  60 days) or skipped (kept 7 days), all-done bonuses, points history, rewards, reward requests and household goals.
  Only managers can change chores, rewards, goals and people; any signed-in member can tick chores off and ask for a reward.
- **Screen time:** each person's minutes ledger, daily allowance, running timer and chosen timer sound.
- **Lists:** shared lists and their items. Any signed-in member can read and change them.
- **Settings:** which widgets and built-ins a manager has switched off, and each manager's notification choices.
- **Alert devices** (only if you turned alerts on): the browser address and encryption keys of each device that asked
  for "time is up" alerts, and of each manager device that asked for notifications.
- **Cache (KV):** a short cache of widget data, with a stale copy kept up to 24 hours.

Secrets are Worker secrets. Nothing is copied anywhere else. Request logging (`observability`) is **off** by default; if you turn it on
for debugging, logs live in your account and can include sign-in addresses.

## Telemetry

There is none in the app: no analytics, error reporting, update checks or "phone home". Two developer tools have
their own telemetry, and this project switches both off for everything it launches (`npm run ...`, `setup`,
`update`, the test scripts):

- **Astro** (CLI usage data, opt-out): `ASTRO_TELEMETRY_DISABLED=1`.
- **Wrangler** (usage metrics and a dependency inventory sent to Cloudflare): `send_metrics: false` and
  `dependencies_instrumentation` off in `wrangler.jsonc`, plus `WRANGLER_SEND_METRICS=false`.

Running `astro` or `wrangler` directly, outside these scripts, uses your own machine-wide settings: run
`npx astro telemetry disable` if you want that off too. `npm ci` and `npm audit` talk to the npm registry, which is
how dependencies are fetched and checked.

## Supply chain

The main thing that could ever harm a household is a **malicious release** of this project or of one of its
dependencies, so:

- **Few dependencies.** Runtime: `astro`, `@astrojs/cloudflare`, `@astrojs/svelte`, `svelte`, `zod`. A test pins
  the list, so adding one is a visible decision. Web Push is implemented with the Web Crypto API rather than a library.
- **Locked and audited.** `npm ci` installs exactly `package-lock.json`. `npm run verify` fails on any high or
  critical advisory unless it is accepted in `scripts/audit.mjs` with a written reason.
- **Tagged releases.** Releases are git tags created by the release workflow (`docs/releasing.md`). `npm run update`
  warns if you are about to deploy something that is untagged.
- **You choose when to update.** Nothing updates itself. Before deploying a new release, read `CHANGELOG.md` and
  look at the change: `git diff v0.1.0 v0.2.0 -- . ':!package-lock.json'`, plus the lockfile if dependencies moved.
  Pin to a tag rather than following `main`.
- **Plugins run inside the Worker.** Their network and secret restrictions stop mistakes, not malicious code.
  Add only plugins you have read.

## What this does not protect against

- A release you chose to deploy that turns out to be malicious. Verified signatures and reading diffs reduce this;
  they do not remove it.
- Someone with access to your Cloudflare account: they can read your database and secrets.
- A compromised mailbox: sign-in is by emailed link, so mailbox access is account access (managers can disable
  members and revoke devices).

## Reporting a vulnerability

Please report privately rather than in a public issue. Use the repository's **Security** tab ("Report a
vulnerability") on the host where you found this project. Include the version (`package.json`) and steps to
reproduce. Do not include real household data.

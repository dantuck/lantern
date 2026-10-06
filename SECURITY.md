# Security and privacy

This dashboard is **self-hosted**: you deploy it to your own Cloudflare account, and the person who wrote the
software never operates it, receives its data, or holds its secrets. This page says exactly what talks to whom,
what is stored where, and where the remaining trust sits.

## What the deployed Worker talks to

Nothing else. A test (`test/egress.test.ts`) fails if a new destination appears in the code without being added
here.

| Destination | Why | What is sent |
|---|---|---|
| `api.resend.com` | Sign-in and invite emails, from your Resend account | Recipient address and the message |
| `oauth2.googleapis.com`, `www.googleapis.com` | Calendar widget, with your service account | A signed token request, then a read-only calendar query |
| `api.open-meteo.com` | Forecast in the calendar's day headers, only if you set `weather` for the calendar | Your latitude and longitude, rounded to two decimals (about 1 km), and your time zone. Nothing that identifies you or the household |
| The MealQ host you configure (default: MealQ's public API, `api-mealq.plantolive.app`) | Meal plan widget | Your MealQ access token and a date range |

The browser only ever talks to your own domain: the Content Security Policy is `default-src 'none'` with
`connect-src 'self'`, and the build fails if any client file references an external host
(`scripts/check-bundle.sh`).

## What is stored, and where

All in **your** Cloudflare account: users, invites, hashed sessions and sign-in tokens (only SHA-256 digests are
stored), rate-limit counters, a 400-day audit log, the household's chores (with when each was ticked off, kept 60 days) and shared lists (any signed-in member can read and change them), which widgets a manager has switched off, and a short cache of widget data in KV. Secrets are Worker
secrets. Nothing is copied anywhere else. Request logging (`observability`) is **off** by default; if you turn it on
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
  the list, so adding one is a visible decision.
- **Locked and audited.** `npm ci` installs exactly `package-lock.json`. `npm run verify` fails on any high or
  critical advisory unless it is accepted in `scripts/audit.mjs` with a written reason.
- **Signed releases.** Releases are git tags signed by the maintainer (`docs/releasing.md`). `npm run update`
  warns if you are about to deploy something that is untagged or whose signature does not verify.
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

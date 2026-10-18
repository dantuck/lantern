# Lantern

A private dashboard for one household, installable as a PWA: a shared **calendar** and **meal plan**, **chores** with
points, rewards and household goals, **screen time** with shared countdown timers, and shared **lists**. Astro + Svelte on
Cloudflare Workers, with data in your own D1 database.

- **Self-hosted.** You deploy it to your own Cloudflare account. Nobody else, including its author, runs it or sees its data.
- **Sign-in is by emailed link only.** There is no self sign-up and no passwords. **Managers** invite everyone else, as
  members or managers. An address that has not been invited gets exactly the same response as one that has.
- **Members take part, managers run it.** Any signed-in member can tick chores, ask for rewards, use screen time and edit
  lists. Only managers change chores, rewards, people, invites and settings. Calendar and meal plan are read-only: nothing
  is ever written to Google or MealQ.
- **Widgets are plugins** (Google Calendar and the MealQ meal plan today), each limited to the hosts and secrets it declares.
- **Built in:** people with their own colours, chores, points, rewards, goals, screen time, lists, a **wall display** mode for
  a tablet or monitor on the kitchen wall, optional "time is up" and manager push alerts, and a no-sign-in **demo** at `/demo`.
- **No telemetry.** No analytics, error reporting, update checks or phone-home.

## Where to read next

| I want to... | Read |
|---|---|
| Set it up for my household | [`docs/setup-guide.md`](docs/setup-guide.md), step by step |
| Know what I am now responsible for | [`docs/you-are-the-host.md`](docs/you-are-the-host.md) |
| See what it can do and how to configure each feature | [`docs/features.md`](docs/features.md) |
| Understand how it is built | [`docs/architecture.md`](docs/architecture.md) |
| See what it talks to and stores | [`SECURITY.md`](SECURITY.md), [`PRIVACY.md`](PRIVACY.md) |
| See who it defends against, and who it does not | [`docs/threat-model.md`](docs/threat-model.md) |
| Write a plugin | [`src/plugins/README.md`](src/plugins/README.md) |
| Connect MealQ | [`docs/mealq-api-contract.md`](docs/mealq-api-contract.md) |
| Publish a release | [`docs/releasing.md`](docs/releasing.md) |
| Check the PWA by hand | [`docs/pwa-manual-check.md`](docs/pwa-manual-check.md) |

Releases are git tags with notes in [`CHANGELOG.md`](CHANGELOG.md). Licensed under [Apache-2.0](LICENSE) (see
[`NOTICE`](NOTICE)).

## Develop locally

Needs Node 22.22 or newer.

```bash
npm ci                                # also creates wrangler.jsonc and dashboard.config.ts from the templates
cp .dev.vars.example .dev.vars        # set BOOTSTRAP_MANAGER_EMAIL to your address
npm run db:migrate:local
npm run dev                           # http://localhost:4321, runs on the real Workers runtime (workerd)
```

Open `/demo` to browse the whole UI with sample data (no sign-in, nothing real). Sign in at `/login`. In dev there is no
email: the sign-in link and code are printed in the dev server output. Open the link in the **same browser** that requested
it (links are bound to the requesting browser). The built-in `example` widget is shown in dev only.

| Command | What it does |
|---|---|
| `npm run verify` | Unit tests, type-check, build, **no server secrets or external hosts in the client bundle**, dependency audit |
| `npm run verify:e2e` | Boots real servers: invites, roles and devices flows, the plugin API, production CSP and static headers |
| `npm test` | Unit tests only |
| `npm run check` | Type-check (`astro check`) |
| `npm run migrations:seal` | Record the hash of a new migration (see [`docs/releasing.md`](docs/releasing.md)) |

Both verify commands must pass before deploying. [`docs/pwa-manual-check.md`](docs/pwa-manual-check.md) is the one manual
step (service worker and offline behaviour). How the code is laid out is in [`docs/architecture.md`](docs/architecture.md).

## Deploy

Your settings live in two **untracked** files, created from templates by `npm ci` (or `npm run init`) and never
overwritten: `wrangler.jsonc` (from `wrangler.template.jsonc`) and `dashboard.config.ts` (from
`dashboard.config.example.ts`). Edit those, not the templates, so pulling updates never conflicts with your domain or
database id.

Everything runs on Cloudflare's free tier plus Resend's free tier.

**Fastest path:** `npm run setup` walks through everything below on your machine with your own Cloudflare login
(`npx wrangler login` first). It asks which account to use and pins it, writes your local config, creates the database and
tables, runs `verify`, deploys, and sets the secrets (typed hidden, sent straight to Cloudflare, never written to disk).
`npm run setup -- --dry-run` asks the questions and shows what it would do without changing anything. It is safe to
re-run. You still need your domain on Cloudflare and a verified sending domain in Resend. The manual steps follow for
reference.

1. **Domain.** Put your domain on Cloudflare. In `wrangler.jsonc` set `routes[0].pattern` to the hostname (for example
   `dashboard.example.com`) and `vars.APP_ORIGIN` to `https://` plus that hostname. The app refuses to send any link if
   `APP_ORIGIN` is missing, not `https`, or still `localhost`. `workers_dev` and preview URLs are off on purpose: the app
   is reachable only on your domain. To move from an older hostname, list it in the optional `REDIRECT_HOSTS` variable
   (comma-separated) and it will `308` to the new one.
2. **Database.** `npx wrangler d1 create lantern`, paste the printed `database_id` into `wrangler.jsonc`, then
   `npm run db:migrate:remote`.
3. **Cache.** The `CACHE` KV namespace is provisioned on first deploy (or run `npx wrangler kv namespace create CACHE` and
   add its `id`).
4. **Email (Resend).** Create an account, add and verify your sending domain (SPF and DKIM records), and add a DMARC
   record (`v=DMARC1; p=quarantine; rua=mailto:you@yourdomain`). Create an API key with *sending access* only. Set
   `vars.MAIL_FROM` to an address on that domain. Leave **link and open tracking off** (the default): tracking rewrites
   URLs and breaks the sign-in link.
5. **Secrets.**
   ```bash
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put BOOTSTRAP_MANAGER_EMAIL     # your address; creates the first manager
   # Calendar plugin (service-account setup is in docs/setup-guide.md):
   npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
   npx wrangler secret put GOOGLE_CALENDAR_ID
   # MealQ plugin (docs/mealq-api-contract.md); also gives the calendar its meals:
   npx wrangler secret put MEALQ_API_TOKEN             # a MealQ access token; it identifies the household
   # Optional "time is up" and manager push alerts (npm run push:keys makes the pair):
   npx wrangler secret put VAPID_PUBLIC_KEY
   npx wrangler secret put VAPID_PRIVATE_KEY
   ```
6. **Configure widgets** in `dashboard.config.ts` (the calendar's `timeZone`, feeds, weather and meals, and MealQ's
   `apiHost`). Options are in [`docs/features.md`](docs/features.md). Your household can be listed under `people` there, or
   added later by a manager on the Admin page.
7. **Ship.** `npm run verify && npx wrangler deploy`.
8. **First sign-in.** Open the site, enter the bootstrap address, click the emailed link. Then **delete the bootstrap
   secret**: `npx wrangler secret delete BOOTSTRAP_MANAGER_EMAIL`. (It only works while there are zero users, but there is
   no reason to keep it.)
9. **Invite the household** from *Admin*, and add the household's people. Run through
   [`docs/pwa-manual-check.md`](docs/pwa-manual-check.md) on a phone.

### Optional: "time is up" alerts when the page is closed

Set the `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` secrets and the Worker's once-a-minute schedule (`"main":
"./src/worker.ts"` and `"triggers": { "crons": ["* * * * *"] }` in `wrangler.jsonc`; new installs already have both). A
button then appears on each person's page to alert that device when their time is up, and managers can allow push
notifications on their own devices under *Admin → Your alerts*. It uses the browser's own push service, so it is off and
silent until you set it up; [`SECURITY.md`](SECURITY.md) lists what it contacts. On iPhone and iPad, add the app to the
Home Screen first. The steps are in
[`docs/setup-guide.md`](docs/setup-guide.md#8-optional-time-is-up-alerts-on-a-locked-ipad-or-phone).

### Optional second layer

Put the hostname behind Cloudflare Access with an email allow-list. The app does not need it, but it costs nothing and
hides the login page from strangers.

## Updating

```bash
git fetch --tags && git checkout v0.2.0     # or `git pull`; read CHANGELOG.md first
npm ci
npm run update                              # add -- --dry-run to preview
```

`npm run update` first confirms Wrangler is logged in to the account in `wrangler.jsonc` and can reach the database
(stopping with the fix, before anything is changed, if not), then runs `verify`, takes a database backup (`backups/`,
mode 600, git-ignored), applies any new migrations, then deploys, and records what it deployed in `.deployed.json`. It
shows the changelog entries since your last deploy and stops on anything marked **Action required** until you confirm. It
warns if the checkout is not a release tag, has local changes, or is older than what you last deployed. Migrations only go
forward and each release is compatible with the one before it, so `npx wrangler rollback` is a safe way to undo a bad
deploy. Nothing contacts anyone but your own Cloudflare account.

## How access works

1. You enter an email. The response is always the same ("if that address is invited, a link is on its way").
2. If the address belongs to an active user, a single-use link and an 8-digit code are emailed, valid 10 minutes. Only
   their SHA-256 digests are stored.
3. The link carries its token in the URL fragment (never sent to servers, logs or `Referer`). It only works in the browser
   that asked for it (a host-only `__Host-` cookie holds a nonce), so email scanners, forwarded links and
   shoulder-surfed links are useless. The code works the same way, for reading the email on another device, and is burned
   after 5 wrong tries.
4. Success starts a session: random 256-bit id (digest stored), HttpOnly, Secure, SameSite=Lax cookie. 30 days idle, 90
   days absolute.
5. Every route except sign-in, the product page, the demo and the static files the browser needs is denied without a
   session. `/admin` and `/chores/manage` also need the manager role. Everyone can see and revoke their own devices;
   managers can revoke anyone's.
6. A member's invite email also carries a one-click **Join** link (single use, 2 days). Manager invites never do.

Other protections: strict CSP (hashes, no inline scripts), HSTS, `frame-ancestors 'none'`, a same-origin `Origin` check on
every state-changing request, atomic rate limits (per IP, per address-and-IP, an address-wide backstop, and limits on
codes, confirmations, invite links and invitations), an audit log (400 days), and last-manager protection that holds under
concurrency. [`docs/threat-model.md`](docs/threat-model.md) has the full list.

## Operating it

- **Not sure everything is healthy?** `npm run doctor` is a read-only check of your settings, Cloudflare login, secrets
  (names only), database, members and backups, with the fix for each problem. `npm run doctor -- --offline` skips the
  Cloudflare calls.
- **Someone lost a phone or left the household:** *Devices* (your own) or *Admin → Signed-in devices* (anyone's) to sign
  devices out; *Admin → Members → Disable* removes access and signs them out everywhere immediately.
- **Locked out of every manager account** (the last manager is protected from being demoted or disabled in the app, but a
  lost mailbox can still do it): promote an existing user directly in the database, then sign in normally with a fresh
  link:
  ```bash
  npx wrangler d1 execute lantern --remote --command "UPDATE users SET role = 'manager', disabled_at = NULL WHERE email = 'you@example.com'"
  ```
- **Rotate a plugin secret:** `wrangler secret put` it again; the cache refreshes within the plugin's TTL (60 seconds for
  MealQ, 5 minutes for the calendar).
- **Rotate the push keys:** run `npm run push:keys`, set both secrets again, and have devices turn alerts on again.
- **Turn a feature off:** *Admin → Widgets and features* hides a widget, Chores or Lists without deleting its data.
- **Backups:** `npx wrangler d1 export lantern --remote --output backup.sql`. It holds everything the household has
  entered (members, chores, points, lists, the audit log) and the push addresses and keys of alert devices. Keep it
  private. It holds none of your secrets.
- **Offline copies:** the service worker keeps a copy of the dashboard for 24 hours so it opens without signal, and wipes
  it on sign-out or revocation. To disable that entirely, set `OFFLINE_PAGES = false` in `public/sw.js` and bump `VERSION`.
- **Dependency audit:** `scripts/audit.mjs` fails the build on any high or critical advisory not explicitly accepted. An
  exception needs a written reason in that file.

## Known limits

- A known address takes a few milliseconds longer to answer than an unknown one (it writes a token). Responses are
  identical and rate limits make probing impractical, but it is not constant-time.
- Plugins run in the same Worker as the app. Their network and secret restrictions stop mistakes, not malicious code: only
  add plugins you have read.
- Requesting a second sign-in link replaces the first (only the newest link works in that browser).
- Screen time is a count, not a lock. Honouring it on the device is up to the household.
- Recurrence rules in `.ics` calendar feeds are not expanded.

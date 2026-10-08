# Lantern

A private dashboard for one household (calendar, meals, chores, rewards, shared goals, screen time and lists), installable as a PWA. Astro + Svelte on Cloudflare Workers.
Sign-in is by emailed magic link only; **managers** invite everyone else. Widgets are plugins (Google Calendar and MealQ meal plan today). Built in: **people** with their own colours, **chores** and shared **lists**, and a **wall display** mode for a tablet or monitor on the kitchen wall.

- Nobody can edit anything through it: the only write paths are sign-in, sign-out and manager invites.
- No self sign-up. An address that has not been invited gets exactly the same response as one that has.
- **New here?** [`docs/setup-guide.md`](docs/setup-guide.md) walks through everything, step by step. [`docs/you-are-the-host.md`](docs/you-are-the-host.md) explains what you are now responsible for.
- What it talks to, what is stored, and what telemetry exists (none): [`SECURITY.md`](SECURITY.md). Who it defends against, and what it does not: [`docs/threat-model.md`](docs/threat-model.md).
- Licensed under [Apache-2.0](LICENSE) (see [`NOTICE`](NOTICE)). Privacy policy: [`PRIVACY.md`](PRIVACY.md).
- Releases are git tags with notes in [`CHANGELOG.md`](CHANGELOG.md), created by a release workflow (see [`docs/releasing.md`](docs/releasing.md)).
- Writing a plugin: [`src/plugins/README.md`](src/plugins/README.md). MealQ API requirements: [`docs/mealq-api-contract.md`](docs/mealq-api-contract.md).

## Develop locally

Needs Node 22.12 or newer.

```bash
npm ci                                # also creates wrangler.jsonc and dashboard.config.ts from the templates
cp .dev.vars.example .dev.vars        # set BOOTSTRAP_MANAGER_EMAIL to your address
npm run db:migrate:local
npm run dev                           # http://localhost:4321, runs on the real Workers runtime (workerd)
```

Open `/demo` to browse the whole UI with sample data (no sign-in, nothing real). Sign in at `/login`. In dev there is no email: the sign-in link is printed in the dev server output (`npx astro dev logs`).
Open it in the **same browser** that requested it (links are bound to the requesting browser).

| Command | What it checks |
|---|---|
| `npm run verify` | Unit tests, type-check, build, **no server secrets in the client bundle**, dependency audit |
| `npm run verify:e2e` | Boots real servers: invites/roles/devices flows, plugin API, production CSP and static headers |

Both must pass before deploying. `docs/pwa-manual-check.md` is the one manual step (service worker and offline behaviour).

## Deploy

Your settings live in two **untracked** files, created from templates by `npm ci` (or `npm run init`) and never overwritten: `wrangler.jsonc` (from `wrangler.template.jsonc`) and `dashboard.config.ts` (from `dashboard.config.example.ts`). Edit those, not the templates, so pulling updates never conflicts with your domain or database id.

Everything runs on Cloudflare's free tier plus Resend's free tier.

**Fastest path:** `npm run setup` walks through everything below on your machine with your own Cloudflare login (`npx wrangler login` first): it asks which account to use and pins it, writes your local config, creates the database and tables, runs `verify`, deploys, and sets the secrets (typed hidden, sent straight to Cloudflare, never written to disk). `npm run setup -- --dry-run` asks the questions and shows what it would do without changing anything. It is safe to re-run. You still need your domain on Cloudflare and a verified sending domain in Resend (step 4). The manual steps follow for reference.

1. **Domain.** Put your domain on Cloudflare. In `wrangler.jsonc` set `routes[0].pattern` to the hostname (e.g. `dashboard.example.com`) and `vars.APP_ORIGIN` to `https://` plus that hostname. The app refuses to send any link if `APP_ORIGIN` is missing, not `https`, or still `localhost`. `workers_dev` and preview URLs are off on purpose: the app is reachable only on your domain.
2. **Database.** `npx wrangler d1 create lantern`, paste the printed `database_id` into `wrangler.jsonc`, then `npm run db:migrate:remote`.
3. **Cache.** The `CACHE` KV namespace is provisioned on first deploy (or run `npx wrangler kv namespace create CACHE` and add its `id`).
4. **Email (Resend).** Create an account, add and verify your sending domain (SPF and DKIM records), and add a DMARC record (`v=DMARC1; p=quarantine; rua=mailto:you@yourdomain`). Create an API key with *sending access* only. Set `vars.MAIL_FROM` to an address on that domain. Leave **link and open tracking off** (the default): tracking rewrites URLs and breaks the sign-in link.
5. **Secrets.**
   ```bash
   npx wrangler secret put RESEND_API_KEY
   npx wrangler secret put BOOTSTRAP_MANAGER_EMAIL     # your address; creates the first manager
   # Calendar plugin (see src/plugins/calendar/plugin.ts for service-account setup):
   npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON
   npx wrangler secret put GOOGLE_CALENDAR_ID
   # MealQ plugin, once the API exists (docs/mealq-api-contract.md):
   npx wrangler secret put MEALQ_API_TOKEN          # a MealQ Access Token; it identifies the household
   ```
6. **Configure widgets** in `dashboard.config.ts` (calendar `timeZone`, MealQ `apiHost`). Optionally list your household under `people` (see below) and add `weather` to the calendar.
7. **Ship.** `npm run verify && npx wrangler deploy`.
8. **First sign-in.** Open the site, enter the bootstrap address, click the emailed link. Then **delete the bootstrap secret**: `npx wrangler secret delete BOOTSTRAP_MANAGER_EMAIL`. (It only works while there are zero users, but there is no reason to keep it.)
9. **Invite the household** from *Admin*. Run through `docs/pwa-manual-check.md` on a phone.

### People, weather and chores

In `dashboard.config.ts`:

```ts
people: [
  { name: 'Gru', color: '#e8590c' },                                  // color is optional
  { name: 'Minions', match: ['Minion', 'Kevin', 'Bob'] },             // extra words that put an event on their calendar
],
plugins: [
  { id: 'calendar', config: { timeZone: 'America/Chicago', weather: { latitude: 41.88, longitude: -87.63, units: 'imperial' } } },
]
```

**Extra calendars:** overlay public calendars under the calendar's `feeds`, each with its own colour and filter chip. Three spellings: `{ preset: 'nhl-det' }` (a known calendar from `src/plugins/calendar/presets.ts`: every NHL team plus US holidays; `name` and `color` can be overridden), `{ nhl: 'DET', name: 'Red Wings' }` (an NHL team, read live from the NHL's public schedule API), or `{ name, url, color }` for any public `.ics` / `webcal://` link. Feed hosts are added to the plugin's outbound allowlist. A feed that is down is skipped; the rest still load. Feed URLs live in `dashboard.config.ts`, so only use public ones. Recurrence rules in `.ics` feeds are not expanded.


**Meals on the calendar:** add `meals: {}` to the calendar's config. It uses the host from the MealQ widget's entry (or set `apiHost` yourself) and reuses the `MEALQ_API_TOKEN` secret, so there is nothing new to set up. Dinner shows by default; `slots: ['breakfast', 'lunch', 'dinner']` picks the meals, and the toggles above the calendar change them for that browser. Meals appear in a row above the hours in the Day and Week views, as chips in Month, and as rows in the Agenda. Select one to see its prep time, ingredients and recipe link. It asks MealQ for a week back to about three weeks ahead. If the token is missing or MealQ is down, the calendar loads without meals. Nothing is ever written to MealQ.

An event goes on a person's calendar when their name (or a `match` word) appears in its title, such as "Ballet: Agnes"; events that name nobody are "Family". Colours, the filter chips and the **Day** view's per-person columns come from this list, and so do the columns on the **Chores** page. Only the event *title* is looked at, in the browser; nothing else about an event is read. `weather` is optional: it adds a forecast to the calendar and sends your coordinates (rounded to about 1 km) to Open-Meteo, a free service that needs no key.

Chores, rewards and lists are stored in your D1 database, so run the new migrations (`npm run update`, or `npm run db:migrate:remote`). Any signed-in member can tick chores off, ask for a reward and use the lists; only **managers** create and change chores and rewards.

**Chores (one routine per person).** Each person has a single routine, split by time of day (morning, afternoon, evening, any time), and "Anyone" has one too for shared chores. A manager adds chores to it, giving each a time of day, the days it repeats (every day, weekdays, certain days) or a single date for a one-off. Ticks are stored per day, so each chore starts fresh every day it is scheduled; nothing needs to be reset. Manage them at **Chores → Manage** (`/chores/manage`, managers only).

**Rewards.** Give each chore some points, and optionally an *all-done bonus* for each time of day, paid when every chore due then is ticked. Points go to the person the chore is for (chores for "Anyone" earn none) and are taken back if a chore is un-ticked. Managers add rewards with a point cost; anyone can ask for one they can afford from the person's column on the Chores page, and a manager approves or denies it there, which deducts the points. A reward can be limited to certain people, so only they can ask for it. Managers can also add or remove points by hand. Points need `people` in your config. When someone ticks their last chore of the day, a burst of confetti celebrates (a smaller one for a time of day that has an all-done bonus); it is skipped on devices set to reduce motion. The **wall display** button in the side bar hides the navigation, enlarges everything, goes fullscreen and asks the screen to stay awake; the choice is remembered per browser.

**Screen time.** A reward can add minutes to a person's *screen time bank*, and a manager can also give each person a *daily allowance* (optionally different on weekends) from the person's page, **Manage**. The allowance comes back every day and is not saved up; earned minutes are kept in the bank. Spending ("Use 15") takes the day's allowance first, then the bank. The dashboard only keeps count: honouring it on the device is up to the household. Each person has their own page at `/chores/<person>`, linked from their name on the Chores page, where managers can manage that person's chores, points and screen time.

Managers can switch any widget, and the built-in Chores and Lists, on or off under **Admin → Widgets and features**. `dashboard.config.ts` still decides which widgets exist; the switch only hides them (their data is kept).

Optional second layer: put the hostname behind Cloudflare Access with an email allow-list. The app does not need it, but it costs nothing and hides the login page from strangers.

## Updating

```bash
git fetch --tags && git checkout v0.2.0     # or `git pull`; read CHANGELOG.md first
npm ci
npm run update                              # add -- --dry-run to preview
```

`npm run update` first confirms Wrangler is logged in to the account in `wrangler.jsonc` and can reach the database (stopping with the fix, before anything is changed, if not), then runs `verify`, takes a database backup (`backups/`, mode 600, git-ignored), applies any new migrations, then deploys, and records what it deployed in `.deployed.json`. It shows the changelog entries since your last deploy and stops on anything marked **Action required** until you confirm. It warns if the checkout is not a release tag with a verifiable signature, has local changes, or is older than what you last deployed. Migrations only go forward and each release is compatible with the one before it, so `npx wrangler rollback` is a safe way to undo a bad deploy. Nothing contacts anyone but your own Cloudflare account.

## How access works

1. You enter an email. The response is always the same ("if that address is invited, a link is on its way").
2. If the address belongs to an active user, a single-use link is emailed, valid 10 minutes. Only its SHA-256 is stored.
3. The link carries its token in the URL fragment (never sent to servers, logs or `Referer`). It only works in the browser that asked for it (a host-only `__Host-` cookie holds a nonce), so email scanners, forwarded links and shoulder-surfed links are useless.
4. Success starts a session: random 256-bit id (hash stored), HttpOnly, Secure, SameSite=Lax cookie. 30 days idle, 90 days absolute.
5. Every route except sign-in is denied without a session. `/admin` also needs the manager role. Everyone can see and revoke their own devices; managers can revoke anyone's.

Other protections: strict CSP (hashes, no `unsafe-inline` for scripts), HSTS, `frame-ancestors 'none'`, same-origin `Origin` check on every state-changing request, atomic rate limits (per IP, per address-and-IP, and an address-wide backstop), an audit log (400 days), and last-manager protection that holds under concurrency.

## Operating it

- **Not sure everything is healthy?** `npm run doctor` is a read-only check of your settings, Cloudflare login, secrets (names only), database, members and backups, with the fix for each problem. `npm run doctor -- --offline` skips the Cloudflare calls.
- **Someone lost a phone / left the household:** *Devices* (own) or *Admin → Signed-in devices* (anyone) to sign devices out; *Admin → Members → Disable* removes access and signs them out everywhere immediately.
- **Locked out of every manager account** (the last manager is protected from being demoted or disabled in the app, but a lost mailbox can still do it): promote an existing user directly in the database, then sign in normally with a fresh link:
  ```bash
  npx wrangler d1 execute lantern --remote --command "UPDATE users SET role = 'manager', disabled_at = NULL WHERE email = 'you@example.com'"
  ```
- **Rotate a plugin secret:** `wrangler secret put` it again; the cache refreshes within the plugin's TTL.
- **Backups:** `npx wrangler d1 export lantern --remote --output backup.sql` (users, invites, audit log; nothing else of value is stored).
- **Offline copies:** the service worker keeps a copy of the dashboard for 24 hours so it opens without signal, and wipes it on sign-out or revocation. To disable that entirely, set `OFFLINE_PAGES = false` in `public/sw.js` and bump `VERSION`.
- **Dependency audit:** `scripts/audit.mjs` fails the build on any high/critical advisory not explicitly accepted. One is accepted (`http-cache-semantics`, an Astro build-time dependency that is not shipped); the reasoning is recorded in that file.

## Known limits

- A known address takes a few milliseconds longer to answer than an unknown one (it writes a token). Responses are identical and rate limits make probing impractical, but it is not constant-time.
- Plugins run in the same Worker as the app. Their network and secret restrictions stop mistakes, not malicious code: only add plugins you have read.
- Requesting a second sign-in link replaces the first (only the newest link works in that browser).

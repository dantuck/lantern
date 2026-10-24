# Architecture

How Lantern is put together. For what each feature does for the household, see [`features.md`](features.md). For who it
defends against, see [`threat-model.md`](threat-model.md).

## The shape of it

One Cloudflare Worker serves everything: the pages, the JSON endpoints and the static files.

```
 browser / PWA ──HTTPS──▶  Worker  (src/worker.ts)
                            │  fetch      Astro's handler: middleware, pages, API routes
                            │  scheduled  once a minute: sends "time is up" push alerts
                            ├── D1 (DB)      users, sessions, chores, rewards, timers, lists, audit log ...
                            ├── KV (CACHE)   widget data, kept for a short time and as a 24-hour fallback
                            ├── ASSETS       the built static files in dist/
                            └── outbound     only the hosts listed in SECURITY.md
```

| Piece | What it is |
|---|---|
| **Astro 7** (`output: 'server'`) | Server-rendered pages. Pages are `.astro`; interactive parts are Svelte islands. |
| **Svelte 5** | The calendar, chores, lists and timer screens. Hydrated with `client:load` or `client:visible`. |
| **UnoCSS** | Utility classes plus a few shortcuts (`uno.config.ts`, `src/styles/global.css`). No runtime CSS. |
| **Cloudflare Workers** | Runtime (workerd), with `nodejs_compat`. Local dev runs on the same runtime. |
| **D1** | The only database. Schema is `migrations/*.sql`, applied forward-only. |
| **KV** | A cache for plugin output. Nothing else is stored there. |
| **zod** | Validates plugin config and every JSON request body. |

Runtime dependencies are `astro`, `@astrojs/cloudflare`, `@astrojs/svelte`, `svelte` and `zod`. A test pins that list.
Web Push (VAPID signing and message encryption) is written against the Web Crypto API instead of using a library.

## Request flow

Every request goes through `src/middleware.ts`, in this order:

1. **Retired hostnames.** If the host is listed in `REDIRECT_HOSTS`, answer `308` to the same path on `APP_ORIGIN`.
2. **Origin check.** Any method other than `GET`, `HEAD` or `OPTIONS` must carry an `Origin` equal to the site's own.
3. **Canonical path.** The path is percent-decoded the way Astro's router sees it, so `/%61dmin` is `/admin`. Every rule
   below uses this form.
4. **Session.** `__Host-session` is looked up (`src/lib/auth/sessions.ts`). A valid one puts `locals.user`,
   `locals.session` and `locals.disabled` (the features a manager has switched off) on the request.
5. **Default deny.** A path that is not in the public list (`src/lib/http.ts`) needs a session. Signed out, `/api/*` gets
   `401`, `/` goes to `/welcome`, and everything else goes to `/login`.
6. **Roles.** `/admin` needs the `manager` role. `/chores/manage` also admits a member's device a manager has unlocked
   (`locals.elevation`, `isManager`); `isAdmin` is the manager-only check for account-level things. Pages and endpoints check again themselves.
7. **Security headers** are added to the response (CSP, HSTS, `nosniff`, `Referrer-Policy: same-origin`, and so on).
   Responses are `Cache-Control: no-store` unless a route says otherwise.

Public paths are `/welcome`, `/login`, the `/auth/*` sign-in and invite routes, `/demo` and `/demo/*`, and the static
files the browser needs before it has signed in (manifest, service worker, offline page, icons, `robots.txt`).

## Source layout

| Path | What lives there |
|---|---|
| `src/worker.ts` | Entry point: Astro's `fetch` handler plus the once-a-minute `scheduled` handler. |
| `src/middleware.ts` | The flow above. |
| `src/pages/` | Pages and endpoints (below). |
| `src/lib/auth/` | Sign-in tokens and codes, sessions, cookies, users and invites, the audit log. |
| `src/lib/` | Domain logic: `chores.ts`, `rewards.ts`, `timers.ts`, `lists.ts`, `peopleStore.ts`, `features.ts`, `push.ts`, `mailer.ts`, `managerNotify.ts`, `rateLimit.ts`, `maintenance.ts`. Files ending in `Client`, `Types` or `.svelte.ts` are shared with the browser. |
| `src/plugins/` | The plugin host, the registry and each widget (`calendar/`, `mealq/`, `example/`). |
| `src/components/` | Svelte islands and Astro components. |
| `src/demo/`, `src/pages/demo/` | The sample-data demo. It reads no database and needs no sign-in. |
| `src/scripts/` | Small browser scripts: theme, wall display, install prompt, service worker registration, page refresh, local times. |
| `public/` | `sw.js`, `manifest.webmanifest`, offline page, icons, `_headers`. |
| `migrations/` | D1 schema, numbered without gaps and sealed by hash. |
| `scripts/` | Operator tooling: `setup`, `update`, `doctor`, `push-keys`, bundle and CSP checks, smoke tests. |
| `test/` | Vitest suites, with small D1 and KV shims. |

### Pages and endpoints

| Route | Who | Purpose |
|---|---|---|
| `/` | signed in | Dashboard: a card per enabled widget, then Chores and Lists. |
| `/p/<id>` | signed in | A widget's full page (the calendar's Day, Week, Month and Agenda views live here). |
| `/chores`, `/chores/<person>` | signed in | Everyone's routines; one person's routine, points, rewards and screen time. |
| `/chores/manage` | manager | Edit chores, bonuses, rewards, goals. |
| `/inbox` | manager | Approve or deny reward requests, and read the activity feed (`inbox`, `inbox_seen`). |
| `/lists` | signed in | Shared lists. |
| `/devices` | signed in | Your own signed-in devices. |
| `/elevate` | signed in | A member's device asks for manager access and shows the code; a manager enters it to approve. `/elevate/status` is polled while waiting. |
| `/admin` | manager | Members, invites, people, features, notifications, all devices, audit log. |
| `/login`, `/auth/*` | public | Request a link, open it, confirm, enter a code, join by invite, sign out. |
| `/welcome`, `/demo/*` | public | The product page for signed-out visitors, and the sample-data demo. |
| `/api/chores` | signed in | Chore state (GET) and actions (POST). Member actions are open to everyone; manager actions return `403` otherwise. |
| `/api/lists` | signed in | Lists (GET) and actions (POST). |
| `/api/push` | signed in | Whether alerts are on (GET), and device sign-up (POST). Manager actions return `403` otherwise. |
| `/api/plugins/<id>/data` | signed in | A plugin's loader result as JSON. GET only. |
| `/admin/action`, `/devices/action`, `/elevate/action` | manager / signed in | Form posts that redirect back with a fixed message code. |

JSON endpoints take a discriminated union of actions, validated with zod and read with a hard byte cap
(`readJson` in `src/lib/http.ts`). They answer with the new state, so the page updates without a reload.

## Data model

All state is in D1. People are the exception: a person is an id plus a colour, so chores, points and timers refer to the
id and the row in `people` can be renamed freely.

| Area | Tables | Notes |
|---|---|---|
| Access | `users`, `invites`, `login_tokens`, `sessions` (with `elevated_by`/`elevated_until`), `elevation_requests`, `rate_limits`, `audit_log` | Tokens, codes and session ids are stored as SHA-256 digests only. |
| People | `people` | Managed on the Admin page. While empty, the `people` list in `dashboard.config.ts` is used. |
| Chores | `chore_lists` (one row per person, plus "Anyone"), `chore_items`, `chore_checks`, `chore_skips`, `chore_bonus` | A chore carries its own time of day, weekdays and optional one-off date. Ticks are one row per chore per day. |
| Points | `reward_ledger`, `rewards`, `reward_people`, `redemptions`, `goals` | A person's balance is the sum of ledger `delta`. Automatic entries are idempotent through a unique `(kind, ref)`. A goal's progress is computed from the ledger, not stored. |
| Screen time | `screentime_ledger`, `screentime_allowance`, `screentime_timers`, `screentime_sound` | The bank is a ledger sum. The allowance is per person and not banked. One timer per person. |
| Lists | `lists`, `list_items` | Shared by every member. |
| Features | `feature_flags` | A feature with no row is on. |
| Notifications | `push_subscriptions` (per person), `manager_push` (per manager), `manager_notify` | Used only when the VAPID keys are set. |

Migrations are forward-only and each release must work with the previous release's code, so `npx wrangler rollback` is
safe. `npm run migrations:seal` records each migration's hash in `scripts/migrations.manifest.json`, and a test fails if a
shipped migration changes. Fail-open reads (for example `disabledFeatures`) mean a code deploy that gets ahead of its
migration shows the dashboard rather than hiding it.

### Housekeeping

There is no separate cleanup job. `runMaintenance` (`src/lib/maintenance.ts`) runs opportunistically on sign-in requests
and removes expired sign-in tokens, old rate-limit counters, expired sessions, finished timers, old invites and audit
rows older than 400 days. Chore ticks are pruned as new ones are written (60 days; skips 7 days).

## Plugins

A plugin is a folder under `src/plugins/<id>/` that exports a `definePlugin({...})` description and a `Widget.astro`.
`dashboard.config.ts` lists which plugins are shown, in order, with their non-secret config. At startup the registry
(`src/plugins/registry.ts`) validates each entry's config against its zod schema, resolves its fetch policy and rejects
reserved secret names, wildcard hosts and duplicate ids. Writing one is covered in
[`src/plugins/README.md`](../src/plugins/README.md).

When a page needs a plugin's data, the host (`src/plugins/host.ts`) does this:

1. Collect the secrets the plugin declared. If a required one is missing, the card says it is not set up and the loader
   never runs.
2. Look up `plugin:<id>:<hash of config>` in KV. Younger than `cacheTtlSeconds` means use it.
3. Otherwise run the loader with a policy-enforcing `fetch` (declared hosts only, https only, method allowlist, redirects
   re-checked) and an 8-second limit. Store the result for 24 hours so it can be shown if the next fetch fails.
4. On failure, log the error server-side and return the stale copy (marked "saved") or a generic error card.

Built-in widgets: the **calendar** (Google Calendar through a service account, plus optional public `.ics` and NHL
feeds, an Open-Meteo forecast and MealQ meals) and **mealq** (the meal plan card). Chores and Lists are built into the
app rather than plugins, but share the on/off switch in Admin.

## Real-time-ish behaviour without websockets

- **Open pages refresh themselves.** A page with `data-live` (`src/scripts/refresh.ts`) re-reads itself when the app comes
  back to the front after a minute or more, and every five minutes while left in front (a wall display). It never swaps
  anything while someone is touching, typing in or has a dialog open on the page (`src/lib/refreshGuard.ts`). Pages that
  carry a `rev` fingerprint swap only when their data changed.
- **Timers are shared.** The countdown is a row in D1. Screens showing one poll `GET /api/chores?timers` every few seconds
  and count down locally in between.
- **Alerts reach a locked screen.** The Worker's schedule runs every minute. If the VAPID keys are set it finds finished
  timers not yet notified, claims each one with a conditional update (so it goes out once) and sends an encrypted Web Push
  to that person's devices. With no keys it does nothing and reads nothing.

## The browser side

- **Service worker** (`public/sw.js`, hand-written). Caches the offline page, hashed build assets, and optionally `/` and
  `/p/<id>` for 24 hours. Never touches `/admin`, `/devices`, `/api/*`, `/auth/*` or `/login`. Drops saved pages on
  sign-out, on `401`/`403`, and when a redirect to sign-in happens. Shows push notifications and opens only a path on
  this site when one is tapped. See [`pwa-manual-check.md`](pwa-manual-check.md).
- **Content Security Policy.** Astro emits a `<meta>` CSP with per-page hashes (`default-src 'none'`, scripts from `'self'`,
  `connect-src 'self'`). The middleware adds the directives a `<meta>` cannot carry (`frame-ancestors 'none'`,
  `upgrade-insecure-requests`). There are no inline scripts or `<style>` blocks. `scripts/check-csp.sh` checks it.
- **No third-party requests.** The build fails if any client file names an external host or contains a server-only
  marker (`scripts/check-bundle.sh`).
- **Theme and wall mode** are per-browser preferences kept in `localStorage`. Nothing about them reaches the server.

## Tooling

| Command | Purpose |
|---|---|
| `npm run setup` | Guided first-time setup against your own Cloudflare account. `-- --dry-run` changes nothing. |
| `npm run update` | Backup, migrate, then deploy; shows the changelog since your last deploy. |
| `npm run doctor` | Read-only health check. `-- --offline` skips Cloudflare calls. |
| `npm run push:keys` | Generates the VAPID key pair. Sends nothing anywhere. |
| `npm run migrations:seal` | Records the hash of new migrations. |
| `npm run verify` | Unit tests, type-check, build, client-bundle scan, dependency audit. |
| `npm run verify:e2e` | Boots real dev and production servers: roles, invites, plugin API, CSP and static headers. |

CI (`.github/workflows/ci.yml`) runs both verify commands on every push. The release workflow uses release-please and
re-runs them on each tag ([`releasing.md`](releasing.md)).

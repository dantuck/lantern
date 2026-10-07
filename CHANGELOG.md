# Changelog

All notable changes. `npm run update` shows the entries between the version you last deployed and this one,
so write them for the person running the dashboard: what changed for them, and anything they must do.

Migrations are forward-only and must stay compatible with the previous release (the database is migrated
just before the new code is deployed). A release that needs manual action says so under **Action required**
(entries from 0.2.0 on are written by release-please from commit messages; a `BREAKING CHANGE:` footer lands there).

## [0.2.0](https://github.com/dantuck/lantern/compare/v0.1.1...v0.2.0) (2026-10-07)


### Added

* **calendar:** show multi-day events as banners and tighten the grid ([1be29b7](https://github.com/dantuck/lantern/commit/1be29b745924e1034daa712016d744d059ecda7c))
* **pwa:** add install banner and app shortcuts ([2dfbae3](https://github.com/dantuck/lantern/commit/2dfbae38c035bcabce5fbe8df6b823ff57b7f5ce))
* **ui:** add mobile-first layout and confirm dialogs ([41cfe2d](https://github.com/dantuck/lantern/commit/41cfe2d9ae56bb866477b86bc19aaff951e60909))


### Changed

* **plugins:** drop the card heading and back link on page views ([ef6a9cd](https://github.com/dantuck/lantern/commit/ef6a9cdd70a0236d2789590e939afd35f323be37))

## [0.1.1] - 2026-10-07
This is the first release to publish. `v0.1.0` was tagged but its release checks never finished, so use `v0.1.1`.

### Added
- Apache-2.0 `LICENSE` and `NOTICE`, and a `PRIVACY.md` that says what the project and a deployed copy collect.
- A signed-release key in `allowed_signers`, and a README note on verifying a release tag.
- A GitHub release workflow: pushing a `v*` tag checks it against `package.json` and this changelog, reruns the checks and publishes the release.

### Changed
- The welcome page shows the real clone URL and tells people to check out a tagged release.
- The end-to-end test scripts start Astro's dev server in the background explicitly. They hung on a plain CI runner before; this affects only people running `npm run verify:e2e`.

## [0.1.0] - 2026-10-06
### Action required
- **Renamed to Lantern.** The Worker, the D1 database and the npm package are now called `lantern` (they were `family-dashboard`). A fresh install needs nothing. An existing install keeps working under its old names: leave `name` and `database_name` in your `wrangler.jsonc` as they are (a D1 database cannot be renamed), and run migrations with `npm run update`, which reads the database name from that file. `npm run db:migrate:remote` assumes the name `lantern`. To move to the new names, export the database, create one called `lantern`, import the export, deploy, and delete the old Worker and database.
- Chores, lists, rewards and the new on/off switches need new database migrations (`0003_chores_lists.sql`, `0004_features.sql`, `0005_chore_routines.sql`, `0006_reward_scope.sql`): run `npm run update` (or `npm run db:migrate:remote`). Until you do, the dashboard's Chores and Lists cards say they could not load, and the on/off switches have no effect; everything else works.
- Optional: add `people` (and `weather` for the calendar) to your `dashboard.config.ts`; see the README. Without `people` the calendar looks as before, in one colour.
- Existing installs keep their own `wrangler.jsonc`. To match the new defaults, set `"observability": { "enabled": false }`, `"send_metrics": false` and `"dependencies_instrumentation": { "enabled": false }` (see `wrangler.template.jsonc`), then deploy. Skip `observability` if you want to keep your logs.
- Existing installs: if you set a `MEALQ_HOUSEHOLD_ID` secret, you can delete it (`npx wrangler secret delete MEALQ_HOUSEHOLD_ID`).

### Added
- `npm run setup`: guided first-time deploy on your own Cloudflare account (`--dry-run` to preview).
- `npm run update`: backs up the database, applies new migrations, and deploys, showing what changed.
- Local settings live in untracked `wrangler.jsonc` and `dashboard.config.ts`, created from templates, so updates never conflict with them.
- MealQ widget reads the household from the access token; no household id secret is needed.
- **Sign in with a code from another device.** The sign-in email now also contains an 8-digit code. Read the email on your phone, then type the code into the sign-in page in the browser where you asked for it (the link only works in that same browser). The code expires in 10 minutes, works once, and is burned after 5 wrong guesses. It needs the new `0009_login_code.sql` migration: run `npm run update`.
- **Turn widgets and features on or off.** Managers get a *Widgets and features* section in Admin to hide any widget from `dashboard.config.ts`, or the built-in Chores and Lists, for everyone. Hidden things disappear from the dashboard, the side bar and their pages and APIs; their data is kept. Each change is recorded in the activity log. Everything starts on. The demo's admin page has the same switches (remembered in the visitor's browser only), so the effect can be tried without signing in.
- **People and colours.** List your household under `people` in `dashboard.config.ts`. Calendar events take the colour of whoever their title names, with filter chips to show one person's day, and the dashboard widget tints events the same way.
- A **Day view** next to Day/Week/Month/Agenda, with one column per person, and a larger, rounder, touch-friendly calendar (the week view now opens by default).
- **Weather** in the calendar's day headers from Open-Meteo (set `weather` with your latitude and longitude). It is off unless you configure it; the request carries only your rounded coordinates and time zone, and `api.open-meteo.com` is listed in `SECURITY.md`.
- **Chores:** managed by managers, ticked by everyone. A manager builds chore lists (routines) for each person, such as a morning routine, with the days they repeat, a time of day and the chores in them; the ticks reset every morning. The Chores page has a column per person with big tap-to-tick buttons and progress bars, and managers get a *Manage* page (`/chores/manage`) for lists, chores, rewards and points. Chores from earlier builds are carried over into lists by the migration.
- **Rewards:** chores can be worth points, and a list can pay an all-done bonus. Points go to the list's person. Managers set up rewards with a point cost; anyone can ask for one they can afford and a manager approves or denies it, and can also add or remove points by hand. A reward can be limited to chosen chore lists, so only the people those lists belong to see it and can ask for it. Approvals and adjustments are recorded in the activity log.
- **Lists:** shared lists (groceries, to-dos, wish lists) anyone signed in can add to, tick off and clear.
- A **side rail** replaces the top bar on wide screens (icons with labels), and a **wall display mode** hides it, enlarges everything, goes fullscreen and keeps the screen awake.
- Chores and lists in the demo, with the demo household's people, colours and weather.
- A refreshed look with **light, dark and match-my-system** themes. The switch sits in the top bar (and on the sign-in and welcome pages); the choice is remembered in the browser, and the default follows the device.
- The calendar page is now a full calendar with **Month, Week and Agenda** views: previous/next/today controls, a time-grid week view with overlapping events side by side, an all-day row, and a live "now" line. Clicking a day (or a week-view event) opens a detail panel with full times, durations, locations and multi-day progress, and arrows to step between days. It remembers your last view (phones start on Agenda), and `?view=week` links straight to one.
- A public **product page** at `/welcome` (signed-out visitors to `/` land there): what the dashboard is, a preview, and the four steps to run your own copy.
- A **demo mode** at `/demo`: the dashboard, month calendar, meal plan, devices and admin screens filled with invented sample data, so anyone can explore (and so the design can be checked without real data). It never reads your calendar, meal plan or database, and every action is switched off.
- Setup explains what the MealQ widget needs (public hostname, read-only token) and defaults the hostname to MealQ's public API, `api-mealq.plantolive.app`; the example config uses it too.
- Setup now walks through creating the Google service account and key at the calendar prompt, shows the service-account email to share the calendar with, and says where to find the Calendar ID. The setup guide has the same steps.
- Setup guide section on using a subdomain: which names to pick, what DNS Cloudflare creates for you, and which email records (SPF, DKIM, DMARC) you add yourself. It recommends the dashboard's own hostname as the Resend sending domain, which scopes the mail records and sending reputation to the dashboard.
- `npm run doctor`: a read-only health check of settings, Cloudflare login, secrets (names only), database, members, backups and releases, with a fix for each problem (`--offline` skips Cloudflare).
- A step-by-step setup guide (`docs/setup-guide.md`), a "You are the host" page covering the operator's jobs and a full teardown, and a threat model. Tests keep their links, `npm run` commands and wrangler commands accurate.
- `SECURITY.md`: exactly what the Worker talks to, what is stored, what telemetry exists (none), and the supply-chain stance.
- Tests pin every network destination, the runtime dependency list, and the absence of tracking APIs; the build also fails if a client file references an external host.
- Developer-tool telemetry (Astro, Wrangler) is switched off for everything the npm scripts, `setup` and `update` launch.

### Changed
- New **warm orange** colour scheme (light and dark) that matches the MealQ icon; the app icons were regenerated to match. Reinstall the app on a phone if you want its home-screen icon to update.
- Re-running setup can now add a widget you earlier declined (it used to be unable to bring the line back).
- Setup suggests this computer's time zone instead of always America/New_York (UTC falls back to New York, since it says nothing about where the household is).
- Setup suggests `login@<your hostname>` as the sender instead of guessing a parent domain (which came out wrong for domains like `example.co.uk`), and keeps your configured sender on a re-run.
- Setup now requires Node 22.12 or newer, as Astro does (it wrongly accepted 20 before); `package.json` declares it in `engines`.
- New installs have request logging (`observability`) **off**, plus `send_metrics` and dependency reporting off, in `wrangler.jsonc`.

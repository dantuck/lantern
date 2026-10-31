# Changelog

All notable changes. `npm run update` shows the entries between the version you last deployed and this one,
so write them for the person running the dashboard: what changed for them, and anything they must do.

Migrations are forward-only and must stay compatible with the previous release (the database is migrated
just before the new code is deployed). A release that needs manual action says so under **Action required**
(entries from 0.2.0 on are written by release-please from commit messages; a `BREAKING CHANGE:` footer lands there).

## [0.27.0](https://github.com/dantuck/lantern/compare/v0.26.0...v0.27.0) (2026-10-31)


### Added

* **chores:** lay people out as equal-height cards with points in the header ([521355f](https://github.com/dantuck/lantern/commit/521355f65086454fedb36e38ef65d243fff35da3))
* **chores:** quick-add chores under each time of day ([331c39c](https://github.com/dantuck/lantern/commit/331c39c9cdb579502ae33b0e8390b742948cc788))


### Fixed

* **chores:** keep the round add button off what is being edited on a phone ([aaddb5a](https://github.com/dantuck/lantern/commit/aaddb5aa2bec29e9cc19fde055be2484ff530dcf))

## [0.26.0](https://github.com/dantuck/lantern/compare/v0.25.0...v0.26.0) (2026-10-30)


### Added

* **rewards:** show points waiting on a manager beside the balance ([e9f9ead](https://github.com/dantuck/lantern/commit/e9f9ead9bbfd4c429644cde8594531f13096d725))

## [0.25.0](https://github.com/dantuck/lantern/compare/v0.24.1...v0.25.0) (2026-10-29)


### Added

* **rewards:** add reward descriptions, drawer editing and a reach-aware cost estimator ([fefe227](https://github.com/dantuck/lantern/commit/fefe227fecc63ea69554aef68b96819ae75c08a4))

## [0.24.1](https://github.com/dantuck/lantern/compare/v0.24.0...v0.24.1) (2026-10-28)


### Fixed

* **build:** skip binary files in the external host scan ([634da49](https://github.com/dantuck/lantern/commit/634da49f9d1408636d90bd336b219bb1614bda46))

## [0.24.0](https://github.com/dantuck/lantern/compare/v0.23.0...v0.24.0) (2026-10-28)


### Added

* **chores:** keep the screen awake with a video fallback and say when it cannot ([7488bbf](https://github.com/dantuck/lantern/commit/7488bbf1e16c6d23af557c75f8ea9a0c8d230feb))
* **push:** tell managers when a screen time timer runs out ([4952bab](https://github.com/dantuck/lantern/commit/4952babe46649bf0bd14cb4e3bba9a1d9962f128))

## [0.23.0](https://github.com/dantuck/lantern/compare/v0.22.0...v0.23.0) (2026-10-27)


### Added

* **push:** add a test notification button to manager alerts ([60362f2](https://github.com/dantuck/lantern/commit/60362f2f689ab05bcea06216d881d25bdb041734))


### Fixed

* **push:** rename the hoisted VAPID keys so they do not clash with the subscription keys ([ed1fde7](https://github.com/dantuck/lantern/commit/ed1fde7973b3aa8e23bd5077ee9339f956153420))

## [0.22.0](https://github.com/dantuck/lantern/compare/v0.21.0...v0.22.0) (2026-10-27)


### Added

* **chores:** full-screen glass timer with a get-ready countdown and a gentle low-time warning ([916d20c](https://github.com/dantuck/lantern/commit/916d20c573f504f1cb780afb3c46c2e7c537d073))


### Fixed

* **push:** log rejected sends and re-alert on Android when a tag repeats ([f8a482a](https://github.com/dantuck/lantern/commit/f8a482a140443e790a9f8ceda54c96dd878f9c20))

## [0.21.0](https://github.com/dantuck/lantern/compare/v0.20.0...v0.21.0) (2026-10-26)


### Added

* **chores:** collapse the timer sound settings until opened ([731038e](https://github.com/dantuck/lantern/commit/731038e4340337335df9043a827efe77961bc1fb))
* **chores:** move recent points into a sheet and give the routine editor full width in manage ([06c4cf4](https://github.com/dantuck/lantern/commit/06c4cf46abf74f28fa4c5af94da5383e8139b956))

## [0.20.0](https://github.com/dantuck/lantern/compare/v0.19.0...v0.20.0) (2026-10-26)


### Added

* **chores:** time-of-day hours, optional chores and screen time limits ([3362f93](https://github.com/dantuck/lantern/commit/3362f93b45b8c5b6e024b2105b52d8cb4111bd7d))

## [0.19.0](https://github.com/dantuck/lantern/compare/v0.18.0...v0.19.0) (2026-10-26)


### Added

* **chores:** repeat until finished, with automatic daily points ([f9408db](https://github.com/dantuck/lantern/commit/f9408db97b5740015ca12be835e136557b216705))

## [0.18.0](https://github.com/dantuck/lantern/compare/v0.17.1...v0.18.0) (2026-10-25)


### Added

* **manage:** overview landing page, chore planner and add-chore drawer ([2237cc2](https://github.com/dantuck/lantern/commit/2237cc2b6a85d1b23aefe599da3e3871a2bc759b))
* **rewards:** spend points on instant screen time, with per-section locks and renamable times of day ([5abd94c](https://github.com/dantuck/lantern/commit/5abd94c5bd427c65e9f539991258e3ee2b129ebc))

## [0.17.1](https://github.com/dantuck/lantern/compare/v0.17.0...v0.17.1) (2026-10-24)


### Changed

* **nav:** move manager mode lock from banner into menus ([ee9a72e](https://github.com/dantuck/lantern/commit/ee9a72e4621666c6280b6bc7620606400f89ab74))

## [0.17.0](https://github.com/dantuck/lantern/compare/v0.16.1...v0.17.0) (2026-10-24)


### Added

* manager elevation, manager inbox and every-N-weeks chores ([2b9ae00](https://github.com/dantuck/lantern/commit/2b9ae00a96d485dc8d4e3f9a70695b7eead1c728))


### Fixed

* **deps:** override undici to 7.30.1 to clear the high-severity audit finding ([e321a58](https://github.com/dantuck/lantern/commit/e321a58e2ab8cf399db3ff57dac6e3552a4587df))

## [0.16.1](https://github.com/dantuck/lantern/compare/v0.16.0...v0.16.1) (2026-10-23)


### Fixed

* **calendar:** keep the focused day across a refresh ([d9904e9](https://github.com/dantuck/lantern/commit/d9904e93fb946e973b9174e874f794d7442c09d4))
* **chores:** keep the picked person and open sections on refresh ([1c1a38d](https://github.com/dantuck/lantern/commit/1c1a38db6e3d44608fc6ccf03e1aab0bcca943ff))
* **scripts:** make client scripts modules so top-level names don't collide ([20ab805](https://github.com/dantuck/lantern/commit/20ab8052c9db64680535261ed64a8efbe2f994ec))

## [0.16.0](https://github.com/dantuck/lantern/compare/v0.15.0...v0.16.0) (2026-10-23)


### Added

* **chores:** show one-off chores clearly and let them be reused ([785bd3a](https://github.com/dantuck/lantern/commit/785bd3a6a8cd9dcb9c2d48351a9969008a03d0a1))


### Fixed

* **chores:** stop time-of-day tabs overlapping on phones ([0481f64](https://github.com/dantuck/lantern/commit/0481f644fff2f6baab9052e0e59463b3712a2141))

## [0.15.0](https://github.com/dantuck/lantern/compare/v0.14.1...v0.15.0) (2026-10-22)


### Added

* **chores:** card layout for the manager page, copy chores between people ([11aa590](https://github.com/dantuck/lantern/commit/11aa590667a16a2b40de8694d5cbf2641c9decd6))
* **dashboard:** tickable chores card, sticky page headers, demo pill, calendar-first layout ([e966e6f](https://github.com/dantuck/lantern/commit/e966e6f29e48c738853c7684c427b24360d4f64c))

## [0.14.1](https://github.com/dantuck/lantern/compare/v0.14.0...v0.14.1) (2026-10-18)


### Fixed

* **calendar:** drop multi-day row label and stop gutter wrapping ([e632c93](https://github.com/dantuck/lantern/commit/e632c939d09be8c04c36d0ab188fa3c02cb50e65))

## [0.14.0](https://github.com/dantuck/lantern/compare/v0.13.0...v0.14.0) (2026-10-18)


### Added

* **pwa:** refresh open pages when the app returns to the front ([84669cf](https://github.com/dantuck/lantern/commit/84669cf512898f103a218168ec718b1c7444be1f))

## [0.13.0](https://github.com/dantuck/lantern/compare/v0.12.0...v0.13.0) (2026-10-18)


### Added

* **admin:** notify managers of reward requests and timers ([eecdb2e](https://github.com/dantuck/lantern/commit/eecdb2e968987a617d5f6b6268fc50d6c0208eb3))
* **calendar:** show the week on wide dashboard cards ([e048a22](https://github.com/dantuck/lantern/commit/e048a22603f21dd760891f9aeb917b4f80aef273))
* **chores:** add typeahead quick-add and undo for removed chores ([8eb425a](https://github.com/dantuck/lantern/commit/8eb425a00a8c0ae4ced6ff9b7cf5a4143ac2bba4))


### Fixed

* **calendar:** cap the size of calendar feeds ([9c6cb37](https://github.com/dantuck/lantern/commit/9c6cb37e965bf230d56d699c835d1982f6ace97c))
* **css:** add the missing pointer-coarse variant ([5ae8803](https://github.com/dantuck/lantern/commit/5ae880377ccfc43861de4ef8b8533bfa7cfb45da))
* **security:** match access rules against the decoded request path ([313efbf](https://github.com/dantuck/lantern/commit/313efbfb747e3c74427ee10494904dbfdd85dd77))

## [0.12.0](https://github.com/dantuck/lantern/compare/v0.11.0...v0.12.0) (2026-10-17)


### Added

* **admin:** resend invites, warn when mail is off, edit people inline ([b7d056a](https://github.com/dantuck/lantern/commit/b7d056a367456832bc9ee08665a3792af1101792))
* **auth:** add one-click sign-in link to member invites ([f35c1ff](https://github.com/dantuck/lantern/commit/f35c1ff5cfe1802329bb1c643a00da079147df0a))
* **chores:** collapse routines and add find and expand all ([e6f7e72](https://github.com/dantuck/lantern/commit/e6f7e7293fc4872cfeb8b4da13c8fc7ef12ee210))
* **nav:** show waiting reward requests as a badge for managers ([5bb2049](https://github.com/dantuck/lantern/commit/5bb204931ebc64cc24ed44d091e9bf58d2e5feb1))


### Fixed

* **ui:** shrink segmented control buttons ([96cf55d](https://github.com/dantuck/lantern/commit/96cf55d6ad98a7400224173fa41d79cadfdbff35))

## [0.11.0](https://github.com/dantuck/lantern/compare/v0.10.1...v0.11.0) (2026-10-14)


### Added

* **chores:** add screen time timer with sounds and push alerts ([f87a6bd](https://github.com/dantuck/lantern/commit/f87a6bdf2d695e93a7b9d60590177701f04069f8))

## [0.10.1](https://github.com/dantuck/lantern/compare/v0.10.0...v0.10.1) (2026-10-13)


### Fixed

* **login:** wrap sign-in notice text in a span ([71717a7](https://github.com/dantuck/lantern/commit/71717a743b68f947223c78358eb505c6f929b78a))

## [0.10.0](https://github.com/dantuck/lantern/compare/v0.9.0...v0.10.0) (2026-10-13)


### Added

* **auth:** redirect retired hostnames to APP_ORIGIN ([222c3ec](https://github.com/dantuck/lantern/commit/222c3ec9d68cdd0bdb80f88120639ce1e42b8576))

## [0.9.0](https://github.com/dantuck/lantern/compare/v0.8.0...v0.9.0) (2026-10-13)


### Added

* **auth:** confirm before signing out or exiting the demo ([fe8e568](https://github.com/dantuck/lantern/commit/fe8e5684475b9988e58e00fd38542590c3c08a89))
* **chores:** add skip and undo to the all-chores board ([26ff032](https://github.com/dantuck/lantern/commit/26ff032b26f8c55946371499cfc4d18ebb0dbe50))
* **chores:** let managers skip a chore for a day ([780922a](https://github.com/dantuck/lantern/commit/780922a2888a8a5600e941f251031bdc3bd3b3f1))

## [0.8.0](https://github.com/dantuck/lantern/compare/v0.7.0...v0.8.0) (2026-10-08)


### Added

* **chores:** celebrate finished chore lists with confetti ([b996ca8](https://github.com/dantuck/lantern/commit/b996ca8ad65ac2c5ecde751f1751ec193bfdbe7b))


### Fixed

* **chores:** silence the confetti size warning ([1786672](https://github.com/dantuck/lantern/commit/1786672bbf5d392e09618d30d8543942af1fe66d))

## [0.7.0](https://github.com/dantuck/lantern/compare/v0.6.0...v0.7.0) (2026-10-08)


### Added

* **calendar:** show the MealQ meal plan on the calendar ([ab4771f](https://github.com/dantuck/lantern/commit/ab4771f7deab4ab35d7af0482d048c2da269c662))
* **chores:** add screen-time picker and phone-friendly routine editing ([4d1c4db](https://github.com/dantuck/lantern/commit/4d1c4db78813c75a211180625b7a6482e5e3a149))

## [0.6.0](https://github.com/dantuck/lantern/compare/v0.5.0...v0.6.0) (2026-10-08)


### Added

* **calendar:** overlay public ics and NHL calendars ([143aa77](https://github.com/dantuck/lantern/commit/143aa772316f658c12b1811e7ac48e7ab3059af6))

## [0.5.0](https://github.com/dantuck/lantern/compare/v0.4.3...v0.5.0) (2026-10-07)


### Added

* **chores:** make chore and reward admin touch friendly on phones ([361bcd7](https://github.com/dantuck/lantern/commit/361bcd7bbe7d6c1f52c698ac6b08c580fb8a28dc))

## [0.4.3](https://github.com/dantuck/lantern/compare/v0.4.2...v0.4.3) (2026-10-07)


### Fixed

* **nav:** extend side rail under the status bar safe area ([d36e0aa](https://github.com/dantuck/lantern/commit/d36e0aa92c0bd9d8f01629188c8182e80721a040))

## [0.4.2](https://github.com/dantuck/lantern/compare/v0.4.1...v0.4.2) (2026-10-07)


### Fixed

* **update:** show wrangler's error when the backup fails ([e50e7fb](https://github.com/dantuck/lantern/commit/e50e7fb04a4e092d5fa96450659e61623bb876ad))

## [0.4.1](https://github.com/dantuck/lantern/compare/v0.4.0...v0.4.1) (2026-10-07)


### Fixed

* **chores:** space and centre the rewards badge ([6321bc5](https://github.com/dantuck/lantern/commit/6321bc56ed93cfe0ba09495618e1bae798d56868))
* **css:** restore feature-off banner and Lists tick styles ([ef0676c](https://github.com/dantuck/lantern/commit/ef0676c4a5e2be9aa74e5204ed1fd080f080d8d8))
* **nav:** start side rail below the status bar safe area ([e61c0bd](https://github.com/dantuck/lantern/commit/e61c0bd481730877c6f6198336f243dbef77c4bc))


### Changed

* **css:** convert button variants to UnoCSS shortcuts ([3a2d98d](https://github.com/dantuck/lantern/commit/3a2d98d84642da4ac62934467c9b8df7f23e48a4))
* **css:** convert calendar view to UnoCSS ([131825c](https://github.com/dantuck/lantern/commit/131825c30e76f891eb92f4e2963c70fab584fd69))
* **css:** convert chore components to UnoCSS ([ada375b](https://github.com/dantuck/lantern/commit/ada375b03ba502218fdd3bd003367216f23969ad))
* **css:** convert landing page to UnoCSS ([e4eb06c](https://github.com/dantuck/lantern/commit/e4eb06c361f8c751aa05cce1472f3baa520ae1d9))
* **css:** convert Lists and chore editor to UnoCSS ([78a2ece](https://github.com/dantuck/lantern/commit/78a2ecef6383066cda11789de79803aedaef5732))
* **css:** convert main, card, notice and row to UnoCSS ([d57459a](https://github.com/dantuck/lantern/commit/d57459ae82fe3e761fc7a0e711ae7cf1b1da90ef))
* **css:** convert nav rail, tabbar and sheet to UnoCSS ([38ca7fd](https://github.com/dantuck/lantern/commit/38ca7fd3cf4799ebd7a6fe40633beaa12d5691f5))
* **css:** convert widgets and admin pages to UnoCSS ([4d95bf9](https://github.com/dantuck/lantern/commit/4d95bf9fb400b15841be786a39152748d2f6ad25))
* **css:** rename dashboard grid class to dash-grid ([d6efa7f](https://github.com/dantuck/lantern/commit/d6efa7fda5f6545c73312470d9036561b3942f5f))

## [0.4.0](https://github.com/dantuck/lantern/compare/v0.3.0...v0.4.0) (2026-10-07)


### ⚠ BREAKING CHANGES

* **chores:** migration 0012 drops reward_lists and merges each person's chore lists, so the previous release can no longer read the database; do not roll back the code after migrating

### Added

* **chores:** add household goals, screen time and one routine per person ([97b5949](https://github.com/dantuck/lantern/commit/97b594956923e90e2ad4a227f04481d379ebf73c))


### Changed

* **chores:** rename state to choreState to fix type errors ([af93f2f](https://github.com/dantuck/lantern/commit/af93f2f30fa863f205c769c28a492a0ebab3f0fb))

## [0.3.0](https://github.com/dantuck/lantern/compare/v0.2.0...v0.3.0) (2026-10-07)


### Added

* **plugins:** refetch plugin data when the page is force-refreshed ([fa90a2c](https://github.com/dantuck/lantern/commit/fa90a2c9784dbaa49a7309712c385f9e41cc7fd7))

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

# Changelog

All notable changes. `npm run update` shows the entries between the version you last deployed and this one,
so write them for the person running the dashboard: what changed for them, and anything they must do.

Migrations are forward-only and must stay compatible with the previous release (the database is migrated
just before the new code is deployed). A release that needs manual action says so under **Action required**.

## [Unreleased]
### Added
- `npm run doctor`: a read-only health check of settings, Cloudflare login, secrets (names only), database, members, backups and releases, with a fix for each problem (`--offline` skips Cloudflare).
- A step-by-step setup guide (`docs/setup-guide.md`), a "You are the host" page covering the operator's jobs and a full teardown, and a threat model. Tests keep their links, `npm run` commands and wrangler commands accurate.
- `SECURITY.md`: exactly what the Worker talks to, what is stored, what telemetry exists (none), and the supply-chain stance.
- Tests pin every network destination, the runtime dependency list, and the absence of tracking APIs; the build also fails if a client file references an external host.
- Developer-tool telemetry (Astro, Wrangler) is switched off for everything the npm scripts, `setup` and `update` launch.

### Changed
- Setup now requires Node 22.12 or newer, as Astro does (it wrongly accepted 20 before); `package.json` declares it in `engines`.
- New installs have request logging (`observability`) **off**, plus `send_metrics` and dependency reporting off, in `wrangler.jsonc`.

### Action required
- Existing installs keep their own `wrangler.jsonc`. To match the new defaults, set `"observability": { "enabled": false }`, `"send_metrics": false` and `"dependencies_instrumentation": { "enabled": false }` (see `wrangler.template.jsonc`), then deploy. Skip `observability` if you want to keep your logs.

## [0.1.0] - 2026-10-06
### Added
- `npm run setup`: guided first-time deploy on your own Cloudflare account (`--dry-run` to preview).
- `npm run update`: backs up the database, applies new migrations, and deploys, showing what changed.
- Local settings live in untracked `wrangler.jsonc` and `dashboard.config.ts`, created from templates, so updates never conflict with them.
- MealQ widget reads the household from the access token; no household id secret is needed.

### Action required
- Existing installs: if you set a `MEALQ_HOUSEHOLD_ID` secret, you can delete it (`npx wrangler secret delete MEALQ_HOUSEHOLD_ID`).

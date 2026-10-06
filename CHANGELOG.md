# Changelog

All notable changes. `npm run update` shows the entries between the version you last deployed and this one,
so write them for the person running the dashboard: what changed for them, and anything they must do.

Migrations are forward-only and must stay compatible with the previous release (the database is migrated
just before the new code is deployed). A release that needs manual action says so under **Action required**.

## [Unreleased]

## [0.1.0] - 2026-10-06
### Added
- `npm run setup`: guided first-time deploy on your own Cloudflare account (`--dry-run` to preview).
- `npm run update`: backs up the database, applies new migrations, and deploys, showing what changed.
- Local settings live in untracked `wrangler.jsonc` and `dashboard.config.ts`, created from templates, so updates never conflict with them.
- MealQ widget reads the household from the access token; no household id secret is needed.

### Action required
- Existing installs: if you set a `MEALQ_HOUSEHOLD_ID` secret, you can delete it (`npx wrangler secret delete MEALQ_HOUSEHOLD_ID`).

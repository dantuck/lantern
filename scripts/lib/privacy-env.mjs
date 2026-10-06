// Environment that switches off tool telemetry. Applied to every tool this project launches (npm scripts via
// scripts/run.mjs, setup, update, and the shell test scripts). Running `astro` or `wrangler` by hand falls back
// to your own machine-wide preference; `npx astro telemetry disable` and WRANGLER_SEND_METRICS=false set those.
export const PRIVACY_ENV = {
  ASTRO_TELEMETRY_DISABLED: '1',
  WRANGLER_SEND_METRICS: 'false',
  DO_NOT_TRACK: '1',
};

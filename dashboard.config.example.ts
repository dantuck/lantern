import type { DashboardConfig } from './src/plugins/types';

// The example plugin is a template; show it only in dev (and in the CSP check build).
const showExample = import.meta.env.DEV || import.meta.env.PUBLIC_ENABLE_EXAMPLE === '1';

/**
 * Which plugins are shown, in order. Only non-secret settings belong here;
 * secrets are Worker secrets (see README) and are declared by each plugin.
 */
export default {
  title: 'Family Dashboard',
  plugins: [
    // Set timeZone to your household's IANA zone, e.g. 'America/Chicago'.
    { id: 'calendar', span: 2, config: { timeZone: 'America/New_York' } },
    // apiHost is MealQ's public API (docs/mealq-api-contract.md). Change it only if you run your own MealQ server.
    { id: 'mealq', config: { apiHost: 'api-mealq.plantolive.app', timeZone: 'America/New_York' } },
    ...(showExample ? [{ id: 'example', config: { greeting: 'Hello, family' } }] : []),
  ],
} satisfies DashboardConfig;

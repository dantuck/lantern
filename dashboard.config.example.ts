import type { DashboardConfig } from './src/plugins/types';

// The example plugin is a template; show it only in dev (and in the CSP check build).
const showExample = import.meta.env.DEV || import.meta.env.PUBLIC_ENABLE_EXAMPLE === '1';

/**
 * Which plugins are shown, in order. Only non-secret settings belong here;
 * secrets are Worker secrets (see README) and are declared by each plugin.
 */
export default {
  title: 'Lantern',
  // Your household. Each person gets a colour on the calendar and a column on the Chores page. An event goes on a
  // person's calendar when their name (or any word in `match`) appears in its title. `color` is optional.
  people: [
    // { name: 'Alex', color: '#e8590c' },
    // { name: 'Sam', match: ['Sam', 'Samantha'] },
  ],
  plugins: [
    // Set timeZone to your household's IANA zone, e.g. 'America/Chicago'.
    // Add `weather: { latitude: 40.71, longitude: -74.01 }` to the config for a forecast in the day headers (sent to Open-Meteo, rounded).
    // Extra public calendars go under `feeds`: a preset id from src/plugins/calendar/presets.ts (every NHL team is 'nhl-<code>'),
    // or `{ name, url }` for any public .ics link, e.g. feeds: [{ preset: 'nhl-det' }, { preset: 'us-holidays' }].
    { id: 'calendar', span: 2, config: { timeZone: 'America/New_York' } },
    // apiHost is MealQ's public API (docs/mealq-api-contract.md). Change it only if you run your own MealQ server.
    { id: 'mealq', config: { apiHost: 'api-mealq.plantolive.app', timeZone: 'America/New_York' } },
    ...(showExample ? [{ id: 'example', config: { greeting: 'Hello, family' } }] : []),
  ],
} satisfies DashboardConfig;

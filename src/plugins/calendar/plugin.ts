import { z } from 'zod';
import { definePlugin } from '../types';
import { DAY_MS, dayKey, startOfDayMs } from '../../lib/dates';
import { hostnameField, zoneLocaleShape } from '../fields';
import { inWindow } from './events';
import { fetchSource, sourceHost } from './feeds';
import { feedUrl } from './ics';
import { PRESETS } from './presets';
import { fetchMeals } from './meals';
import { SLOTS, type Slot } from '../mealq/slots';
import { getAccessToken, listEvents, parseServiceAccount } from './google';
import { WEATHER_HOST, fetchWeather, weatherSchema } from './weather';
import type { CalEvent, CalendarData } from './types';

/**
 * Read-only view of one shared Google Calendar via a service account.
 * Setup: create a service account, share the calendar with its email ("See all event details"),
 * then `wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON` (the key file) and `GOOGLE_CALENDAR_ID`.
 */
const colorField = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a #rrggbb colour');

/** One extra calendar. Three spellings, all normalised to { name, color, source }. */
const feedSchema = z.union([
  // A known calendar from presets.ts. `name` and `color` override the preset's.
  z.object({ preset: z.string(), name: z.string().min(1).max(40).optional(), color: colorField.optional() })
    .transform((f, ctx) => {
      const p = PRESETS[f.preset];
      if (!p) { ctx.addIssue({ code: 'custom', message: `unknown preset "${f.preset}"; see src/plugins/calendar/presets.ts` }); return z.NEVER; }
      return { name: f.name ?? p.name, color: f.color ?? p.color, source: p.source };
    }),
  // An NHL team by three-letter code, read live from the NHL's public schedule API.
  z.object({ nhl: z.string().regex(/^[A-Z]{3}$/, 'use the team code, e.g. DET'), name: z.string().min(1).max(40), color: colorField.default('#64748b') })
    .transform((f) => ({ name: f.name, color: f.color, source: { kind: 'nhl' as const, team: f.nhl } })),
  // Any public .ics / webcal:// URL. Never put a private (secret-link) calendar here.
  z.object({
    name: z.string().min(1).max(40),
    url: z.string().refine((u) => { try { return feedUrl(u).protocol === 'https:'; } catch { return false; } }, 'must be an https:// or webcal:// URL'),
    color: colorField.default('#64748b'),
  }).transform((f) => ({ name: f.name, color: f.color, source: { kind: 'ics' as const, url: f.url } })),
]);

export const configSchema = z.object({
  ...zoneLocaleShape,
  /** How far ahead to fetch. The month grid can navigate within this window. */
  daysAhead: z.number().int().min(7).max(120).default(60),
  /** Extra public calendars to overlay: `{ preset: 'nhl-det' }`, `{ nhl: 'DET', name }` or `{ name, url }` for any .ics. */
  feeds: z.array(feedSchema).max(8).default([]),
  /** Optional forecast in the day headers: your latitude and longitude. Sent (rounded) to Open-Meteo, nothing else is. */
  weather: weatherSchema.optional(),
  /**
   * Show a MealQ meal plan on the calendar. `apiHost` defaults to the enabled MealQ plugin's, and the token is the same
   * MEALQ_API_TOKEN secret (docs/mealq-api-contract.md). `slots` are the meals shown until someone changes the toggles.
   */
  meals: z.object({
    apiHost: hostnameField,
    slots: z.array(z.enum(SLOTS)).max(SLOTS.length).default(['dinner']),
  }).optional(),
});
export type CalendarConfig = z.infer<typeof configSchema>;
/** What the calendar's pages read from the config, so the demo can supply it without a MealQ host. */
export type CalendarViewConfig = Pick<CalendarConfig, 'timeZone' | 'locale'> & { meals?: { slots: Slot[] } | undefined };

/** Log an optional source's failure and fall back, so one broken source never takes the calendar down. */
function softFail<T>(what: string, e: unknown, fallback: T): T {
  console.error(`plugin calendar: ${what} failed:`, e instanceof Error ? e.message : 'unknown');
  return fallback;
}

export default definePlugin({
  id: 'calendar',
  name: 'Calendar',
  icon: 'calendar',
  configSchema,
  // `meals: {}` borrows the MealQ plugin's host, so it is configured once.
  resolveConfig(raw, siblings) {
    const c = raw as { meals?: { apiHost?: string } };
    const shared = (siblings.find((s) => s.id === 'mealq')?.config as { apiHost?: string } | undefined)?.apiHost;
    return c.meals && !c.meals.apiHost && shared ? { ...c, meals: { ...c.meals, apiHost: shared } } : raw;
  },
  secrets: ['GOOGLE_SERVICE_ACCOUNT_JSON', 'GOOGLE_CALENDAR_ID'],
  // Without the token the calendar still loads; it just has no meals.
  optionalSecrets: ['MEALQ_API_TOKEN'],
  // POST is only for the OAuth token exchange; everything else is GET.
  fetchPolicy: (config: CalendarConfig) => ({
    hosts: ['oauth2.googleapis.com', 'www.googleapis.com', ...config.feeds.map((f) => sourceHost(f.source)), ...(config.weather ? [WEATHER_HOST] : []), ...(config.meals ? [config.meals.apiHost] : [])],
    methods: ['GET', 'POST'],
  }),
  cacheTtlSeconds: 300,
  async loader({ config, secrets, fetch, now }): Promise<CalendarData> {
    const sa = parseServiceAccount(secrets.GOOGLE_SERVICE_ACCOUNT_JSON!);
    // From the start of the current month so the month grid is complete.
    const windowStart = startOfDayMs(`${dayKey(now, config.timeZone).slice(0, 8)}01`, config.timeZone);
    const windowEnd = now + config.daysAhead * DAY_MS;
    // A broken feed shouldn't take the calendar down: skip it and keep the rest. Feeds are whole seasons, so clip to the window.
    const feeds = config.feeds.map((feed, i) =>
      fetchSource(fetch, feed.source, `feed${i}`, config.timeZone)
        .then((evs) => evs.filter((e) => inWindow(e, windowStart, windowEnd, config.timeZone)).map((e) => ({ ...e, source: { name: feed.name, color: feed.color } })))
        .catch((e) => softFail(`feed "${feed.name}"`, e, [])));
    // The forecast is a nicety: if Open-Meteo is down the calendar still loads.
    const forecast = config.weather
      ? fetchWeather(fetch, config.weather, config.timeZone).catch((e) => softFail('weather', e, undefined))
      : undefined;
    // Meals are a nicety too: a missing token or a MealQ outage leaves the calendar as it was.
    const mealToken = secrets.MEALQ_API_TOKEN;
    if (config.meals && !mealToken) console.error('plugin calendar: meals are configured but MEALQ_API_TOKEN is not set');
    const mealPlan = config.meals && mealToken
      ? fetchMeals(fetch, { apiHost: config.meals.apiHost, token: mealToken, now, windowStart, windowEnd, zone: config.timeZone }).catch((e) => softFail('meals', e, undefined))
      : undefined;
    // The token exchange runs alongside the feeds, forecast and meals instead of ahead of them.
    const google = getAccessToken(fetch, sa, now).then((token) => listEvents(fetch, token, secrets.GOOGLE_CALENDAR_ID!, windowStart, windowEnd));
    const [googleEvents, weather, meals, ...feedEvents] = await Promise.all([google, forecast, mealPlan, ...feeds]);
    const events: CalEvent[] = [...googleEvents, ...feedEvents.flat()];
    return { events, windowStart, windowEnd, ...(weather ? { weather } : {}), ...(meals ? { meals } : {}) };
  },
});

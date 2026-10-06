import { z } from 'zod';
import { definePlugin } from '../types';
import { DAY_MS, dayKey, startOfDayMs } from '../../lib/dates';
import { zoneLocaleShape } from '../fields';
import { getAccessToken, listEvents, parseServiceAccount } from './google';
import { WEATHER_HOST, fetchWeather, weatherSchema } from './weather';
import type { CalendarData } from './types';

/**
 * Read-only view of one shared Google Calendar via a service account.
 * Setup: create a service account, share the calendar with its email ("See all event details"),
 * then `wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON` (the key file) and `GOOGLE_CALENDAR_ID`.
 */
export const configSchema = z.object({
  ...zoneLocaleShape,
  /** How far ahead to fetch. The month grid can navigate within this window. */
  daysAhead: z.number().int().min(7).max(120).default(60),
  /** Optional forecast in the day headers: your latitude and longitude. Sent (rounded) to Open-Meteo, nothing else is. */
  weather: weatherSchema.optional(),
});
export type CalendarConfig = z.infer<typeof configSchema>;

export default definePlugin({
  id: 'calendar',
  name: 'Calendar',
  icon: 'calendar',
  configSchema,
  secrets: ['GOOGLE_SERVICE_ACCOUNT_JSON', 'GOOGLE_CALENDAR_ID'],
  // POST is only for the OAuth token exchange; everything else is GET.
  fetchPolicy: (config: CalendarConfig) => ({
    hosts: ['oauth2.googleapis.com', 'www.googleapis.com', ...(config.weather ? [WEATHER_HOST] : [])],
    methods: ['GET', 'POST'],
  }),
  cacheTtlSeconds: 300,
  async loader({ config, secrets, fetch, now }): Promise<CalendarData> {
    const sa = parseServiceAccount(secrets.GOOGLE_SERVICE_ACCOUNT_JSON!);
    const token = await getAccessToken(fetch, sa, now);
    // From the start of the current month so the month grid is complete.
    const windowStart = startOfDayMs(`${dayKey(now, config.timeZone).slice(0, 8)}01`, config.timeZone);
    const windowEnd = now + config.daysAhead * DAY_MS;
    const events = await listEvents(fetch, token, secrets.GOOGLE_CALENDAR_ID!, windowStart, windowEnd);
    // The forecast is a nicety: if Open-Meteo is down the calendar still loads.
    const weather = config.weather
      ? await fetchWeather(fetch, config.weather, config.timeZone).catch((e) => {
          console.error('plugin calendar: weather failed:', e instanceof Error ? e.message : 'unknown');
          return undefined;
        })
      : undefined;
    return { events, windowStart, windowEnd, ...(weather ? { weather } : {}) };
  },
});

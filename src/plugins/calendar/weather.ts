import { z } from 'zod';

/** Daily forecast shown in the calendar's day headers, from Open-Meteo (free, no key). */
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
export const WEATHER_HOST = new URL(WEATHER_URL).host;

export const weatherSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  units: z.enum(['imperial', 'metric']).default('imperial'),
});
export type WeatherConfig = z.infer<typeof weatherSchema>;

import type { WeatherData } from './weatherView';

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Parses Open-Meteo's `daily` block, skipping any day with missing numbers. */
export function parseForecast(body: unknown, unit: 'F' | 'C'): WeatherData {
  const daily = (body as { daily?: Record<string, unknown> } | null)?.daily;
  const time = daily?.time, codes = daily?.weather_code, hi = daily?.temperature_2m_max, lo = daily?.temperature_2m_min;
  if (!Array.isArray(time) || !Array.isArray(codes) || !Array.isArray(hi) || !Array.isArray(lo)) throw new Error('Open-Meteo response had no daily forecast');
  const days: WeatherData['days'] = {};
  time.forEach((day, i) => {
    const c = num(codes[i]), h = num(hi[i]), l = num(lo[i]);
    if (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && c !== null && h !== null && l !== null) {
      days[day] = { code: c, hi: Math.round(h), lo: Math.round(l) };
    }
  });
  return { unit, days };
}

export async function fetchWeather(fetchFn: typeof fetch, cfg: WeatherConfig, timeZone: string): Promise<WeatherData> {
  const unit = cfg.units === 'metric' ? 'C' : 'F';
  const q = new URLSearchParams({
    // Two decimals (about 1 km) is plenty for a forecast and keeps the exact address of the house out of the request.
    latitude: cfg.latitude.toFixed(2), longitude: cfg.longitude.toFixed(2),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    temperature_unit: unit === 'F' ? 'fahrenheit' : 'celsius',
    timezone: timeZone, forecast_days: '16',
  });
  const res = await fetchFn(`${WEATHER_URL}?${q}`);
  if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
  return parseForecast(await res.json(), unit);
}

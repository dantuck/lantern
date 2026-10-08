import type { WeatherData } from './weatherView';

/** Which subscribed feed an event came from. Absent for the Google calendar. */
export interface CalSource { name: string; color: string }

/** Normalised event. All-day events carry calendar dates (end inclusive); timed events carry epoch ms. */
export type CalEvent =
  | { id: string; title: string; location?: string; source?: CalSource; allDay: true; startDate: string; endDate: string }
  | { id: string; title: string; location?: string; source?: CalSource; allDay: false; start: number; end: number };

export interface CalendarData {
  events: CalEvent[];
  /** Daily forecast, when `weather` is configured and Open-Meteo answered. */
  weather?: WeatherData;
  /** Range the loader fetched (epoch ms). */
  windowStart: number;
  windowEnd: number;
}

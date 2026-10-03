/** Normalised event. All-day events carry calendar dates (end inclusive); timed events carry epoch ms. */
export type CalEvent =
  | { id: string; title: string; location?: string; allDay: true; startDate: string; endDate: string }
  | { id: string; title: string; location?: string; allDay: false; start: number; end: number };

export interface CalendarData {
  events: CalEvent[];
  /** Range the loader fetched (epoch ms). */
  windowStart: number;
  windowEnd: number;
}

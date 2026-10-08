import { dayKey } from '../../lib/dates';
import type { CalEvent } from './types';

export const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** True when the event overlaps [from, to] (epoch ms). All-day events compare by calendar day in `tz`. */
export function inWindow(e: CalEvent, from: number, to: number, tz: string): boolean {
  return e.allDay ? e.endDate >= dayKey(from, tz) && e.startDate <= dayKey(to, tz) : e.end >= from && e.start <= to;
}

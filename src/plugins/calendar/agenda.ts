import { addDays, dayKey, keyOf, weekdayOf } from '../../lib/dates';
import type { CalEvent } from './types';

// Calendar-specific grouping. Generic date helpers live in src/lib/dates.ts.

export interface Day { key: string; events: CalEvent[] }

/** Buckets events into `days` consecutive days from `startKey`; multi-day events appear on every day they cover. */
export function groupByDay(events: CalEvent[], tz: string, startKey: string, days: number): Day[] {
  const out: Day[] = Array.from({ length: days }, (_, i) => ({ key: addDays(startKey, i), events: [] }));
  const first = out[0]!.key;
  const last = out[days - 1]!.key;
  for (const ev of events) {
    let from: string, to: string;
    if (ev.allDay) { from = ev.startDate; to = ev.endDate; }
    else { from = dayKey(ev.start, tz); to = dayKey(Math.max(ev.start, ev.end - 1), tz); }
    if (to < first || from > last) continue;
    for (const day of out) if (day.key >= from && day.key <= to) day.events.push(ev);
  }
  for (const day of out) day.events.sort(compareEvents);
  return out;
}

function compareEvents(a: CalEvent, b: CalEvent): number {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  if (!a.allDay && !b.allDay && a.start !== b.start) return a.start - b.start;
  return a.title.localeCompare(b.title);
}

/** 42 consecutive day keys (6 weeks) covering the month, starting on `weekStart` (0 = Sunday). */
export function monthGrid(year: number, month: number, weekStart = 0): string[] {
  const first = keyOf(year, month, 1);
  const lead = (weekdayOf(first) - weekStart + 7) % 7;
  const start = addDays(first, -lead);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

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
  const start = weekStartKey(keyOf(year, month, 1), weekStart);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** First day of the week containing `key`, where `weekStart` is 0 for Sunday. */
export const weekStartKey = (key: string, weekStart = 0): string => addDays(key, -((weekdayOf(key) - weekStart + 7) % 7));

export type TimedEvent = Extract<CalEvent, { allDay: false }>;
/** A timed event placed on one day's time grid. `top`/`height` are minutes from midnight; `col` of `cols` side-by-side lanes. */
export interface Placed { ev: TimedEvent; top: number; height: number; col: number; cols: number }

const DAY_MINUTES = 1440;
/** Even a zero-length event gets a visible, clickable block. */
const MIN_MINUTES = 20;

/** Lays out the timed events that touch [dayStart, dayEnd) so overlapping events share the width instead of covering each other. */
export function layoutDay(events: CalEvent[], dayStart: number, dayEnd: number): Placed[] {
  const items = events
    .filter((ev): ev is TimedEvent => !ev.allDay)
    .filter((ev) => ev.start < dayEnd && (ev.end > dayStart || ev.start >= dayStart))
    .map((ev) => {
      const top = Math.min(DAY_MINUTES - 1, Math.max(0, (ev.start - dayStart) / 60_000));
      const bottom = Math.min(DAY_MINUTES, (Math.min(ev.end, dayEnd) - dayStart) / 60_000);
      const height = Math.min(DAY_MINUTES - top, Math.max(MIN_MINUTES, bottom - top));
      return { ev, top, height, col: 0, cols: 1 };
    })
    .sort((a, b) => a.top - b.top || b.height - a.height);

  // Sweep through "clusters" of transitively overlapping events; each gets as many lanes as it needs.
  let cluster: Placed[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = 0;
  const close = () => { for (const p of cluster) p.cols = laneEnds.length; cluster = []; laneEnds = []; clusterEnd = 0; };
  for (const p of items) {
    if (p.top >= clusterEnd) close();
    let lane = laneEnds.findIndex((end) => end <= p.top);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = p.top + p.height;
    p.col = lane;
    cluster.push(p);
    clusterEnd = Math.max(clusterEnd, p.top + p.height);
  }
  close();
  return items;
}

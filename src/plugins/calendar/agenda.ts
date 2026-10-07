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

/** A timed event this long that crosses midnight is "long" (a trip, a conference): shown as a banner, not a block in every day. */
const LONG_MS = 18 * 60 * 60_000;
export const isLongEvent = (ev: CalEvent, tz: string): boolean =>
  !ev.allDay && ev.end - ev.start >= LONG_MS && dayKey(ev.start, tz) !== dayKey(ev.end - 1, tz);

/** Events shown as a banner over the days they cover: long timed events and all-day events that run past one day. */
export const isBannerEvent = (ev: CalEvent, tz: string): boolean => (ev.allDay ? ev.startDate !== ev.endDate : isLongEvent(ev, tz));

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

/** A banner laid over the columns of a time grid. `from`/`to` are inclusive column indexes; `opensHere`/`closesHere` say whether the event starts/ends inside the visible columns. */
export interface Span { ev: CalEvent; from: number; to: number; lane: number; opensHere: boolean; closesHere: boolean }

/**
 * Lays banner events over a row of columns (`colDays`: the day each column shows), stacked into lanes so none overlap.
 * `fullWidth` stretches every banner across all columns, for the day view where the columns are people on a single day.
 * `keysOf` gives an event's first and last day.
 */
export function bannerSpans(events: CalEvent[], colDays: string[], keysOf: (ev: CalEvent) => [string, string], fullWidth = false): { spans: Span[]; lanes: number } {
  const first = colDays[0]!, last = colDays[colDays.length - 1]!;
  const items = [...new Map(events.map((ev) => [ev.id, ev])).values()]
    .map((ev) => ({ ev, keys: keysOf(ev) }))
    .sort((x, y) => x.keys[0].localeCompare(y.keys[0]) || x.ev.title.localeCompare(y.ev.title));
  const laneEnds: number[] = [];
  const spans = items.map(({ ev, keys: [a, b] }): Span => {
    const from = fullWidth ? 0 : Math.max(0, colDays.findIndex((d) => d >= a));
    const to = fullWidth ? colDays.length - 1 : colDays.findLastIndex((d) => d <= b);
    let lane = laneEnds.findIndex((end) => end < from);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = to;
    return { ev, from, to, lane, opensHere: a >= first, closesHere: b <= last };
  });
  return { spans, lanes: laneEnds.length };
}

/** The hour rows a time grid shows: 7 AM–9 PM, stretched only as far as a placed event needs. */
export function hourSpan(placed: Placed[], from = 7, to = 21): { first: number; count: number } {
  let lo = from * 60, hi = to * 60;
  for (const p of placed) { lo = Math.min(lo, p.top); hi = Math.max(hi, p.top + p.height); }
  const first = Math.floor(lo / 60);
  return { first, count: Math.min(24, Math.ceil(hi / 60)) - first };
}

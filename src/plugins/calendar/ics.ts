import { addDays, isValidTimeZone, keyOf, zonedTimeMs } from '../../lib/dates';
import { clip } from './events';
import type { CalEvent } from './types';

const MAX_EVENTS = 1000;

/** RFC 5545 line unfolding: a line starting with a space or tab continues the previous one. */
const unfold = (text: string): string[] => text.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);

const unescapeText = (s: string) => s.replace(/\\([nN,;\\])/g, (_, c: string) => (c === 'n' || c === 'N' ? ' ' : c));

interface Prop { value: string; params: Record<string, string> }

function parseLine(line: string): [string, Prop] | null {
  // Name and params end at the first colon outside double quotes.
  let q = false;
  let i = 0;
  for (; i < line.length; i++) {
    if (line[i] === '"') q = !q;
    else if (line[i] === ':' && !q) break;
  }
  if (i >= line.length) return null;
  const [name, ...rawParams] = line.slice(0, i).split(';');
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
  }
  return [name!.toUpperCase(), { value: line.slice(i + 1), params }];
}

type When = { date: string } | { ms: number };

/** DATE ("20261010"), UTC ("…Z"), TZID-qualified or floating (read in `fallbackZone`) date-times. */
function parseWhen(p: Prop, fallbackZone: string): When | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(p.value.trim());
  if (!m) return null;
  const date = keyOf(+m[1]!, +m[2]!, +m[3]!);
  if (m[4] === undefined || p.params.VALUE === 'DATE') return { date };
  const [h, mi, s] = [+m[4], +m[5]!, +(m[6] ?? 0)];
  if (m[7]) return { ms: Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, h, mi, s) };
  const tz = p.params.TZID && isValidTimeZone(p.params.TZID) ? p.params.TZID : fallbackZone;
  return { ms: zonedTimeMs(date, h, mi, s, tz) };
}

/**
 * Parses an iCalendar feed into our minimal event shape. Descriptions, attendees and URLs are never kept.
 * Recurrence rules are not expanded: sports and holiday feeds list each occurrence as its own event.
 * `idPrefix` keeps ids unique across feeds; `fallbackZone` is used for floating times.
 */
export function parseIcs(text: string, idPrefix: string, fallbackZone: string): CalEvent[] {
  const events: CalEvent[] = [];
  let cur: Record<string, Prop> | null = null;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      const ev = cur && toEvent(cur, idPrefix, fallbackZone);
      if (ev) events.push(ev);
      cur = null;
      if (events.length >= MAX_EVENTS) break;
      continue;
    }
    if (!cur) continue;
    const parsed = parseLine(line);
    // First occurrence wins (RECURRENCE-ID overrides are separate VEVENTs and keep their own UID).
    if (parsed && !(parsed[0] in cur)) cur[parsed[0]] = parsed[1];
  }
  return events;
}

function toEvent(p: Record<string, Prop>, idPrefix: string, zone: string): CalEvent | null {
  if (p.STATUS?.value.toUpperCase() === 'CANCELLED' || !p.DTSTART) return null;
  const start = parseWhen(p.DTSTART, zone);
  if (!start) return null;
  const end = p.DTEND ? parseWhen(p.DTEND, zone) : null;
  const uid = p.UID?.value ?? `${p.DTSTART.value}-${p.SUMMARY?.value ?? ''}`;
  const id = `${idPrefix}:${uid}${p['RECURRENCE-ID'] ? `:${p['RECURRENCE-ID'].value}` : ''}`;
  const title = clip(unescapeText(p.SUMMARY?.value ?? '').trim() || '(No title)', 200);
  const loc = p.LOCATION?.value.trim() ? { location: clip(unescapeText(p.LOCATION.value).trim(), 120) } : {};
  if ('date' in start) {
    // DTEND for all-day events is exclusive.
    let endDate = end && 'date' in end ? addDays(end.date, -1) : start.date;
    if (endDate < start.date) endDate = start.date;
    return { id, title, ...loc, allDay: true, startDate: start.date, endDate };
  }
  const endMs = end && 'ms' in end ? end.ms : start.ms;
  return { id, title, ...loc, allDay: false, start: start.ms, end: Math.max(start.ms, endMs) };
}

/** `webcal://` is just https for our purposes. */
export const feedUrl = (url: string): URL => new URL(url.replace(/^webcal:\/\//i, 'https://'));

export async function fetchFeed(fetchFn: typeof fetch, url: string, idPrefix: string, zone: string): Promise<CalEvent[]> {
  const res = await fetchFn(feedUrl(url).toString(), { headers: { Accept: 'text/calendar' } });
  if (!res.ok) throw new Error(`calendar feed ${res.status}`);
  return parseIcs(await res.text(), idPrefix, zone);
}

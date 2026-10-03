/** Pure date helpers shared by plugins. Everything is calendar-date arithmetic in UTC plus Intl for time zones, so no libraries. */

export const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();
function zoneFormatter(tz: string) {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    formatters.set(tz, f);
  }
  return f;
}

function zonedParts(ms: number, tz: string) {
  const p: Record<string, string> = {};
  for (const part of zoneFormatter(tz).formatToParts(ms)) p[part.type] = part.value;
  return { y: +p.year!, m: +p.month!, d: +p.day!, h: +p.hour! % 24, mi: +p.minute!, s: +p.second! };
}

/** ms to add to a UTC instant to get that zone's wall-clock time. */
function offsetMs(tz: string, ms: number): number {
  const p = zonedParts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, '0');
export const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
export const parseKey = (key: string) => ({ y: +key.slice(0, 4), m: +key.slice(5, 7), d: +key.slice(8, 10) });

/** 'YYYY-MM-DD' of an instant, as seen in `tz`. */
export function dayKey(ms: number, tz: string): string {
  const p = zonedParts(ms, tz);
  return keyOf(p.y, p.m, p.d);
}

export function addDays(key: string, n: number): string {
  const { y, m, d } = parseKey(key);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const weekdayOf = (key: string): number => {
  const { y, m, d } = parseKey(key);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

/** The instant at which `key` begins in `tz` (handles DST shifts). */
export function startOfDayMs(key: string, tz: string): number {
  const { y, m, d } = parseKey(key);
  const guess = Date.UTC(y, m - 1, d);
  const off1 = offsetMs(tz, guess);
  let t = guess - off1;
  const off2 = offsetMs(tz, t);
  if (off2 !== off1) t = guess - off2;
  return t;
}

export function formatTime(ms: number, tz: string, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(ms);
}

/** "Today", "Tomorrow", otherwise "Wed, Oct 7". */
/** Formats a calendar-date key ('YYYY-MM-DD'). Pure dates are formatted in UTC so no time zone can shift them. */
export function formatDay(key: string, opts: Intl.DateTimeFormatOptions, locale = 'en-US'): string {
  const { y, m, d } = parseKey(key);
  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...opts }).format(Date.UTC(y, m - 1, d));
}

/** "Today", "Tomorrow", otherwise "Wed, Oct 7". */
export function dayLabel(key: string, todayKey: string, locale = 'en-US'): string {
  if (key === todayKey) return 'Today';
  if (key === addDays(todayKey, 1)) return 'Tomorrow';
  return formatDay(key, { weekday: 'short', month: 'short', day: 'numeric' }, locale);
}

export const isValidTimeZone = (tz: string): boolean => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
};

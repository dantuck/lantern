// Browser-safe: the chores components import this, so it must stay free of zod and other server-side code.
import { addDays, formatDay, parseKey, weekdayOf } from './dates';

export type Period = 'morning' | 'afternoon' | 'evening' | 'any';
export const PERIODS: readonly Period[] = ['morning', 'afternoon', 'evening', 'any'];
/** What each time of day is called until a manager renames it. */
export const PERIOD_LABEL: Record<Period, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', any: 'Any time' };
export const MAX_PERIOD_LABEL = 24;

export const EVERY_DAY = 127;
export const WEEKDAYS_MASK = 0b0111110; // Monday to Friday (bit 0 is Sunday)
export const WEEKENDS_MASK = 0b1000001;

export interface ChoreItem {
  id: string;
  title: string;
  points: number;
  done: boolean;
  /** The time of day it belongs to. */
  period: Period;
  /** Weekday bitmask (bit 0 = Sunday), or null for every day. Ignored when `onceDate` is set. */
  days: number | null;
  /** YYYY-MM-DD for a one-off chore. */
  onceDate: string | null;
  /** 1 for every week, 2 for every other week, and so on up to MAX_EVERY_WEEKS. Always 1 for a one-off. */
  everyWeeks: number;
  /** The Sunday that starts the first week it is on, when `everyWeeks` is more than 1; otherwise null. */
  weekAnchor: string | null;
  /** Whether it is on the schedule for `ChoreState.day`. */
  due: boolean;
  /** Whether a manager skipped it for `ChoreState.day`. It is then left out of the day's list, points and bonus. */
  skipped: boolean;
}
/** Everything one person (or "Anyone") has to do: a single routine, split by time of day. */
export interface Routine {
  id: string;
  /** A person id from dashboard.config, or null for "anyone" (no points are earned on those). */
  person: string | null;
  /** Extra points when every chore due that day in a time of day is ticked (0 for none). */
  bonuses: Record<Period, number>;
  /** Whether today's bonus for each time of day has been paid. */
  bonusEarned: Record<Period, boolean>;
  items: ChoreItem[];
}
export interface Reward {
  id: string;
  name: string;
  cost: number;
  /** The people who may ask for it, or null when everyone may. An empty array means nobody. */
  people: string[] | null;
  /** Minutes of screen time it adds to the person's bank when approved (0 for none). */
  minutes: number;
  /** Paused by a manager: still listed for them, but nobody can ask for it. */
  hidden: boolean;
}
/** A target the whole household works toward. `progress` is every point anyone has earned since it started, capped at `target`. */
export interface Goal { id: string; name: string; target: number; progress: number; claimed: boolean }
/** A person's base daily screen time. Not banked: what is left at the end of the day is gone. */
export interface Allowance {
  /** Minutes on weekdays (and on weekends too when `weekend` is null). */
  weekday: number;
  /** Minutes on Saturday and Sunday, or null for the same as other days. */
  weekend: number | null;
  /** The allowance for `ChoreState.day`. */
  today: number;
  /** Minutes of today's allowance already used. */
  used: number;
}
/** A running (or just finished) screen time countdown. Times are milliseconds on the server's clock; see `ChoreState.now`. */
export interface Timer { startedAt: number; endsAt: number; minutes: number }
/** The sounds a device can play when time is up. They are synthesized in the browser (see chime.ts), so there are no audio files. */
export const SOUNDS = ['chime', 'bell', 'bubbles', 'fanfare', 'gentle'] as const;
export type Sound = (typeof SOUNDS)[number];
export const DEFAULT_SOUND: Sound = 'chime';
export const SOUND_LABEL: Record<Sound, string> = { chime: 'Chime', bell: 'Bell', bubbles: 'Bubbles', fanfare: 'Fanfare', gentle: 'Gentle' };
export const isPeriod = (p: unknown): p is Period => (PERIODS as readonly unknown[]).includes(p);
export const isSound = (s: unknown): s is Sound => (SOUNDS as readonly unknown[]).includes(s);
export interface Redemption { id: string; person: string; rewardName: string; cost: number; minutes: number; requestedAt: number }
export interface LedgerEntry { id: string; person: string; delta: number; kind: 'chore' | 'bonus' | 'redeem' | 'adjust'; note: string; at: number }

export interface ChoreState {
  /** The household's "today" (YYYY-MM-DD) this state was computed for. */
  day: string;
  /** What each time of day is called in this household (a manager's names, or the built-in ones). */
  periodLabels: Record<Period, string>;
  /** Whether the signed-in user is a manager and may change chores, rewards and points. */
  manager: boolean;
  routines: Routine[];
  rewards: Reward[];
  goals: Goal[];
  /** Points per person id. */
  balances: Record<string, number>;
  /** Screen time minutes banked per person id (earned, and kept until used). */
  minutes: Record<string, number>;
  /** Daily screen time allowance per person id, for the people who have one. */
  allowance: Record<string, Allowance>;
  /** The server's clock when this state was read, so a device with a slightly wrong clock still counts down correctly. */
  now: number;
  /** The countdown each person has running (or has just finished and not yet cleared), by person id. */
  timers: Record<string, Timer>;
  /** The sound each person chose for time's up, by person id. People who never chose use the default. */
  sounds: Record<string, Sound>;
  /** Requests waiting for a manager. */
  pending: Redemption[];
  /** The latest point changes, newest first. */
  recent: LedgerEntry[];
}

export const hasDay = (days: number, weekday: number): boolean => ((days >> weekday) & 1) === 1;

export const MAX_EVERY_WEEKS = 4;
type Rotation = { everyWeeks?: number; weekAnchor?: string | null };

/** The Sunday that starts the week `key` falls in (weeks run Sunday to Saturday, as the weekday buttons do). */
export const weekStart = (key: string): string => addDays(key, -weekdayOf(key));

/** Whole weeks from the week of `from` to the week of `to`; negative when `to` is earlier. */
export function weeksApart(from: string, to: string): number {
  const ms = (k: string) => { const { y, m, d } = parseKey(weekStart(k)); return Date.UTC(y, m - 1, d); };
  return Math.round((ms(to) - ms(from)) / (7 * 86_400_000));
}

/** Whether `day` is in a week the chore is on: every week, or every Nth week counted from its anchor. */
export const inRotation = (s: Rotation, day: string): boolean => {
  const n = s.everyWeeks ?? 1;
  return n <= 1 || !s.weekAnchor || (((weeksApart(s.weekAnchor, day) % n) + n) % n) === 0;
};

/** Whether a chore is on for `day`: its one-off date, or else its weekdays (null is every day) in the weeks it is on. */
export const itemDue = (s: { days: number | null; onceDate: string | null } & Rotation, day: string): boolean =>
  s.onceDate !== null ? s.onceDate === day : (s.days === null || hasDay(s.days, weekdayOf(day))) && inRotation(s, day);

/** A one-off whose day is before `day`: finished with, unless it is moved to another date. */
export const isPastOnce = (s: { onceDate: string | null }, day: string): boolean => s.onceDate !== null && s.onceDate < day;

/** Whether a chore is on the schedule for a weekday (0 = Sunday), whatever the date; a one-off counts on the weekday of its date. */
export const itemDueOnWeekday = (s: { days: number | null; onceDate: string | null }, weekday: number): boolean =>
  s.onceDate !== null ? weekdayOf(s.onceDate) === weekday : s.days === null || hasDay(s.days, weekday);

/** Someone whose routine can be managed: a person, or `id: null` for "Anyone". */
export type Owner = { id: string | null; name: string; color: string };
/** A stable key for an owner's id ("anyone" for no one). */
export const ownerKey = (id: string | null): string => id ?? 'anyone';

/** Short weekday names from Sunday, matching the bit order of `days`. */
export const WEEKDAY_SHORT: readonly string[] = Array.from({ length: 7 }, (_, i) => formatDay(`2023-01-0${1 + i}`, { weekday: 'short' }));
export const toggleDay = (days: number, weekday: number): number => days ^ (1 << weekday);

/** "Every day", "Weekdays", "Mon, Wed", or the date for a one-off; with ", every other week" or ", every 3 weeks" when it skips weeks. `names` default to the seven short weekday names from Sunday. */
export function describeSchedule(s: { days: number | null; onceDate: string | null } & Rotation, names: readonly string[] = WEEKDAY_SHORT): string {
  if (s.onceDate !== null) return `Once, ${s.onceDate}`;
  const n = s.everyWeeks ?? 1;
  const base = describeDays(s.days, names);
  return n > 1 ? `${base}, ${n === 2 ? 'every other week' : `every ${n} weeks`}` : base;
}

function describeDays(days: number | null, names: readonly string[]): string {
  if (days === null || days === EVERY_DAY) return 'Every day';
  if (days === WEEKDAYS_MASK) return 'Weekdays';
  if (days === WEEKENDS_MASK) return 'Weekends';
  const picked = names.filter((_, i) => hasDay(days, i));
  return picked.length > 0 ? picked.join(', ') : 'Never';
}

/** Whether a chore is there to do today: on the schedule and not skipped. */
export const onToday = (i: Pick<ChoreItem, 'due' | 'skipped'>): boolean => i.due && !i.skipped;

/** The chores a manager skipped for today, which they can bring back. */
export const skippedToday = (items: readonly ChoreItem[]): ChoreItem[] => items.filter((i) => i.due && i.skipped);

/** The routines with only today's chores; one with nothing to do today is left out. */
export const todaysRoutines = (routines: readonly Routine[]): Routine[] =>
  routines.map((r) => ({ ...r, items: r.items.filter(onToday) })).filter((r) => r.items.length > 0);

/** A chore already set up for someone, offered again when adding one to another person's list. */
export type ChoreTemplate = Pick<ChoreItem, 'title' | 'points' | 'period' | 'days' | 'onceDate' | 'everyWeeks' | 'weekAnchor'>;

/**
 * The chores in the household that could be added to `person`'s list: those on other lists (or earlier on none), matching `query`,
 * leaving out any title they already have and one-offs whose day has passed. A title shared by several is offered once, by its first.
 */
export function choreSuggestions(routines: readonly Routine[], person: string | null, query: string, day: string, limit = 8): ChoreTemplate[] {
  const q = query.trim().toLowerCase();
  const have = new Set(routines.filter((r) => r.person === person).flatMap((r) => r.items.map((i) => i.title.toLowerCase())));
  const out: ChoreTemplate[] = [];
  for (const r of routines) {
    if (r.person === person) continue;
    for (const i of r.items) {
      const t = i.title.toLowerCase();
      if (have.has(t) || (q && !t.includes(q)) || isPastOnce(i, day)) continue;
      have.add(t);
      out.push({ title: i.title, points: i.points, period: i.period, days: i.days, onceDate: i.onceDate, everyWeeks: i.everyWeeks, weekAnchor: i.weekAnchor });
    }
  }
  // Titles starting with the query read as the better match, then alphabetical.
  const rank = (c: ChoreTemplate) => (q && c.title.toLowerCase().startsWith(q) ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || a.title.localeCompare(b.title)).slice(0, limit);
}

/** Chores grouped by time of day, in the order of the day. Times of day with no chores are left out. */
export const sections = <T extends { period: Period }>(items: readonly T[]): { period: Period; items: T[] }[] =>
  PERIODS.map((period) => ({ period, items: items.filter((i) => i.period === period) })).filter((s) => s.items.length > 0);

/** Whether `person` may ask for `reward`: it is open to everyone, or they are among the people it is limited to. */
export const canAsk = (reward: Pick<Reward, 'people'>, person: string): boolean => reward.people === null || reward.people.includes(person);

type Lockable = Pick<ChoreItem, 'period' | 'points' | 'done' | 'due' | 'skipped'>;

/** The times of day that still have a chore due and not done today. Each is its own lock. */
const openPeriods = (items: readonly Lockable[]): Set<Period> => new Set(items.filter((i) => onToday(i) && !i.done).map((i) => i.period));

/**
 * Points still locked today: the points earned from chores in a time of day that is not finished yet cannot be spent until it is.
 * A skipped chore is not due, so skipping can open a lock.
 */
export function lockedPoints(items: readonly Lockable[]): number {
  const open = openPeriods(items);
  return items.reduce((n, i) => (onToday(i) && i.done && open.has(i.period) ? n + i.points : n), 0);
}

/** "Before school and After school" for the unfinished times of day that hold points back, or '' when nothing is held. */
export function holdingLabel(items: readonly Lockable[], labels: Record<Period, string>): string {
  const open = openPeriods(items);
  return PERIODS.filter((p) => open.has(p) && items.some((i) => onToday(i) && i.done && i.points > 0 && i.period === p)).map((p) => labels[p]).join(' and ');
}

/** Points a person earns on a typical day: the chores scheduled each weekday (and each time of day's all-done bonus) averaged over the week. */
export function typicalDailyPoints(routine: Pick<Routine, 'items' | 'bonuses'> | undefined): number {
  if (!routine) return 0;
  const items = routine.items.filter((i) => i.onceDate === null); // a one-off is not part of the routine
  let week = 0;
  for (let d = 0; d < 7; d++) {
    const today = items.filter((i) => itemDueOnWeekday(i, d));
    week += today.reduce((n, i) => n + i.points, 0) + PERIODS.reduce((n, p) => n + (today.some((i) => i.period === p) ? routine.bonuses[p] : 0), 0);
  }
  return week / 7;
}

/** A starting price for a reward: `days` of a typical day's points, or, for screen time, the minutes at `minutesPerPoint`. */
export const suggestedCost = (basis: { perDay: number; days: number } | { minutes: number; minutesPerPoint: number }): number =>
  Math.min(100_000, Math.max(1, Math.round('days' in basis ? basis.perDay * basis.days : basis.minutes / Math.max(1, basis.minutesPerPoint))));

/** What a person can spend now: their points, less what is promised to waiting requests and what an unfinished time of day holds back. */
export function spendable(s: Pick<ChoreState, 'routines' | 'balances' | 'pending'>, person: string): number {
  const held = lockedPoints(s.routines.filter((r) => r.person === person).flatMap((r) => r.items));
  const waiting = s.pending.filter((r) => r.person === person).reduce((n, r) => n + r.cost, 0);
  return Math.max(0, (s.balances[person] ?? 0) - held - waiting);
}

/** Minutes of today's allowance still unused. */
export const allowanceLeft = (a: Allowance | undefined): number => (a ? Math.max(0, a.today - a.used) : 0);

/** Everything a person can spend now: what is left of today's allowance plus the banked minutes. */
export const timeAvailable = (s: Pick<ChoreState, 'minutes' | 'allowance'>, person: string): number => allowanceLeft(s.allowance[person]) + (s.minutes[person] ?? 0);

/** Whether `day` is a Saturday or Sunday, which can have their own allowance. */
export const isWeekend = (day: string): boolean => weekdayOf(day) === 0 || weekdayOf(day) === 6;

/** The allowance for `day`: the weekend amount on Saturday and Sunday when there is one, otherwise the usual daily amount. */
export const allowanceFor = (day: string, weekday: number, weekend: number | null): number => (isWeekend(day) && weekend !== null ? weekend : weekday);

/** A record with the same value for each time of day, for starting a per-period tally. */
export const periodRecord = <T,>(value: T): Record<Period, T> => Object.fromEntries(PERIODS.map((p) => [p, value])) as Record<Period, T>;

/** A weekday mask as stored on a chore: every day is null. */
export const normalizeDays = (mask: number): number | null => (mask === EVERY_DAY ? null : mask);

/** "1 pt" or "5 pts". */
export const ptsLabel = (n: number): string => plural(n, 'pt');

/** "1 chore" or "3 chores". */
export function plural(n: number, noun: string): string { return `${n} ${noun}${n === 1 ? '' : 's'}`; }

/** "Oct 7, 8:02 AM", for the point history. */
export const formatWhen = (ms: number): string => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const LEDGER_LABEL: Record<LedgerEntry['kind'], string> = { chore: 'Chore', bonus: 'Bonus', redeem: 'Reward', adjust: 'Adjustment' };

/** Whole milliseconds left on a timer at `now` (never below zero). */
export const timeLeftMs = (t: Pick<Timer, 'endsAt'>, now: number): number => Math.max(0, t.endsAt - now);

/** "12:05" for 12 minutes 5 seconds, or "1:02:05" past an hour. Rounds up so it never shows 0:00 while time remains. */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), sec = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** Whether a person's timer is still counting down at `now`. */
export const timerRunning = (t: Timer | undefined, now: number): t is Timer => t !== undefined && t.endsAt > now;

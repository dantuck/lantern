// Browser-safe: the chores components import this, so it must stay free of zod and other server-side code.
import { formatDay, weekdayOf } from './dates';

export type Period = 'morning' | 'afternoon' | 'evening' | 'any';
export const PERIODS: readonly Period[] = ['morning', 'afternoon', 'evening', 'any'];
export const PERIOD_LABEL: Record<Period, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', any: 'Any time' };

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
  /** Whether it is on the schedule for `ChoreState.day`. */
  due: boolean;
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
export interface Redemption { id: string; person: string; rewardName: string; cost: number; minutes: number; requestedAt: number }
export interface LedgerEntry { id: string; person: string; delta: number; kind: 'chore' | 'bonus' | 'redeem' | 'adjust'; note: string; at: number }

export interface ChoreState {
  /** The household's "today" (YYYY-MM-DD) this state was computed for. */
  day: string;
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
  /** Requests waiting for a manager. */
  pending: Redemption[];
  /** The latest point changes, newest first. */
  recent: LedgerEntry[];
}

export const hasDay = (days: number, weekday: number): boolean => ((days >> weekday) & 1) === 1;

/** Whether a chore is on for `day`: its one-off date, or else its weekdays (null is every day). */
export const itemDue = (s: { days: number | null; onceDate: string | null }, day: string): boolean =>
  s.onceDate !== null ? s.onceDate === day : s.days === null || hasDay(s.days, weekdayOf(day));

/** Short weekday names from Sunday, matching the bit order of `days`. */
export const WEEKDAY_SHORT: readonly string[] = Array.from({ length: 7 }, (_, i) => formatDay(`2023-01-0${1 + i}`, { weekday: 'short' }));
export const toggleDay = (days: number, weekday: number): number => days ^ (1 << weekday);

/** "Every day", "Weekdays", "Mon, Wed", or the date for a one-off. `names` default to the seven short weekday names from Sunday. */
export function describeSchedule(s: { days: number | null; onceDate: string | null }, names: readonly string[] = WEEKDAY_SHORT): string {
  if (s.onceDate !== null) return `Once, ${s.onceDate}`;
  if (s.days === null || s.days === EVERY_DAY) return 'Every day';
  if (s.days === WEEKDAYS_MASK) return 'Weekdays';
  if (s.days === WEEKENDS_MASK) return 'Weekends';
  const { days } = s; // not null here: that case returned above
  const picked = names.filter((_, i) => hasDay(days, i));
  return picked.length > 0 ? picked.join(', ') : 'Never';
}

/** The routines with only today's chores; one with nothing due today is left out. */
export const todaysRoutines = (routines: readonly Routine[]): Routine[] =>
  routines.map((r) => ({ ...r, items: r.items.filter((i) => i.due) })).filter((r) => r.items.length > 0);

/** Chores grouped by time of day, in the order of the day. Times of day with no chores are left out. */
export const sections = <T extends { period: Period }>(items: readonly T[]): { period: Period; items: T[] }[] =>
  PERIODS.map((period) => ({ period, items: items.filter((i) => i.period === period) })).filter((s) => s.items.length > 0);

/** Whether `person` may ask for `reward`: it is open to everyone, or they are among the people it is limited to. */
export const canAsk = (reward: Pick<Reward, 'people'>, person: string): boolean => reward.people === null || reward.people.includes(person);

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

/** "Oct 7, 8:02 AM", for the point history. */
export const formatWhen = (ms: number): string => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
export const LEDGER_LABEL: Record<LedgerEntry['kind'], string> = { chore: 'Chore', bonus: 'Bonus', redeem: 'Reward', adjust: 'Adjustment' };

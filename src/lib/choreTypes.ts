// Browser-safe: the chores components import this, so it must stay free of zod and other server-side code.
import { formatDay, weekdayOf } from './dates';

export type Period = 'morning' | 'afternoon' | 'evening' | 'any';
export const PERIODS: readonly Period[] = ['morning', 'afternoon', 'evening', 'any'];
export const PERIOD_LABEL: Record<Period, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', any: 'Any time' };

export const EVERY_DAY = 127;
export const WEEKDAYS_MASK = 0b0111110; // Monday to Friday (bit 0 is Sunday)
export const WEEKENDS_MASK = 0b1000001;

export interface ChoreItem { id: string; title: string; points: number; done: boolean }
export interface ChoreList {
  id: string;
  name: string;
  /** A person id from dashboard.config, or null for "anyone" (no points are earned on those). */
  person: string | null;
  period: Period;
  /** Weekday bitmask, bit 0 = Sunday. Ignored when `onceDate` is set. */
  days: number;
  /** YYYY-MM-DD for a one-off list. */
  onceDate: string | null;
  /** Extra points when every item is ticked in a day. */
  bonus: number;
  /** Whether it is on the schedule for `ChoreState.day`. */
  due: boolean;
  /** Whether today's completion bonus has been paid. */
  bonusEarned: boolean;
  items: ChoreItem[];
}
export interface Reward {
  id: string;
  name: string;
  cost: number;
  /** The chore lists whose people may ask for it, or null when everyone may. An empty array means nobody. */
  listIds: string[] | null;
}
export interface Redemption { id: string; person: string; rewardName: string; cost: number; requestedAt: number }
export interface LedgerEntry { id: string; person: string; delta: number; kind: 'chore' | 'bonus' | 'redeem' | 'adjust'; note: string; at: number }

export interface ChoreState {
  /** The household's "today" (YYYY-MM-DD) this state was computed for. */
  day: string;
  /** Whether the signed-in user is a manager and may change lists, rewards and points. */
  manager: boolean;
  lists: ChoreList[];
  rewards: Reward[];
  /** Points per person id. */
  balances: Record<string, number>;
  /** Requests waiting for a manager. */
  pending: Redemption[];
  /** The latest point changes, newest first. */
  recent: LedgerEntry[];
}

export const hasDay = (days: number, weekday: number): boolean => ((days >> weekday) & 1) === 1;

export const isDue = (s: { days: number; onceDate: string | null }, day: string): boolean =>
  s.onceDate !== null ? s.onceDate === day : hasDay(s.days, weekdayOf(day));

/** Short weekday names from Sunday, matching the bit order of `days`. */
export const WEEKDAY_SHORT: readonly string[] = Array.from({ length: 7 }, (_, i) => formatDay(`2023-01-0${1 + i}`, { weekday: 'short' }));
export const toggleDay = (days: number, weekday: number): number => days ^ (1 << weekday);

/** "Every day", "Weekdays", "Mon, Wed", or the date for a one-off. `names` default to the seven short weekday names from Sunday. */
export function describeSchedule(s: { days: number; onceDate: string | null }, names: readonly string[] = WEEKDAY_SHORT): string {
  if (s.onceDate !== null) return `Once, ${s.onceDate}`;
  if (s.days === EVERY_DAY) return 'Every day';
  if (s.days === WEEKDAYS_MASK) return 'Weekdays';
  if (s.days === WEEKENDS_MASK) return 'Weekends';
  const picked = names.filter((_, i) => hasDay(s.days, i));
  return picked.length > 0 ? picked.join(', ') : 'Never';
}

/** Points a list can earn in a day: its items plus the completion bonus. */
export const listPoints = (l: Pick<ChoreList, 'items' | 'bonus'>): number => l.items.reduce((n, i) => n + i.points, 0) + l.bonus;

/** Whether `person` may ask for `reward`: it is open to everyone, or one of its lists belongs to them. */
export const canAsk = (reward: Pick<Reward, 'listIds'>, person: string, lists: readonly Pick<ChoreList, 'id' | 'person'>[]): boolean =>
  reward.listIds === null || lists.some((l) => l.person === person && reward.listIds!.includes(l.id));

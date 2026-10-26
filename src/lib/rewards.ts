import { audit, type User } from './auth/users';
import { addDays, dayKey, msOfDay, startOfDayMs } from './dates';
import { keptOn, untilDoneChecks } from './untilDone';
import { householdZone } from './household';
import { loadHours } from './hours';
import { allowanceFor, closedPeriods, MAX_QUANTITY, redeemCheck, scaled, isSound, itemDue, lockedPoints, type Allowance, type BuyCap, type ChoreState, type Goal, type LedgerEntry, type Period, type Redemption, type Reward, type Sound, type Timer } from './choreTypes';

export const MAX_REWARDS = 40;
export const MAX_GOALS = 20;
export const MAX_PENDING = 20;
const RECENT = 20;
interface GoalRow { id: string; name: string; target: number; claimed_at: number | null; progress: number }
/** Goals with their progress (every positive point earned since they began), unclaimed first. `where` narrows it to one goal. */
const goalsSql = (where = '') => `SELECT g.id, g.name, g.target, g.claimed_at,
  COALESCE((SELECT SUM(delta) FROM reward_ledger WHERE delta > 0 AND at >= g.starts_at), 0) AS progress
  FROM goals g ${where} ORDER BY g.claimed_at IS NOT NULL, g.created_at, g.id`;

/** The sum of a person's `delta` in a ledger table. */
async function sumFor(db: D1Database, table: 'reward_ledger' | 'screentime_ledger', person: string): Promise<number> {
  const r = await db.prepare(`SELECT COALESCE(SUM(delta), 0) AS n FROM ${table} WHERE person = ?`).bind(person).first<{ n: number }>();
  return r?.n ?? 0;
}

export const balanceOf = (db: D1Database, person: string): Promise<number> => sumFor(db, 'reward_ledger', person);

/** Minutes of screen time each person bought with points on `day` (everyone, or just `person`). */
async function boughtToday(db: D1Database, day: string, person?: string): Promise<Map<string, number>> {
  const { results } = await db
    .prepare(`SELECT person, SUM(delta) AS n FROM screentime_ledger WHERE kind = 'earn' AND at >= ? AND at < ?${person ? ' AND person = ?' : ''} GROUP BY person`)
    .bind(startOfDayMs(day, householdZone), startOfDayMs(addDays(day, 1), householdZone), ...(person ? [person] : []))
    .all<{ person: string; n: number }>();
  return new Map(results.map((r) => [r.person, r.n]));
}

/** The points held back on `day` by times of day a person has not finished (see `lockedPoints`). */
export async function lockedFor(db: D1Database, person: string, day: string, now = Date.now()): Promise<number> {
  const [finished, hours, { results }] = await Promise.all([untilDoneChecks(db, day, { person }), loadHours(db), db
    .prepare(`SELECT i.id, i.points, i.period, i.days, i.once_date, i.every_weeks, i.week_anchor, i.until_done, i.optional, c.item_id IS NOT NULL AS done, s.item_id IS NOT NULL AS skipped
      FROM chore_items i JOIN chore_lists l ON l.id = i.list_id
      LEFT JOIN chore_checks c ON c.item_id = i.id AND c.day = ? LEFT JOIN chore_skips s ON s.item_id = i.id AND s.day = ?
      WHERE l.person = ?`)
    .bind(day, day, person)
    .all<{ id: string; points: number; period: Period; days: number | null; once_date: string | null; every_weeks: number; week_anchor: string | null; until_done: number; optional: number; done: number; skipped: number }>()]);
  return lockedPoints(results.map((r) => ({
    period: r.period, points: r.points, optional: r.optional === 1, done: r.done === 1, skipped: r.skipped === 1,
    due: itemDue({ days: r.days, onceDate: r.once_date, everyWeeks: r.every_weeks, weekAnchor: r.week_anchor }, day),
    kept: r.until_done === 1 && keptOn(finished, r.id, day),
  })), closedPeriods(hours, msOfDay(now, householdZone)));
}

export async function rewardState(db: D1Database, day: string, now = Date.now()): Promise<Pick<ChoreState, 'rewards' | 'goals' | 'balances' | 'minutes' | 'allowance' | 'buyCap' | 'now' | 'timers' | 'sounds' | 'pending' | 'recent'>> {
  const [rows, links, ledger, pendingRows, recentRows, goalRows, bankRows, allowanceRows, usedRows, timerRows, soundRows, capRows, bought] = await Promise.all([
    db.prepare('SELECT id, name, cost, minutes, scoped, hidden FROM rewards ORDER BY cost, created_at, id').all<{ id: string; name: string; cost: number; minutes: number; scoped: number; hidden: number }>(),
    db.prepare('SELECT reward_id, person FROM reward_people').all<{ reward_id: string; person: string }>(),
    db.prepare('SELECT person, SUM(delta) AS n FROM reward_ledger GROUP BY person').all<{ person: string; n: number }>(),
    db.prepare("SELECT id, person, reward_name AS rewardName, cost, minutes, requested_at AS requestedAt FROM redemptions WHERE status = 'pending' ORDER BY requested_at, id").all<Redemption>(),
    db.prepare('SELECT id, person, delta, kind, note, at FROM reward_ledger ORDER BY at DESC, id LIMIT ?').bind(RECENT).all<LedgerEntry>(),
    db.prepare(goalsSql()).all<GoalRow>(),
    db.prepare('SELECT person, SUM(delta) AS n FROM screentime_ledger GROUP BY person').all<{ person: string; n: number }>(),
    db.prepare('SELECT person, weekday_minutes AS weekday, weekend_minutes AS weekend FROM screentime_allowance').all<{ person: string; weekday: number; weekend: number | null }>(),
    db.prepare("SELECT person, SUM(allowance_used) AS n FROM screentime_ledger WHERE kind = 'use' AND day = ? GROUP BY person").bind(day).all<{ person: string; n: number }>(),
    db.prepare('SELECT person, started_at AS startedAt, ends_at AS endsAt, minutes FROM screentime_timers').all<Timer & { person: string }>(),
    db.prepare('SELECT person, sound FROM screentime_sound').all<{ person: string; sound: string }>(),
    db.prepare('SELECT person, minutes FROM screentime_buy_cap').all<{ person: string; minutes: number }>(),
    boughtToday(db, day),
  ]);
  const peopleOf = new Map<string, string[]>();
  for (const l of links.results) peopleOf.set(l.reward_id, [...(peopleOf.get(l.reward_id) ?? []), l.person]);
  const rewards: Reward[] = rows.results.map((r) => ({ id: r.id, name: r.name, cost: r.cost, minutes: r.minutes, people: r.scoped ? peopleOf.get(r.id) ?? [] : null, hidden: r.hidden === 1 }));
  const goals: Goal[] = goalRows.results.map((g) => ({ id: g.id, name: g.name, target: g.target, progress: Math.min(g.progress, g.target), claimed: g.claimed_at !== null }));
  const balances: Record<string, number> = {};
  for (const r of ledger.results) balances[r.person] = r.n;
  const minutes: Record<string, number> = {};
  for (const r of bankRows.results) minutes[r.person] = r.n;
  const usedToday = new Map(usedRows.results.map((r) => [r.person, r.n]));
  const allowance: Record<string, Allowance> = {};
  for (const a of allowanceRows.results) {
    allowance[a.person] = { weekday: a.weekday, weekend: a.weekend, today: allowanceFor(day, a.weekday, a.weekend), used: usedToday.get(a.person) ?? 0 };
  }
  const buyCap: Record<string, BuyCap> = {};
  for (const c of capRows.results) buyCap[c.person] = { limit: c.minutes, bought: bought.get(c.person) ?? 0 };
  const timers: Record<string, Timer> = {};
  for (const t of timerRows.results) timers[t.person] = { startedAt: t.startedAt, endsAt: t.endsAt, minutes: t.minutes };
  const sounds: Record<string, Sound> = {};
  for (const r of soundRows.results) if (isSound(r.sound)) sounds[r.person] = r.sound;
  const pending = pendingRows.results;
  const recent = recentRows.results;
  return { rewards, goals, balances, minutes, allowance, buyCap, now, timers, sounds, pending, recent };
}

/**
 * Creates a reward or, given an id, edits it. `people` limits who can ask: an array of person ids, null for everyone, or leave it
 * out to keep an existing reward's scope as it is. An empty array means nobody.
 */
export async function saveReward(
  db: D1Database, input: { name: string; cost: number; minutes?: number; people?: string[] | null; hidden?: boolean }, id?: string, now = Date.now(),
): Promise<'ok' | 'limit' | 'not_found'> {
  let rewardId = id;
  if (id) {
    const r = await db.prepare('UPDATE rewards SET name = ?, cost = ? WHERE id = ?').bind(input.name, input.cost, id).run();
    if ((r.meta.changes ?? 0) === 0) return 'not_found';
  } else {
    const count = await db.prepare('SELECT COUNT(*) AS n FROM rewards').first<{ n: number }>();
    if ((count?.n ?? 0) >= MAX_REWARDS) return 'limit';
    rewardId = crypto.randomUUID();
    await db.prepare('INSERT INTO rewards (id, name, cost, created_at) VALUES (?, ?, ?, ?)').bind(rewardId, input.name, input.cost, now).run();
  }
  if (input.minutes !== undefined) await db.prepare('UPDATE rewards SET minutes = ? WHERE id = ?').bind(input.minutes, rewardId).run();
  if (input.hidden !== undefined) await db.prepare('UPDATE rewards SET hidden = ? WHERE id = ?').bind(input.hidden ? 1 : 0, rewardId).run();
  if (input.people !== undefined) {
    await db.prepare('DELETE FROM reward_people WHERE reward_id = ?').bind(rewardId).run();
    await db.prepare('UPDATE rewards SET scoped = ? WHERE id = ?').bind(input.people === null ? 0 : 1, rewardId).run();
    for (const person of new Set(input.people ?? [])) await db.prepare('INSERT INTO reward_people (reward_id, person) VALUES (?, ?)').bind(rewardId, person).run();
  }
  return 'ok';
}

export async function removeReward(db: D1Database, id: string): Promise<boolean> {
  const r = await db.prepare('DELETE FROM rewards WHERE id = ?').bind(id).run();
  return (r.meta.changes ?? 0) > 0;
}

/**
 * Asks to spend points. Points a time of day is still holding back (see `lockedPoints`) cannot be spent, nor can points already
 * promised to other requests. Screen time is granted at once, within the points, with nothing for a manager to approve; any other
 * reward waits for a manager, and nothing is deducted until they approve it.
 */
export async function requestRedemption(
  db: D1Database, person: string, rewardId: string, now = Date.now(), day = dayKey(now, householdZone), quantity = 1,
): Promise<'ok' | 'not_found' | 'not_eligible' | 'insufficient' | 'locked' | 'limit' | 'daily_limit'> {
  const reward = await db.prepare('SELECT name, cost, minutes, scoped, hidden FROM rewards WHERE id = ?').bind(rewardId).first<{ name: string; cost: number; minutes: number; scoped: number; hidden: number }>();
  if (!reward || reward.hidden) return 'not_found';
  if (reward.scoped) {
    const mine = await db
      .prepare('SELECT 1 AS x FROM reward_people WHERE reward_id = ? AND person = ?')
      .bind(rewardId, person)
      .first();
    if (!mine) return 'not_eligible';
  }
  const instant = reward.minutes > 0;
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY || (!instant && quantity !== 1)) return 'not_found';
  const { cost, minutes, name } = scaled(reward, quantity);
  const [open, points, held, capRow] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN person = ? THEN cost END), 0) AS mine FROM redemptions WHERE status = 'pending'").bind(person).first<{ n: number; mine: number }>(),
    balanceOf(db, person),
    lockedFor(db, person, day, now),
    instant ? Promise.all([db.prepare('SELECT minutes FROM screentime_buy_cap WHERE person = ?').bind(person).first<{ minutes: number }>(), boughtToday(db, day, person)]) : null,
  ]);
  if (!instant && (open?.n ?? 0) >= MAX_PENDING) return 'limit';
  const [cap, bought] = capRow ?? [null, new Map<string, number>()];
  const verdict = redeemCheck(reward, quantity, { balance: points - (open?.mine ?? 0), held, room: cap ? Math.max(0, cap.minutes - (bought.get(person) ?? 0)) : Infinity });
  if (verdict !== 'ok') return verdict;
  const id = crypto.randomUUID();
  await db
    .prepare('INSERT INTO redemptions (id, person, reward_name, cost, minutes, requested_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(id, person, name, cost, minutes, now)
    .run();
  if (instant) await settle(db, id, { person, reward_name: name, cost, minutes }, true, now);
  return 'ok';
}

/** Pays out a pending request (points off, minutes on; a retry cannot do it twice) and marks it decided. */
async function settle(db: D1Database, id: string, r: { person: string; reward_name: string; cost: number; minutes: number }, approve: boolean, now: number): Promise<void> {
  if (approve) {
    // The unique (kind, ref) key means a retry after a failure cannot deduct twice.
    await db
      .prepare("INSERT INTO reward_ledger (id, person, delta, kind, ref, note, at) VALUES (?, ?, ?, 'redeem', ?, ?, ?) ON CONFLICT (kind, ref) DO NOTHING")
      .bind(crypto.randomUUID(), r.person, -r.cost, id, r.reward_name, now)
      .run();
    if (r.minutes > 0) {
      await db
        .prepare("INSERT INTO screentime_ledger (id, person, delta, kind, ref, note, at) VALUES (?, ?, ?, 'earn', ?, ?, ?) ON CONFLICT (kind, ref) DO NOTHING")
        .bind(crypto.randomUUID(), r.person, r.minutes, id, r.reward_name, now)
        .run();
    }
  }
  await db.prepare("UPDATE redemptions SET status = ?, decided_at = ? WHERE id = ? AND status = 'pending'").bind(approve ? 'approved' : 'denied', now, id).run();
}

/** A manager approves (deducting the points) or denies a request. Safe to repeat: only a pending request can be decided. */
export async function decideRedemption(
  db: D1Database, manager: User, id: string, approve: boolean, now = Date.now(),
): Promise<'ok' | 'not_found' | 'insufficient'> {
  const r = await db
    .prepare("SELECT person, reward_name, cost, minutes FROM redemptions WHERE id = ? AND status = 'pending'")
    .bind(id)
    .first<{ person: string; reward_name: string; cost: number; minutes: number }>();
  if (!r) return 'not_found';
  if (approve && (await balanceOf(db, r.person)) < r.cost) return 'insufficient';
  await settle(db, id, r, approve, now);
  await audit(db, manager.id, approve ? 'reward.approved' : 'reward.denied', { person: r.person, reward: r.reward_name, cost: r.cost, minutes: r.minutes }, now);
  return 'ok';
}

/** A manager adds or removes points by hand (a bonus, a correction). */
export async function adjustPoints(db: D1Database, manager: User, person: string, delta: number, note: string, now = Date.now()): Promise<void> {
  await db
    .prepare("INSERT INTO reward_ledger (id, person, delta, kind, ref, note, at) VALUES (?, ?, ?, 'adjust', NULL, ?, ?)")
    .bind(crypto.randomUUID(), person, delta, note, now)
    .run();
  await audit(db, manager.id, 'reward.adjusted', { person, delta, note }, now);
}

/** A manager approves every waiting request that its person can still afford, oldest first; the rest stay waiting. */
export async function approveAffordable(db: D1Database, manager: User, now = Date.now()): Promise<void> {
  const waiting = await db.prepare("SELECT id FROM redemptions WHERE status = 'pending' ORDER BY requested_at, id").all<{ id: string }>();
  for (const r of waiting.results) await decideRedemption(db, manager, r.id, true, now);
}

/** Creates a household goal or, given an id, renames it or changes its target. A new goal counts points from `now`. */
export async function saveGoal(db: D1Database, input: { name: string; target: number }, id?: string, now = Date.now()): Promise<'ok' | 'limit' | 'not_found'> {
  if (id) {
    const r = await db.prepare('UPDATE goals SET name = ?, target = ? WHERE id = ?').bind(input.name, input.target, id).run();
    return (r.meta.changes ?? 0) === 0 ? 'not_found' : 'ok';
  }
  const count = await db.prepare('SELECT COUNT(*) AS n FROM goals').first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_GOALS) return 'limit';
  await db.prepare('INSERT INTO goals (id, name, target, starts_at, created_at) VALUES (?, ?, ?, ?, ?)').bind(crypto.randomUUID(), input.name, input.target, now, now).run();
  return 'ok';
}

export async function removeGoal(db: D1Database, id: string): Promise<boolean> {
  const r = await db.prepare('DELETE FROM goals WHERE id = ?').bind(id).run();
  return (r.meta.changes ?? 0) > 0;
}

/** A manager marks a goal as enjoyed. Only a goal whose target has been reached, and not yet claimed, can be. */
export async function claimGoal(db: D1Database, manager: User, id: string, now = Date.now()): Promise<'ok' | 'not_found' | 'insufficient'> {
  const g = await db.prepare(goalsSql('WHERE g.id = ?')).bind(id).first<GoalRow>();
  if (!g || g.claimed_at !== null) return 'not_found';
  if (g.progress < g.target) return 'insufficient';
  await db.prepare('UPDATE goals SET claimed_at = ? WHERE id = ? AND claimed_at IS NULL').bind(now, id).run();
  await audit(db, manager.id, 'goal.claimed', { goal: g.name, target: g.target }, now);
  return 'ok';
}

export const minutesOf = (db: D1Database, person: string): Promise<number> => sumFor(db, 'screentime_ledger', person);

/** What is left of a person's allowance for `day`: today's amount minus what they have already used. */
async function allowanceLeftOn(db: D1Database, person: string, day: string): Promise<number> {
  const [a, used] = await Promise.all([
    db.prepare('SELECT weekday_minutes AS weekday, weekend_minutes AS weekend FROM screentime_allowance WHERE person = ?').bind(person).first<{ weekday: number; weekend: number | null }>(),
    db.prepare("SELECT COALESCE(SUM(allowance_used), 0) AS n FROM screentime_ledger WHERE person = ? AND kind = 'use' AND day = ?").bind(person, day).first<{ n: number }>(),
  ]);
  return a ? Math.max(0, allowanceFor(day, a.weekday, a.weekend) - (used?.n ?? 0)) : 0;
}

/** Where spent minutes came from: the day's allowance first, then the bank. */
export interface Spent { fromAllowance: number; fromBank: number }

/** Spends screen time on `day`: the day's allowance first, then banked minutes. Never takes the bank below zero. Null when there is not enough. */
export async function spendMinutes(db: D1Database, person: string, minutes: number, day: string, now = Date.now()): Promise<Spent | null> {
  const [left, banked] = await Promise.all([allowanceLeftOn(db, person, day), minutesOf(db, person)]);
  const fromAllowance = Math.min(minutes, left);
  const fromBank = minutes - fromAllowance;
  if (fromBank > banked) return null;
  await db
    .prepare("INSERT INTO screentime_ledger (id, person, delta, kind, ref, note, at, day, allowance_used) VALUES (?, ?, ?, 'use', NULL, '', ?, ?, ?)")
    .bind(crypto.randomUUID(), person, -fromBank, now, day, fromAllowance)
    .run();
  return { fromAllowance, fromBank };
}

/** Like `spendMinutes`, for callers that only need to know whether it worked. */
export async function useMinutes(db: D1Database, person: string, minutes: number, day: string, now = Date.now()): Promise<'ok' | 'insufficient'> {
  return (await spendMinutes(db, person, minutes, day, now)) ? 'ok' : 'insufficient';
}

/** A manager sets a person's daily allowance. `weekend` of null means weekends are the same as other days; zero for both removes it. */
export async function setAllowance(db: D1Database, manager: User, person: string, weekday: number, weekend: number | null, now = Date.now()): Promise<void> {
  if (weekday <= 0 && (weekend === null || weekend <= 0)) await db.prepare('DELETE FROM screentime_allowance WHERE person = ?').bind(person).run();
  else {
    await db
      .prepare('INSERT INTO screentime_allowance (person, weekday_minutes, weekend_minutes) VALUES (?, ?, ?) ON CONFLICT (person) DO UPDATE SET weekday_minutes = excluded.weekday_minutes, weekend_minutes = excluded.weekend_minutes')
      .bind(person, weekday, weekend)
      .run();
  }
  await audit(db, manager.id, 'screentime.allowance', { person, weekday, weekend }, now);
}

/** Sets the most screen time a person can buy with points in a day. Zero removes the limit. */
export async function setBuyCap(db: D1Database, manager: User, person: string, minutes: number, now = Date.now()): Promise<void> {
  if (minutes <= 0) await db.prepare('DELETE FROM screentime_buy_cap WHERE person = ?').bind(person).run();
  else await db.prepare('INSERT INTO screentime_buy_cap (person, minutes) VALUES (?, ?) ON CONFLICT (person) DO UPDATE SET minutes = excluded.minutes').bind(person, minutes).run();
  await audit(db, manager.id, 'screentime.buy_cap', { person, minutes }, now);
}

/** A manager adds or removes banked minutes by hand. Taking away more than the bank holds leaves it at zero. */
export async function adjustMinutes(db: D1Database, manager: User, person: string, delta: number, note: string, now = Date.now()): Promise<void> {
  const applied = Math.max(delta, -(await minutesOf(db, person)));
  if (applied !== 0) {
    await db
      .prepare("INSERT INTO screentime_ledger (id, person, delta, kind, ref, note, at) VALUES (?, ?, ?, 'adjust', NULL, ?, ?)")
      .bind(crypto.randomUUID(), person, applied, note, now)
      .run();
  }
  await audit(db, manager.id, 'screentime.adjusted', { person, delta: applied, note }, now);
}

const pendingMemo = new WeakMap<object, Promise<number>>();

/** How many reward requests wait for a manager. Asked once per request (`scope` is the request's `Astro.locals`), so the layout's badge and a page share one query. */
export function pendingCount(db: D1Database, scope: object): Promise<number> {
  let n = pendingMemo.get(scope);
  if (!n) {
    n = db.prepare("SELECT COUNT(*) AS n FROM redemptions WHERE status = 'pending'").first<{ n: number }>().then((r) => r?.n ?? 0, () => 0);
    pendingMemo.set(scope, n);
  }
  return n;
}

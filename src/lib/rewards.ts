import { audit, type User } from './auth/users';
import { allowanceFor, type Allowance, type ChoreState, type Goal, type LedgerEntry, type Redemption, type Reward } from './choreTypes';

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

export async function rewardState(db: D1Database, day: string): Promise<Pick<ChoreState, 'rewards' | 'goals' | 'balances' | 'minutes' | 'allowance' | 'pending' | 'recent'>> {
  const [rows, links, ledger, pendingRows, recentRows, goalRows, bankRows, allowanceRows, usedRows] = await Promise.all([
    db.prepare('SELECT id, name, cost, minutes, scoped, hidden FROM rewards ORDER BY cost, created_at, id').all<{ id: string; name: string; cost: number; minutes: number; scoped: number; hidden: number }>(),
    db.prepare('SELECT reward_id, person FROM reward_people').all<{ reward_id: string; person: string }>(),
    db.prepare('SELECT person, SUM(delta) AS n FROM reward_ledger GROUP BY person').all<{ person: string; n: number }>(),
    db.prepare("SELECT id, person, reward_name AS rewardName, cost, minutes, requested_at AS requestedAt FROM redemptions WHERE status = 'pending' ORDER BY requested_at, id").all<Redemption>(),
    db.prepare('SELECT id, person, delta, kind, note, at FROM reward_ledger ORDER BY at DESC, id LIMIT ?').bind(RECENT).all<LedgerEntry>(),
    db.prepare(goalsSql()).all<GoalRow>(),
    db.prepare('SELECT person, SUM(delta) AS n FROM screentime_ledger GROUP BY person').all<{ person: string; n: number }>(),
    db.prepare('SELECT person, weekday_minutes AS weekday, weekend_minutes AS weekend FROM screentime_allowance').all<{ person: string; weekday: number; weekend: number | null }>(),
    db.prepare("SELECT person, SUM(allowance_used) AS n FROM screentime_ledger WHERE kind = 'use' AND day = ? GROUP BY person").bind(day).all<{ person: string; n: number }>(),
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
  const pending = pendingRows.results;
  const recent = recentRows.results;
  return { rewards, goals, balances, minutes, allowance, pending, recent };
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

/** Asks to spend points. Nothing is deducted until a manager approves; points already promised to other requests do not count twice. */
export async function requestRedemption(
  db: D1Database, person: string, rewardId: string, now = Date.now(),
): Promise<'ok' | 'not_found' | 'not_eligible' | 'insufficient' | 'limit'> {
  const reward = await db.prepare('SELECT name, cost, minutes, scoped, hidden FROM rewards WHERE id = ?').bind(rewardId).first<{ name: string; cost: number; minutes: number; scoped: number; hidden: number }>();
  if (!reward || reward.hidden) return 'not_found';
  if (reward.scoped) {
    const mine = await db
      .prepare('SELECT 1 AS x FROM reward_people WHERE reward_id = ? AND person = ?')
      .bind(rewardId, person)
      .first();
    if (!mine) return 'not_eligible';
  }
  const open = await db
    .prepare("SELECT COUNT(*) AS n, COALESCE(SUM(CASE WHEN person = ? THEN cost END), 0) AS mine FROM redemptions WHERE status = 'pending'")
    .bind(person)
    .first<{ n: number; mine: number }>();
  if ((open?.n ?? 0) >= MAX_PENDING) return 'limit';
  if ((await balanceOf(db, person)) - (open?.mine ?? 0) < reward.cost) return 'insufficient';
  await db
    .prepare('INSERT INTO redemptions (id, person, reward_name, cost, minutes, requested_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), person, reward.name, reward.cost, reward.minutes, now)
    .run();
  return 'ok';
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
  if (approve) {
    if ((await balanceOf(db, r.person)) < r.cost) return 'insufficient';
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

/** Spends screen time on `day`: the day's allowance first, then banked minutes. Never takes the bank below zero. */
export async function useMinutes(db: D1Database, person: string, minutes: number, day: string, now = Date.now()): Promise<'ok' | 'insufficient'> {
  const [left, banked] = await Promise.all([allowanceLeftOn(db, person, day), minutesOf(db, person)]);
  const fromAllowance = Math.min(minutes, left);
  const fromBank = minutes - fromAllowance;
  if (fromBank > banked) return 'insufficient';
  await db
    .prepare("INSERT INTO screentime_ledger (id, person, delta, kind, ref, note, at, day, allowance_used) VALUES (?, ?, ?, 'use', NULL, '', ?, ?, ?)")
    .bind(crypto.randomUUID(), person, -fromBank, now, day, fromAllowance)
    .run();
  return 'ok';
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

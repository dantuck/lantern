import { audit, type User } from './auth/users';
import type { ChoreState, LedgerEntry, Redemption, Reward } from './choreTypes';

export const MAX_REWARDS = 40;
export const MAX_PENDING = 20;
const RECENT = 20;

export async function balanceOf(db: D1Database, person: string): Promise<number> {
  const r = await db.prepare('SELECT COALESCE(SUM(delta), 0) AS n FROM reward_ledger WHERE person = ?').bind(person).first<{ n: number }>();
  return r?.n ?? 0;
}

export async function rewardState(db: D1Database): Promise<Pick<ChoreState, 'rewards' | 'balances' | 'pending' | 'recent'>> {
  const [rows, links, ledger, pendingRows, recentRows] = await Promise.all([
    db.prepare('SELECT id, name, cost, scoped FROM rewards ORDER BY cost, created_at, id').all<{ id: string; name: string; cost: number; scoped: number }>(),
    db.prepare('SELECT reward_id, list_id FROM reward_lists').all<{ reward_id: string; list_id: string }>(),
    db.prepare('SELECT person, SUM(delta) AS n FROM reward_ledger GROUP BY person').all<{ person: string; n: number }>(),
    db.prepare("SELECT id, person, reward_name AS rewardName, cost, requested_at AS requestedAt FROM redemptions WHERE status = 'pending' ORDER BY requested_at, id").all<Redemption>(),
    db.prepare('SELECT id, person, delta, kind, note, at FROM reward_ledger ORDER BY at DESC, id LIMIT ?').bind(RECENT).all<LedgerEntry>(),
  ]);
  const listsOf = new Map<string, string[]>();
  for (const l of links.results) listsOf.set(l.reward_id, [...(listsOf.get(l.reward_id) ?? []), l.list_id]);
  const rewards: Reward[] = rows.results.map((r) => ({ id: r.id, name: r.name, cost: r.cost, listIds: r.scoped ? listsOf.get(r.id) ?? [] : null }));
  const balances: Record<string, number> = {};
  for (const r of ledger.results) balances[r.person] = r.n;
  const pending = pendingRows.results;
  const recent = recentRows.results;
  return { rewards, balances, pending, recent };
}

/**
 * Creates a reward or, given an id, edits it. `listIds` limits who can ask: an array of chore list ids (only those lists' people),
 * null for everyone, or leave it out to keep an existing reward's scope as it is.
 */
export async function saveReward(
  db: D1Database, input: { name: string; cost: number; listIds?: string[] | null }, id?: string, now = Date.now(),
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
  if (input.listIds !== undefined) {
    await db.prepare('DELETE FROM reward_lists WHERE reward_id = ?').bind(rewardId).run();
    await db.prepare('UPDATE rewards SET scoped = ? WHERE id = ?').bind(input.listIds === null ? 0 : 1, rewardId).run();
    // Only lists that exist are linked, so a stale id from an old page is ignored rather than an error.
    for (const listId of new Set(input.listIds ?? [])) {
      await db.prepare('INSERT INTO reward_lists (reward_id, list_id) SELECT ?, id FROM chore_lists WHERE id = ?').bind(rewardId, listId).run();
    }
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
  const reward = await db.prepare('SELECT name, cost, scoped FROM rewards WHERE id = ?').bind(rewardId).first<{ name: string; cost: number; scoped: number }>();
  if (!reward) return 'not_found';
  if (reward.scoped) {
    const mine = await db
      .prepare('SELECT 1 AS x FROM reward_lists rl JOIN chore_lists l ON l.id = rl.list_id WHERE rl.reward_id = ? AND l.person = ? LIMIT 1')
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
    .prepare('INSERT INTO redemptions (id, person, reward_name, cost, requested_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), person, reward.name, reward.cost, now)
    .run();
  return 'ok';
}

/** A manager approves (deducting the points) or denies a request. Safe to repeat: only a pending request can be decided. */
export async function decideRedemption(
  db: D1Database, manager: User, id: string, approve: boolean, now = Date.now(),
): Promise<'ok' | 'not_found' | 'insufficient'> {
  const r = await db
    .prepare("SELECT person, reward_name, cost FROM redemptions WHERE id = ? AND status = 'pending'")
    .bind(id)
    .first<{ person: string; reward_name: string; cost: number }>();
  if (!r) return 'not_found';
  if (approve) {
    if ((await balanceOf(db, r.person)) < r.cost) return 'insufficient';
    // The unique (kind, ref) key means a retry after a failure cannot deduct twice.
    await db
      .prepare("INSERT INTO reward_ledger (id, person, delta, kind, ref, note, at) VALUES (?, ?, ?, 'redeem', ?, ?, ?) ON CONFLICT (kind, ref) DO NOTHING")
      .bind(crypto.randomUUID(), r.person, -r.cost, id, r.reward_name, now)
      .run();
  }
  await db.prepare("UPDATE redemptions SET status = ?, decided_at = ? WHERE id = ? AND status = 'pending'").bind(approve ? 'approved' : 'denied', now, id).run();
  await audit(db, manager.id, approve ? 'reward.approved' : 'reward.denied', { person: r.person, reward: r.reward_name, cost: r.cost }, now);
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

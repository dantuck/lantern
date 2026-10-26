import { addDays } from './dates';
import { finishedBefore, itemDue } from './choreTypes';

/** Whether an until-done chore was finished earlier in `day`'s week, given what `untilDoneChecks` returned. */
export const keptOn = (checks: Map<string, string[]>, id: string, day: string): boolean => finishedBefore(checks.get(id) ?? [], day) !== null;

/**
 * The days each "until done" chore was ticked in the last two weeks, by chore id: enough to tell if it was finished earlier in any
 * week still in play. Ticks from before a chore was made until-done (or had its schedule changed) do not count. `scope` narrows it to
 * one chore or one person's chores when that is all the caller needs.
 */
export async function untilDoneChecks(db: D1Database, day: string, scope: { item: string } | { person: string } | null = null): Promise<Map<string, string[]>> {
  const filter = scope === null ? '' : 'item' in scope ? ' AND i.id = ?' : ' AND i.list_id IN (SELECT id FROM chore_lists WHERE person = ?)';
  const binds = scope === null ? [] : ['item' in scope ? scope.item : scope.person];
  const { results } = await db
    .prepare(`SELECT c.item_id, c.day FROM chore_checks c JOIN chore_items i ON i.id = c.item_id
      WHERE i.until_done = 1 AND c.day >= ? AND c.day >= COALESCE(i.until_done_from, '')${filter}`)
    .bind(addDays(day, -13), ...binds)
    .all<{ item_id: string; day: string }>();
  const out = new Map<string, string[]>();
  for (const r of results) out.set(r.item_id, [...(out.get(r.item_id) ?? []), r.day]);
  return out;
}

/**
 * Pays the "kept up" points of every until-done chore that was finished earlier in its week: one entry per remaining scheduled day,
 * up to and including `day`. It looks back a week so a day nobody opened the app is still paid. Safe to run on every read: the insert
 * ignores an entry that exists, and a skipped day is never paid. `checks` is what `untilDoneChecks` returned for `day`.
 */
export async function settleKept(db: D1Database, day: string, now: number, checks: Map<string, string[]>): Promise<void> {
  if (checks.size === 0) return;
  const { results: items } = await db
    .prepare(`SELECT i.id, i.title, i.kept_points, i.days, i.every_weeks, i.week_anchor, l.person
      FROM chore_items i JOIN chore_lists l ON l.id = i.list_id WHERE i.until_done = 1 AND i.kept_points > 0 AND l.person IS NOT NULL`)
    .all<{ id: string; title: string; kept_points: number; days: number | null; every_weeks: number; week_anchor: string | null; person: string }>();
  const { results: skips } = await db.prepare('SELECT item_id, day FROM chore_skips WHERE day >= ?').bind(addDays(day, -6)).all<{ item_id: string; day: string }>();
  const skipped = new Set(skips.map((s) => `${s.item_id}:${s.day}`));
  const inserts: D1PreparedStatement[] = [];
  for (const i of items) {
    if (!checks.has(i.id)) continue;
    for (let k = -6; k <= 0; k++) {
      const d = addDays(day, k);
      if (!keptOn(checks, i.id, d) || !itemDue({ days: i.days, onceDate: null, everyWeeks: i.every_weeks, weekAnchor: i.week_anchor }, d) || skipped.has(`${i.id}:${d}`)) continue;
      inserts.push(db
        .prepare("INSERT INTO reward_ledger (id, person, delta, kind, ref, note, at) VALUES (?, ?, ?, 'chore', ?, ?, ?) ON CONFLICT (kind, ref) DO NOTHING")
        .bind(crypto.randomUUID(), i.person, i.kept_points, `${i.id}:${d}`, `Kept up: ${i.title}`, now));
    }
  }
  if (inserts.length > 0) await db.batch(inserts);
}

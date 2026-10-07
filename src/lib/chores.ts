import { addDays, weekdayOf } from './dates';
import { itemDue, periodRecord, PERIODS, type ChoreState, type Period, type Routine } from './choreTypes';
import { rewardState } from './rewards';

export const MAX_ITEMS_PER_ROUTINE = 60;
/** Ticks older than this are dropped; nothing shows past days. */
const KEEP_CHECK_DAYS = 60;

interface RoutineRow { id: string; person: string | null }
interface ItemRow { id: string; list_id: string; title: string; points: number; period: Period; days: number | null; once_date: string | null }

export async function choreState(db: D1Database, day: string, manager: boolean): Promise<ChoreState> {
  // Independent reads, so they go out together rather than one round-trip after another.
  const [routineRows, itemRows, checkRows, paidRows, bonusRows, rewards] = await Promise.all([
    db.prepare('SELECT id, person FROM chore_lists ORDER BY created_at, id').all<RoutineRow>(),
    db.prepare('SELECT id, list_id, title, points, period, days, once_date FROM chore_items ORDER BY created_at, id').all<ItemRow>(),
    db.prepare('SELECT item_id FROM chore_checks WHERE day = ?').bind(day).all<{ item_id: string }>(),
    db.prepare("SELECT ref FROM reward_ledger WHERE kind = 'bonus' AND ref LIKE ?").bind(`%:${day}`).all<{ ref: string }>(),
    db.prepare('SELECT person, period, bonus FROM chore_bonus').all<{ person: string; period: Period; bonus: number }>(),
    rewardState(db, day),
  ]);
  const done = new Set(checkRows.results.map((r) => r.item_id));
  const paid = new Set(paidRows.results.map((r) => r.ref));
  const bonusOf = new Map<string, Record<Period, number>>();
  for (const b of bonusRows.results) {
    const row = bonusOf.get(b.person) ?? periodRecord(0);
    row[b.period] = b.bonus;
    bonusOf.set(b.person, row);
  }
  const itemsByList = new Map<string, ItemRow[]>();
  for (const i of itemRows.results) {
    const group = itemsByList.get(i.list_id);
    if (group) group.push(i); else itemsByList.set(i.list_id, [i]);
  }
  const routines: Routine[] = routineRows.results.map((r) => {
    return {
      id: r.id, person: r.person,
      bonuses: (r.person && bonusOf.get(r.person)) || periodRecord(0),
      bonusEarned: Object.fromEntries(PERIODS.map((p) => [p, r.person !== null && paid.has(`${r.person}:${p}:${day}`)])) as Record<Period, boolean>,
      items: (itemsByList.get(r.id) ?? []).map((i) => ({
        id: i.id, title: i.title, points: i.points, done: done.has(i.id), period: i.period, days: i.days, onceDate: i.once_date,
        due: itemDue({ days: i.days, onceDate: i.once_date }, day),
      })),
    };
  });
  return { day, manager, routines, ...rewards };
}

/** The routine row for a person (or null for "Anyone"), created the first time they are given a chore. */
async function routineFor(db: D1Database, person: string | null, now: number): Promise<string> {
  const found = await db.prepare('SELECT id FROM chore_lists WHERE person IS ?').bind(person).first<{ id: string }>();
  if (found) return found.id;
  const id = crypto.randomUUID();
  await db.prepare("INSERT INTO chore_lists (id, name, person, created_at) VALUES (?, '', ?, ?)").bind(id, person, now).run();
  return id;
}

export interface ChoreInput {
  title: string;
  points: number;
  period: Period;
  /** Weekday bitmask, or null for every day. */
  days: number | null;
  /** A one-off date, which wins over `days`. */
  onceDate: string | null;
}

const validDays = (days: number | null) => days === null || (Number.isInteger(days) && days >= 1 && days <= 127);

export async function addItem(db: D1Database, person: string | null, input: ChoreInput, now = Date.now()): Promise<'ok' | 'limit' | 'bad_request'> {
  if (!validDays(input.days)) return 'bad_request';
  const listId = await routineFor(db, person, now);
  const count = await db.prepare('SELECT COUNT(*) AS n FROM chore_items WHERE list_id = ?').bind(listId).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_ITEMS_PER_ROUTINE) return 'limit';
  await db
    .prepare('INSERT INTO chore_items (id, list_id, title, points, period, days, once_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), listId, input.title, input.points, input.period, input.onceDate === null ? input.days : null, input.onceDate, now)
    .run();
  return 'ok';
}

/** Anything left out of `changes` stays as it is. Giving a date makes it a one-off; giving `onceDate: null` makes it repeat again. */
export async function updateItem(db: D1Database, id: string, changes: Partial<ChoreInput>): Promise<'ok' | 'not_found' | 'bad_request'> {
  const row = await db.prepare('SELECT title, points, period, days, once_date FROM chore_items WHERE id = ?').bind(id).first<{ title: string; points: number; period: Period; days: number | null; once_date: string | null }>();
  if (!row) return 'not_found';
  const next = { title: row.title, points: row.points, period: row.period, days: row.days, onceDate: row.once_date, ...changes };
  if (!validDays(next.days)) return 'bad_request';
  await db
    .prepare('UPDATE chore_items SET title = ?, points = ?, period = ?, days = ?, once_date = ? WHERE id = ?')
    .bind(next.title, next.points, next.period, next.onceDate === null ? next.days : null, next.onceDate, id)
    .run();
  return 'ok';
}

export async function removeItem(db: D1Database, id: string): Promise<boolean> {
  const r = await db.prepare('DELETE FROM chore_items WHERE id = ?').bind(id).run();
  return (r.meta.changes ?? 0) > 0;
}

/** Sets what a person earns for finishing every chore due in a time of day. Zero removes it. */
export async function setBonus(db: D1Database, person: string, period: Period, bonus: number): Promise<void> {
  if (bonus <= 0) await db.prepare('DELETE FROM chore_bonus WHERE person = ? AND period = ?').bind(person, period).run();
  else await db.prepare('INSERT INTO chore_bonus (person, period, bonus) VALUES (?, ?, ?) ON CONFLICT (person, period) DO UPDATE SET bonus = excluded.bonus').bind(person, period, bonus).run();
}

/**
 * Ticks a chore off (or back on) for `day` and keeps the points in step: the chore's points go to its owner, plus their bonus for
 * that time of day once everything due in it is done. Un-ticking takes them back. Ticking twice is harmless, and a chore can only
 * be ticked on a day it is scheduled, so points cannot be farmed from chores that are not due.
 */
export async function setCheck(db: D1Database, id: string, day: string, done: boolean, now = Date.now()): Promise<'ok' | 'not_found' | 'not_due'> {
  const row = await db
    .prepare('SELECT i.title, i.points, i.period, i.days, i.once_date, l.person FROM chore_items i JOIN chore_lists l ON l.id = i.list_id WHERE i.id = ?')
    .bind(id)
    .first<{ title: string; points: number; period: Period; days: number | null; once_date: string | null; person: string | null }>();
  if (!row) return 'not_found';
  if (done && !itemDue({ days: row.days, onceDate: row.once_date }, day)) return 'not_due';
  const ref = `${id}:${day}`;
  if (done) {
    await db.prepare('INSERT INTO chore_checks (item_id, day, done_at) VALUES (?, ?, ?) ON CONFLICT (item_id, day) DO NOTHING').bind(id, day, now).run();
    await db.prepare('DELETE FROM chore_checks WHERE day < ?').bind(addDays(day, -KEEP_CHECK_DAYS)).run();
    if (row.person && row.points > 0) {
      await db
        .prepare("INSERT INTO reward_ledger (id, person, delta, kind, ref, note, at) VALUES (?, ?, ?, 'chore', ?, ?, ?) ON CONFLICT (kind, ref) DO NOTHING")
        .bind(crypto.randomUUID(), row.person, row.points, ref, row.title, now)
        .run();
    }
  } else {
    await db.prepare('DELETE FROM chore_checks WHERE item_id = ? AND day = ?').bind(id, day).run();
    await db.prepare("DELETE FROM reward_ledger WHERE kind = 'chore' AND ref = ?").bind(ref).run();
  }
  await syncBonus(db, row.person, row.period, day, now);
  return 'ok';
}

/** Pays a person's bonus for a time of day when every chore due then is ticked for `day`, and takes it back if one is un-ticked. */
async function syncBonus(db: D1Database, person: string | null, period: Period, day: string, now: number) {
  if (!person) return;
  const set = await db.prepare('SELECT bonus FROM chore_bonus WHERE person = ? AND period = ?').bind(person, period).first<{ bonus: number }>();
  if (!set) return;
  const ref = `${person}:${period}:${day}`;
  const t = await db
    .prepare(`SELECT COUNT(*) AS total, COUNT(c.item_id) AS ticked
      FROM chore_items i JOIN chore_lists l ON l.id = i.list_id LEFT JOIN chore_checks c ON c.item_id = i.id AND c.day = ?
      WHERE l.person = ? AND i.period = ?
        AND CASE WHEN i.once_date IS NOT NULL THEN i.once_date = ? ELSE (i.days IS NULL OR ((i.days >> ?) & 1) = 1) END`)
    .bind(day, person, period, day, weekdayOf(day))
    .first<{ total: number; ticked: number }>();
  if (t && t.total > 0 && t.ticked === t.total) {
    await db
      .prepare("INSERT INTO reward_ledger (id, person, delta, kind, ref, note, at) VALUES (?, ?, ?, 'bonus', ?, 'All done', ?) ON CONFLICT (kind, ref) DO NOTHING")
      .bind(crypto.randomUUID(), person, set.bonus, ref, now)
      .run();
  } else {
    await db.prepare("DELETE FROM reward_ledger WHERE kind = 'bonus' AND ref = ?").bind(ref).run();
  }
}

import { addDays, weekdayOf } from './dates';
import { fitItemDays, isDue, itemDue, type ChoreList, type ChoreState, type Period } from './choreTypes';
import { rewardState } from './rewards';

export const MAX_LISTS = 40;
export const MAX_ITEMS_PER_LIST = 30;
/** Ticks older than this are dropped; nothing shows past days. */
const KEEP_CHECK_DAYS = 60;

interface ListRow { id: string; name: string; person: string | null; period: Period; days: number; once_date: string | null; bonus: number }
interface ItemRow { id: string; list_id: string; title: string; points: number; days: number | null }

const PERIOD_ORDER: Record<Period, number> = { morning: 0, afternoon: 1, evening: 2, any: 3 };

export async function choreState(db: D1Database, day: string, manager: boolean): Promise<ChoreState> {
  // Independent reads, so they go out together rather than one round-trip after another.
  const [listRows, itemRows, checkRows, bonusRows, rewards] = await Promise.all([
    db.prepare('SELECT * FROM chore_lists ORDER BY created_at, id').all<ListRow>(),
    db.prepare('SELECT * FROM chore_items ORDER BY created_at, id').all<ItemRow>(),
    db.prepare('SELECT item_id FROM chore_checks WHERE day = ?').bind(day).all<{ item_id: string }>(),
    db.prepare("SELECT ref FROM reward_ledger WHERE kind = 'bonus' AND ref LIKE ?").bind(`%:${day}`).all<{ ref: string }>(),
    rewardState(db),
  ]);
  const lists = listRows.results;
  const done = new Set(checkRows.results.map((r) => r.item_id));
  const bonusPaid = new Set(bonusRows.results.map((r) => r.ref));
  const itemsByList = new Map<string, ItemRow[]>();
  for (const i of itemRows.results) {
    const group = itemsByList.get(i.list_id);
    if (group) group.push(i); else itemsByList.set(i.list_id, [i]);
  }
  const view: ChoreList[] = lists
    .map((l) => ({
      id: l.id, name: l.name, person: l.person, period: l.period, days: l.days, onceDate: l.once_date, bonus: l.bonus,
      due: isDue({ days: l.days, onceDate: l.once_date }, day),
      bonusEarned: bonusPaid.has(`${l.id}:${day}`),
      items: (itemsByList.get(l.id) ?? []).map((i) => ({ id: i.id, title: i.title, points: i.points, done: done.has(i.id), days: i.days, due: itemDue({ days: l.days, onceDate: l.once_date }, i.days, day) })),
    }))
    .sort((a, b) => PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period]); // stable, so creation order holds within a period
  return { day, manager, lists: view, ...rewards };
}

export interface ListInput {
  name: string;
  person: string | null;
  period: Period;
  days: number;
  onceDate: string | null;
  bonus: number;
}

/** Creates a list (with optional starting chores) or, given an id, updates its settings. */
export async function saveList(
  db: D1Database, input: ListInput, opts: { id?: string; items?: { title: string; points: number; days?: number | null | undefined }[] } = {}, now = Date.now(),
): Promise<'ok' | 'limit' | 'not_found' | 'bad_request'> {
  if (opts.id) {
    const r = await db
      .prepare('UPDATE chore_lists SET name = ?, person = ?, period = ?, days = ?, once_date = ?, bonus = ? WHERE id = ?')
      .bind(input.name, input.person, input.period, input.days, input.onceDate, input.bonus, opts.id)
      .run();
    if ((r.meta.changes ?? 0) === 0) return 'not_found';
    await refitItems(db, opts.id, input);
    return 'ok';
  }
  if ((opts.items ?? []).some((i) => fitItemDays(input, i.days ?? null) === 'outside')) return 'bad_request';
  const count = await db.prepare('SELECT COUNT(*) AS n FROM chore_lists').first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_LISTS) return 'limit';
  const id = crypto.randomUUID();
  await db
    .prepare('INSERT INTO chore_lists (id, name, person, period, days, once_date, bonus, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, input.name, input.person, input.period, input.days, input.onceDate, input.bonus, now)
    .run();
  for (const [i, item] of (opts.items ?? []).slice(0, MAX_ITEMS_PER_LIST).entries()) await addItem(db, id, item.title, item.points, item.days ?? null, now + i);
  return 'ok';
}

/** After a list's schedule changes, trims its chores' own weekdays to the days it still runs. Ones left with none follow the list. */
async function refitItems(db: D1Database, listId: string, list: { days: number; onceDate: string | null }): Promise<void> {
  const { results } = await db.prepare('SELECT id, days FROM chore_items WHERE list_id = ? AND days IS NOT NULL').bind(listId).all<{ id: string; days: number }>();
  for (const i of results) {
    const trimmed = list.onceDate !== null ? 0 : i.days & list.days;
    const next = trimmed === 0 ? null : fitItemDays(list, trimmed);
    if (next !== i.days) await db.prepare('UPDATE chore_items SET days = ? WHERE id = ?').bind(next, i.id).run();
  }
}

export async function removeList(db: D1Database, id: string): Promise<boolean> {
  const r = await db.prepare('DELETE FROM chore_lists WHERE id = ?').bind(id).run();
  return (r.meta.changes ?? 0) > 0;
}

export async function addItem(db: D1Database, listId: string, title: string, points: number, days: number | null = null, now = Date.now()): Promise<'ok' | 'limit' | 'not_found' | 'bad_request'> {
  const list = await db.prepare('SELECT days, once_date FROM chore_lists WHERE id = ?').bind(listId).first<{ days: number; once_date: string | null }>();
  if (!list) return 'not_found';
  const fit = fitItemDays({ days: list.days, onceDate: list.once_date }, days);
  if (fit === 'outside') return 'bad_request';
  const count = await db.prepare('SELECT COUNT(*) AS n FROM chore_items WHERE list_id = ?').bind(listId).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_ITEMS_PER_LIST) return 'limit';
  await db.prepare('INSERT INTO chore_items (id, list_id, title, points, days, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), listId, title, points, fit, now).run();
  return 'ok';
}

/** `days` of undefined leaves the chore's weekdays as they are; null makes it follow its list again. */
export async function updateItem(db: D1Database, id: string, title: string, points: number, days?: number | null): Promise<'ok' | 'not_found' | 'bad_request'> {
  let r;
  if (days === undefined) r = await db.prepare('UPDATE chore_items SET title = ?, points = ? WHERE id = ?').bind(title, points, id).run();
  else {
    const list = await db.prepare('SELECT l.days, l.once_date FROM chore_items i JOIN chore_lists l ON l.id = i.list_id WHERE i.id = ?').bind(id).first<{ days: number; once_date: string | null }>();
    if (!list) return 'not_found';
    const fit = fitItemDays({ days: list.days, onceDate: list.once_date }, days);
    if (fit === 'outside') return 'bad_request';
    r = await db.prepare('UPDATE chore_items SET title = ?, points = ?, days = ? WHERE id = ?').bind(title, points, fit, id).run();
  }
  return (r.meta.changes ?? 0) > 0 ? 'ok' : 'not_found';
}

export async function removeItem(db: D1Database, id: string): Promise<boolean> {
  const r = await db.prepare('DELETE FROM chore_items WHERE id = ?').bind(id).run();
  return (r.meta.changes ?? 0) > 0;
}

/**
 * Ticks a chore off (or back on) for `day` and keeps the points in step: the chore's points go to the list's owner, plus
 * the list's bonus once everything in it is done. Un-ticking takes them back. Ticking twice is harmless, and a chore can
 * only be ticked on a day its list is scheduled, so points cannot be farmed from lists that are not due.
 */
export async function setCheck(db: D1Database, id: string, day: string, done: boolean, now = Date.now()): Promise<'ok' | 'not_found' | 'not_due'> {
  const row = await db
    .prepare('SELECT i.title, i.points, i.days AS item_days, l.id AS list_id, l.person, l.days, l.once_date, l.bonus FROM chore_items i JOIN chore_lists l ON l.id = i.list_id WHERE i.id = ?')
    .bind(id)
    .first<{ title: string; points: number; item_days: number | null; list_id: string; person: string | null; days: number; once_date: string | null; bonus: number }>();
  if (!row) return 'not_found';
  if (done && !itemDue({ days: row.days, onceDate: row.once_date }, row.item_days, day)) return 'not_due';
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
  await syncBonus(db, row.list_id, row.person, row.bonus, row.once_date !== null, day, now);
  return 'ok';
}

/** Pays the list's completion bonus when every chore due that day is ticked for `day`, and takes it back if one is un-ticked. */
async function syncBonus(db: D1Database, listId: string, person: string | null, bonus: number, once: boolean, day: string, now: number) {
  if (!person || bonus <= 0) return;
  const t = await db
    .prepare('SELECT COUNT(*) AS total, COUNT(c.item_id) AS ticked FROM chore_items i LEFT JOIN chore_checks c ON c.item_id = i.id AND c.day = ? WHERE i.list_id = ? AND (i.days IS NULL OR ? = 1 OR ((i.days >> ?) & 1) = 1)')
    .bind(day, listId, once ? 1 : 0, weekdayOf(day))
    .first<{ total: number; ticked: number }>();
  const ref = `${listId}:${day}`;
  if (t && t.total > 0 && t.ticked === t.total) {
    await db
      .prepare("INSERT INTO reward_ledger (id, person, delta, kind, ref, note, at) VALUES (?, ?, ?, 'bonus', ?, 'All done', ?) ON CONFLICT (kind, ref) DO NOTHING")
      .bind(crypto.randomUUID(), person, bonus, ref, now)
      .run();
  } else {
    await db.prepare("DELETE FROM reward_ledger WHERE kind = 'bonus' AND ref = ?").bind(ref).run();
  }
}

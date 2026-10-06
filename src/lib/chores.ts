import { addDays, weekdayOf } from './dates';

export type Repeat = 'daily' | 'weekly' | 'once';
export interface Chore {
  id: string;
  title: string;
  /** A person id from dashboard.config, or null for "anyone". */
  person: string | null;
  repeat: Repeat;
  /** 0 = Sunday, for weekly chores. */
  weekday: number | null;
  /** YYYY-MM-DD, for one-off chores. */
  dueDate: string | null;
}
export interface TodayChore extends Chore { done: boolean }
export interface ChoreState {
  /** The household's "today" (YYYY-MM-DD) this state was computed for. */
  day: string;
  today: TodayChore[];
  /** Every chore, for the manage list. */
  all: Chore[];
}

export const MAX_CHORES = 100;
/** Ticks older than this are dropped; nothing shows past days. */
const KEEP_DONE_DAYS = 60;

interface Row { id: string; title: string; person: string | null; repeat: Repeat; weekday: number | null; due_date: string | null }
const toChore = (r: Row): Chore => ({ id: r.id, title: r.title, person: r.person, repeat: r.repeat, weekday: r.weekday, dueDate: r.due_date });

export const isDue = (c: Chore, day: string): boolean =>
  c.repeat === 'daily' || (c.repeat === 'weekly' ? weekdayOf(day) === c.weekday : c.dueDate === day);

export async function choreState(db: D1Database, day: string): Promise<ChoreState> {
  const { results } = await db.prepare('SELECT * FROM chores ORDER BY created_at, id').all<Row>();
  const all = results.map(toChore);
  const done = new Set(
    (await db.prepare('SELECT chore_id FROM chore_done WHERE day = ?').bind(day).all<{ chore_id: string }>()).results.map((r) => r.chore_id),
  );
  return { day, all, today: all.filter((c) => isDue(c, day)).map((c) => ({ ...c, done: done.has(c.id) })) };
}

export type NewChore = { title: string; person: string | null } & (
  | { repeat: 'daily' }
  | { repeat: 'weekly'; weekday: number }
  | { repeat: 'once'; dueDate: string }
);

export async function addChore(db: D1Database, c: NewChore, now = Date.now()): Promise<'ok' | 'limit'> {
  const count = await db.prepare('SELECT COUNT(*) AS n FROM chores').first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_CHORES) return 'limit';
  await db
    .prepare('INSERT INTO chores (id, title, person, repeat, weekday, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), c.title, c.person, c.repeat, c.repeat === 'weekly' ? c.weekday : null, c.repeat === 'once' ? c.dueDate : null, now)
    .run();
  return 'ok';
}

export async function removeChore(db: D1Database, id: string): Promise<boolean> {
  const r = await db.prepare('DELETE FROM chores WHERE id = ?').bind(id).run();
  return (r.meta.changes ?? 0) > 0;
}

/** Ticks a chore off (or back on) for `day`. False if the chore does not exist. */
export async function setChoreDone(db: D1Database, id: string, day: string, done: boolean, now = Date.now()): Promise<boolean> {
  if (!(await db.prepare('SELECT 1 AS x FROM chores WHERE id = ?').bind(id).first())) return false;
  if (done) {
    await db.prepare('INSERT INTO chore_done (chore_id, day, done_at) VALUES (?, ?, ?) ON CONFLICT (chore_id, day) DO NOTHING').bind(id, day, now).run();
    await db.prepare('DELETE FROM chore_done WHERE day < ?').bind(addDays(day, -KEEP_DONE_DAYS)).run();
  } else {
    await db.prepare('DELETE FROM chore_done WHERE chore_id = ? AND day = ?').bind(id, day).run();
  }
  return true;
}

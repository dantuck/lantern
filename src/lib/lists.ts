export interface ListItem { id: string; text: string; done: boolean }
export interface HList { id: string; name: string; items: ListItem[] }

export const MAX_LISTS = 20;
export const MAX_ITEMS = 200;

export async function getLists(db: D1Database): Promise<HList[]> {
  const lists = (await db.prepare('SELECT id, name FROM lists ORDER BY created_at, id').all<{ id: string; name: string }>()).results;
  const items = (await db
    .prepare('SELECT id, list_id, text, done_at FROM list_items ORDER BY created_at, id')
    .all<{ id: string; list_id: string; text: string; done_at: number | null }>()).results;
  return lists.map((l) => ({
    ...l,
    items: items.filter((i) => i.list_id === l.id).map((i) => ({ id: i.id, text: i.text, done: i.done_at !== null })),
  }));
}

export async function addList(db: D1Database, name: string, now = Date.now()): Promise<'ok' | 'limit'> {
  const count = await db.prepare('SELECT COUNT(*) AS n FROM lists').first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_LISTS) return 'limit';
  await db.prepare('INSERT INTO lists (id, name, created_at) VALUES (?, ?, ?)').bind(crypto.randomUUID(), name, now).run();
  return 'ok';
}

export async function removeList(db: D1Database, id: string): Promise<boolean> {
  return ((await db.prepare('DELETE FROM lists WHERE id = ?').bind(id).run()).meta.changes ?? 0) > 0;
}

export async function addItem(db: D1Database, listId: string, text: string, now = Date.now()): Promise<'ok' | 'not_found' | 'limit'> {
  if (!(await db.prepare('SELECT 1 AS x FROM lists WHERE id = ?').bind(listId).first())) return 'not_found';
  const count = await db.prepare('SELECT COUNT(*) AS n FROM list_items WHERE list_id = ?').bind(listId).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_ITEMS) return 'limit';
  await db.prepare('INSERT INTO list_items (id, list_id, text, done_at, created_at) VALUES (?, ?, ?, NULL, ?)').bind(crypto.randomUUID(), listId, text, now).run();
  return 'ok';
}

export async function setItemDone(db: D1Database, itemId: string, done: boolean, now = Date.now()): Promise<boolean> {
  return ((await db.prepare('UPDATE list_items SET done_at = ? WHERE id = ?').bind(done ? now : null, itemId).run()).meta.changes ?? 0) > 0;
}

export async function removeItem(db: D1Database, itemId: string): Promise<boolean> {
  return ((await db.prepare('DELETE FROM list_items WHERE id = ?').bind(itemId).run()).meta.changes ?? 0) > 0;
}

/** Removes every ticked-off item from one list. */
export async function clearDone(db: D1Database, listId: string): Promise<void> {
  await db.prepare('DELETE FROM list_items WHERE list_id = ? AND done_at IS NOT NULL').bind(listId).run();
}

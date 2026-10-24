// The managers' inbox: what happened in the household, kept so a manager sees it whether or not they were sent an email or push.
// Waiting reward requests are not copied here; the inbox page reads them live (see rewardState), so approving one removes it everywhere.
import type { NotifyKind } from './managerNotify';

/** Entries older than this are dropped when a new one is added. */
export const INBOX_KEEP_MS = 14 * 24 * 60 * 60 * 1000;
/** The most entries kept, newest first, whatever their age. */
export const INBOX_MAX = 100;

export interface InboxEntry { id: string; kind: NotifyKind; headline: string; detail: string; path: string; createdAt: number }

/** Adds an entry, and trims the feed to the last two weeks and `INBOX_MAX` entries. */
export async function addInbox(db: D1Database, e: Pick<InboxEntry, 'kind' | 'headline' | 'detail' | 'path'>, now = Date.now()): Promise<void> {
  await db.prepare('INSERT INTO inbox (id, kind, headline, detail, path, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), e.kind, e.headline, e.detail, e.path, now).run();
  // Both limits are range deletes on the created_at index: older than the cutoff, or older than the INBOX_MAX-th newest entry.
  await db.prepare('DELETE FROM inbox WHERE created_at < ?1 OR created_at < COALESCE((SELECT created_at FROM inbox ORDER BY created_at DESC LIMIT 1 OFFSET ?2), 0)')
    .bind(now - INBOX_KEEP_MS, INBOX_MAX - 1).run();
}

/** Newest first. */
export async function listInbox(db: D1Database): Promise<InboxEntry[]> {
  const r = await db.prepare('SELECT id, kind, headline, detail, path, created_at AS createdAt FROM inbox ORDER BY created_at DESC, id LIMIT ?').bind(INBOX_MAX).all<InboxEntry>();
  return r.results;
}

/** When this manager last opened the inbox, or 0 if never. */
export async function seenAt(db: D1Database, userId: string): Promise<number> {
  return (await db.prepare('SELECT seen_at FROM inbox_seen WHERE user_id = ?').bind(userId).first<{ seen_at: number }>())?.seen_at ?? 0;
}

/** Entries this manager has not seen yet. An entry made by their own action is still counted; it is their feed of the household. */
export async function unreadCount(db: D1Database, userId: string): Promise<number> {
  const r = await db.prepare('SELECT COUNT(*) AS n FROM inbox WHERE created_at > COALESCE((SELECT seen_at FROM inbox_seen WHERE user_id = ?), 0)').bind(userId).first<{ n: number }>();
  return r?.n ?? 0;
}

/** Marks everything up to now as seen by this manager. */
export async function markSeen(db: D1Database, userId: string, now = Date.now()): Promise<void> {
  await db.prepare('INSERT INTO inbox_seen (user_id, seen_at) VALUES (?1, ?2) ON CONFLICT (user_id) DO UPDATE SET seen_at = MAX(seen_at, ?2)').bind(userId, now).run();
}

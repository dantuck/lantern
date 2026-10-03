import { randomToken, sha256Hex } from './crypto';
import {
  DAY, SESSION_ABSOLUTE_TTL, SESSION_IDLE_TTL, SESSION_TOUCH_INTERVAL, isSessionValid, needsTouch, slideExpiry,
} from './policy';
import { audit, type User, type Role } from './users';

export interface Session {
  idHash: string;
  userId: string;
  deviceLabel: string;
  createdAt: number;
  lastSeen: number;
  expiresAt: number;
}

export function deviceLabel(userAgent: string | null): string {
  const ua = userAgent ?? '';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS'
    : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Unknown device';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${br} on ${os}`;
}

/** Returns the raw session id for the cookie; only its hash is stored. */
export async function createSession(db: D1Database, userId: string, label: string, now = Date.now()) {
  const id = randomToken();
  await db
    .prepare('INSERT INTO sessions (id_hash, user_id, device_label, created_at, last_seen, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(await sha256Hex(id), userId, label.slice(0, 80), now, now, now + SESSION_IDLE_TTL)
    .run();
  // The browser cookie lives for the absolute cap; the server enforces the sliding idle window.
  return { id, maxAgeSeconds: Math.floor(SESSION_ABSOLUTE_TTL / 1000) };
}

interface SessionJoinRow {
  id_hash: string; user_id: string; device_label: string; created_at: number; last_seen: number;
  expires_at: number; revoked_at: number | null;
  email: string; role: Role; u_created: number; disabled_at: number | null;
}

/** Validates a cookie value, slides the expiry (throttled) and returns the session plus its active user. */
export async function validateSession(
  db: D1Database,
  rawId: string | undefined,
  now = Date.now(),
): Promise<{ session: Session; user: User } | null> {
  if (!rawId || rawId.length > 128) return null;
  const idHash = await sha256Hex(rawId);
  const r = await db
    .prepare(
      `SELECT s.id_hash, s.user_id, s.device_label, s.created_at, s.last_seen, s.expires_at, s.revoked_at,
              u.email, u.role, u.created_at AS u_created, u.disabled_at
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id_hash = ?`,
    )
    .bind(idHash)
    .first<SessionJoinRow>();
  if (!r || r.disabled_at !== null) return null;

  const times = { createdAt: r.created_at, lastSeen: r.last_seen, expiresAt: r.expires_at, revokedAt: r.revoked_at };
  if (!isSessionValid(times, now)) return null;

  let { last_seen: lastSeen, expires_at: expiresAt } = r;
  if (needsTouch(times, now)) {
    lastSeen = now;
    expiresAt = slideExpiry(r.created_at, now);
    await db.prepare('UPDATE sessions SET last_seen = ?, expires_at = ? WHERE id_hash = ? AND revoked_at IS NULL')
      .bind(lastSeen, expiresAt, idHash).run();
  }
  return {
    session: { idHash, userId: r.user_id, deviceLabel: r.device_label, createdAt: r.created_at, lastSeen, expiresAt },
    user: { id: r.user_id, email: r.email, role: r.role, createdAt: r.u_created, disabledAt: r.disabled_at },
  };
}

export async function revokeSessionByRawId(db: D1Database, rawId: string, now = Date.now()) {
  await db.prepare('UPDATE sessions SET revoked_at = ? WHERE id_hash = ? AND revoked_at IS NULL')
    .bind(now, await sha256Hex(rawId)).run();
}

/** Revoke by hash id (a member only their own, a manager anyone's), and record who did it. */
export async function revokeSession(db: D1Database, actor: User, idHash: string, now = Date.now()): Promise<boolean> {
  const stmt = db.prepare(`UPDATE sessions SET revoked_at = ?1 WHERE id_hash = ?2 AND revoked_at IS NULL${actor.role === 'manager' ? '' : ' AND user_id = ?3'} RETURNING user_id`);
  const row = await (actor.role === 'manager' ? stmt.bind(now, idHash) : stmt.bind(now, idHash, actor.id)).first<{ user_id: string }>();
  if (!row) return false;
  await audit(db, actor.id, 'session.revoked', { userId: row.user_id, self: row.user_id === actor.id }, now);
  return true;
}

/** Signs a user out everywhere, optionally keeping one device (the one they are using). */
export async function revokeAllForUser(db: D1Database, userId: string, exceptIdHash?: string, now = Date.now()) {
  await db.prepare('UPDATE sessions SET revoked_at = ?1 WHERE user_id = ?2 AND revoked_at IS NULL AND id_hash != ?3')
    .bind(now, userId, exceptIdHash ?? '').run();
  await audit(db, userId, exceptIdHash ? 'session.revoked_others' : 'session.revoked_all', undefined, now);
}

export async function listSessions(db: D1Database, userId: string, now = Date.now()) {
  const { results } = await db
    .prepare('SELECT id_hash, device_label, created_at, last_seen FROM sessions WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ? ORDER BY last_seen DESC')
    .bind(userId, now).all<{ id_hash: string; device_label: string; created_at: number; last_seen: number }>();
  return results;
}

export async function purgeSessions(db: D1Database, now = Date.now()) {
  await db.prepare('DELETE FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL AND revoked_at < ?')
    .bind(now - SESSION_TOUCH_INTERVAL, now - 30 * DAY).run();
}

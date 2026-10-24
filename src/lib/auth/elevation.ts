import { ELEVATION_MINUTES, ELEVATION_REQUEST_TTL, MINUTE } from './policy';
import { audit, type User } from './users';

/** 6 random digits, drawn without modulo bias. */
function randomCode(): string {
  const limit = 2 ** 32 - (2 ** 32 % 1e6);
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0]! >= limit);
  return String(buf[0]! % 1e6).padStart(6, '0');
}

/** Strips spaces and dashes so "123 456" matches "123456". Returns '' unless exactly 6 digits remain. */
export function normalizeElevationCode(input: string): string {
  const digits = input.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(digits) ? digits : '';
}

export const isElevationMinutes = (n: number): n is (typeof ELEVATION_MINUTES)[number] =>
  (ELEVATION_MINUTES as readonly number[]).includes(n);

export interface ElevationRequest { code: string; expiresAt: number }

/** The open request for this device, if any. */
export async function pendingRequest(db: D1Database, sessionHash: string, now = Date.now()): Promise<ElevationRequest | null> {
  const r = await db.prepare('SELECT code, expires_at FROM elevation_requests WHERE session_hash = ? AND expires_at > ?')
    .bind(sessionHash, now).first<{ code: string; expires_at: number }>();
  return r ? { code: r.code, expiresAt: r.expires_at } : null;
}

/**
 * Asks for manager access on this device. Asking again while a request is open returns the same code. Only a member's
 * session can ask: a manager's own session is already one.
 */
export async function requestElevation(db: D1Database, user: User, sessionHash: string, now = Date.now()): Promise<ElevationRequest | null> {
  if (user.role !== 'member') return null;
  const open = await pendingRequest(db, sessionHash, now);
  if (open) return open;
  await db.prepare('DELETE FROM elevation_requests WHERE expires_at <= ?').bind(now).run();
  const expiresAt = now + ELEVATION_REQUEST_TTL;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomCode();
    // The code is unique among open requests; a clash (or a racing request from the same device) just draws again.
    const r = await db.prepare('INSERT OR IGNORE INTO elevation_requests (session_hash, code, expires_at) VALUES (?, ?, ?)')
      .bind(sessionHash, code, expiresAt).run();
    if (r.meta.changes === 1) return { code, expiresAt };
    const raced = await pendingRequest(db, sessionHash, now);
    if (raced) return raced;
  }
  return null;
}

export interface RequestingDevice { deviceLabel: string; email: string }

/** Which device is behind a code, for the manager to check before approving. */
export async function findRequest(db: D1Database, code: string, now = Date.now()): Promise<RequestingDevice | null> {
  const digits = normalizeElevationCode(code);
  if (!digits) return null;
  return db.prepare(
    `SELECT s.device_label AS deviceLabel, u.email
     FROM elevation_requests q JOIN sessions s ON s.id_hash = q.session_hash JOIN users u ON u.id = s.user_id
     WHERE q.code = ?1 AND q.expires_at > ?2 AND s.revoked_at IS NULL AND s.expires_at > ?2
       AND u.role = 'member' AND u.disabled_at IS NULL`,
  ).bind(digits, now).first<RequestingDevice>();
}

/**
 * A manager grants the device behind `code` manager access for `minutes`. The code is burned first, so it works once.
 * Returns what was approved, or null for a wrong, used, expired or no-longer-valid code, or a non-manager.
 */
export async function approveElevation(
  db: D1Database, manager: User, code: string, minutes: number, now = Date.now(),
): Promise<RequestingDevice | null> {
  if (manager.role !== 'manager' || manager.disabledAt !== null || !isElevationMinutes(minutes)) return null;
  const digits = normalizeElevationCode(code);
  if (!digits) return null;
  const burned = await db.prepare('DELETE FROM elevation_requests WHERE code = ?1 AND expires_at > ?2 RETURNING session_hash')
    .bind(digits, now).first<{ session_hash: string }>();
  if (!burned) return null;
  const until = now + minutes * MINUTE;
  const s = await db.prepare(
    `UPDATE sessions SET elevated_by = ?1, elevated_until = ?2
     WHERE id_hash = ?3 AND revoked_at IS NULL AND expires_at > ?4
       AND user_id IN (SELECT id FROM users WHERE role = 'member' AND disabled_at IS NULL)
     RETURNING user_id, device_label`,
  ).bind(manager.id, until, burned.session_hash, now).first<{ user_id: string; device_label: string }>();
  if (!s) return null;
  const member = await db.prepare('SELECT email FROM users WHERE id = ?').bind(s.user_id).first<{ email: string }>();
  await audit(db, manager.id, 'elevation.approved', { userId: s.user_id, device: s.device_label, minutes }, now);
  return { deviceLabel: s.device_label, email: member?.email ?? '' };
}

/** Ends manager access on this device now (and withdraws an open request). Safe to repeat. */
export async function endElevation(db: D1Database, actor: User, sessionHash: string, now = Date.now()): Promise<void> {
  const r = await db.prepare(
    'UPDATE sessions SET elevated_by = NULL, elevated_until = NULL WHERE id_hash = ? AND elevated_until IS NOT NULL',
  ).bind(sessionHash).run();
  await db.prepare('DELETE FROM elevation_requests WHERE session_hash = ?').bind(sessionHash).run();
  if (r.meta.changes > 0) await audit(db, actor.id, 'elevation.ended', undefined, now);
}

import { isPlausibleEmail, normalizeEmail } from './crypto';
import { INVITE_TTL } from './policy';

export type Role = 'manager' | 'member';
export interface User {
  id: string;
  email: string;
  role: Role;
  createdAt: number;
  disabledAt: number | null;
}

interface UserRow {
  id: string;
  email: string;
  role: Role;
  created_at: number;
  disabled_at: number | null;
}
const toUser = (r: UserRow): User => ({
  id: r.id, email: r.email, role: r.role, createdAt: r.created_at, disabledAt: r.disabled_at,
});

export async function audit(db: D1Database, actorId: string | null, event: string, detail?: unknown, now = Date.now()) {
  await db
    .prepare('INSERT INTO audit_log (at, actor_id, event, detail) VALUES (?, ?, ?, ?)')
    .bind(now, actorId, event, detail === undefined ? null : JSON.stringify(detail))
    .run();
}

export async function listUsers(db: D1Database): Promise<User[]> {
  const { results } = await db.prepare('SELECT * FROM users ORDER BY created_at').all<UserRow>();
  return results.map(toUser);
}

/**
 * Decide who a login request is for, creating the user if (and only if) the email
 * was invited or is the one-time bootstrap manager. Returns null for everyone else;
 * callers must respond identically in both cases to avoid user enumeration.
 */
export async function resolveLoginUser(
  db: D1Database,
  rawEmail: string,
  opts: { bootstrapEmail?: string | undefined; now?: number },
): Promise<User | null> {
  const now = opts.now ?? Date.now();
  const email = normalizeEmail(rawEmail);
  if (!isPlausibleEmail(email)) return null;

  const existing = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (existing) return existing.disabled_at === null ? toUser(existing) : null;

  const invite = await db
    .prepare(
      `UPDATE invites SET used_at = ?1
       WHERE id = (SELECT id FROM invites WHERE email = ?2 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?1
                   ORDER BY expires_at DESC LIMIT 1)
       RETURNING role`,
    )
    .bind(now, email)
    .first<{ role: Role }>();

  let role: Role | null = invite?.role ?? null;
  if (!role && opts.bootstrapEmail && normalizeEmail(opts.bootstrapEmail) === email) {
    const { n } = (await db.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>())!;
    if (n === 0) role = 'manager';
  }
  if (!role) return null;

  const id = crypto.randomUUID();
  await db
    .prepare('INSERT OR IGNORE INTO users (id, email, role, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, email, role, now)
    .run();
  const created = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<UserRow>();
  if (!created) return null;
  await audit(db, created.id, invite ? 'user.created_from_invite' : 'user.bootstrapped', { email }, now);
  return toUser(created);
}

export async function createInvite(
  db: D1Database,
  manager: User,
  rawEmail: string,
  role: Role = 'member',
  now = Date.now(),
): Promise<{ ok: true; email: string } | { ok: false; error: 'forbidden' | 'invalid_email' | 'already_a_user' }> {
  if (manager.role !== 'manager' || manager.disabledAt !== null) return { ok: false, error: 'forbidden' };
  const email = normalizeEmail(rawEmail);
  if (!isPlausibleEmail(email)) return { ok: false, error: 'invalid_email' };
  const exists = await db.prepare('SELECT 1 AS x FROM users WHERE email = ?').bind(email).first();
  if (exists) return { ok: false, error: 'already_a_user' };
  await db
    .prepare('INSERT INTO invites (id, email, role, invited_by, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), email, role, manager.id, now + INVITE_TTL)
    .run();
  await audit(db, manager.id, 'invite.created', { email, role }, now);
  return { ok: true, email };
}

export async function revokeInvite(db: D1Database, manager: User, inviteId: string, now = Date.now()) {
  if (manager.role !== 'manager') return false;
  const r = await db
    .prepare('UPDATE invites SET revoked_at = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL')
    .bind(now, inviteId)
    .run();
  if (r.meta.changes > 0) await audit(db, manager.id, 'invite.revoked', { inviteId }, now);
  return r.meta.changes > 0;
}

export async function listPendingInvites(db: D1Database, now = Date.now()) {
  const { results } = await db
    .prepare('SELECT id, email, role, expires_at FROM invites WHERE used_at IS NULL AND revoked_at IS NULL AND expires_at > ? ORDER BY expires_at')
    .bind(now)
    .all<{ id: string; email: string; role: Role; expires_at: number }>();
  return results;
}

/**
 * Role change / disable. "Never leave the household without an active manager" is enforced inside each UPDATE rather
 * than in a prior read: D1 runs each statement atomically, whereas read-then-write can be raced by two managers acting
 * at once. A blocked UPDATE matches no rows, which is how we know to refuse. (Send one kind of change per call.)
 */
export async function updateUser(
  db: D1Database,
  manager: User,
  targetId: string,
  change: { role?: Role; disabled?: boolean },
  now = Date.now(),
): Promise<{ ok: true } | { ok: false; error: 'forbidden' | 'not_found' | 'last_manager' }> {
  if (manager.role !== 'manager' || manager.disabledAt !== null) return { ok: false, error: 'forbidden' };
  if (!(await db.prepare('SELECT 1 AS x FROM users WHERE id = ?').bind(targetId).first())) return { ok: false, error: 'not_found' };

  const OTHER_ACTIVE_MANAGER = "(SELECT COUNT(*) FROM users WHERE role = 'manager' AND disabled_at IS NULL AND id != ?1) > 0";

  if (change.role) {
    const r = change.role === 'member'
      ? await db.prepare(`UPDATE users SET role = 'member' WHERE id = ?1 AND (role != 'manager' OR ${OTHER_ACTIVE_MANAGER})`).bind(targetId).run()
      : await db.prepare("UPDATE users SET role = 'manager' WHERE id = ?1").bind(targetId).run();
    if (r.meta.changes === 0) return { ok: false, error: 'last_manager' };
  }
  if (change.disabled !== undefined) {
    const r = change.disabled
      ? await db.prepare(`UPDATE users SET disabled_at = ?2 WHERE id = ?1 AND (role != 'manager' OR ${OTHER_ACTIVE_MANAGER})`).bind(targetId, now).run()
      : await db.prepare('UPDATE users SET disabled_at = NULL WHERE id = ?1').bind(targetId).run();
    if (r.meta.changes === 0) return { ok: false, error: 'last_manager' };
    if (change.disabled) {
      await db.prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(now, targetId).run();
    }
  }
  await audit(db, manager.id, 'user.updated', { targetId, ...change }, now);
  return { ok: true };
}

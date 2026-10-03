export interface AuditEntry { id: number; at: number; actorEmail: string | null; event: string; detail: string | null }

export async function listAudit(db: D1Database, limit = 50): Promise<AuditEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT a.id, a.at, u.email AS actorEmail, a.event, a.detail
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
       ORDER BY a.id DESC LIMIT ?`,
    )
    .bind(limit)
    .all<AuditEntry>();
  return results;
}

export interface DeviceRow { idHash: string; userId: string; email: string; deviceLabel: string; createdAt: number; lastSeen: number }

/** Every live session in the household, newest activity first (manager view). */
export async function listAllSessions(db: D1Database, now = Date.now()): Promise<DeviceRow[]> {
  const { results } = await db
    .prepare(
      `SELECT s.id_hash AS idHash, s.user_id AS userId, u.email, s.device_label AS deviceLabel,
              s.created_at AS createdAt, s.last_seen AS lastSeen
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.revoked_at IS NULL AND s.expires_at > ? AND u.disabled_at IS NULL
       ORDER BY s.last_seen DESC`,
    )
    .bind(now)
    .all<DeviceRow>();
  return results;
}

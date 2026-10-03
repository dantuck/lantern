import { purgeLoginTokens } from './auth/loginTokens';
import { DAY } from './auth/policy';
import { purgeSessions } from './auth/sessions';
import { purgeRateLimits } from './rateLimit';

export const AUDIT_RETENTION_MS = 400 * DAY;
const INVITE_RETENTION_MS = 30 * DAY;

/** Opportunistic cleanup so no table grows without bound. Cheap, idempotent, safe to run on any request. */
export async function runMaintenance(db: D1Database, now = Date.now()) {
  await Promise.all([
    purgeLoginTokens(db, now),
    purgeRateLimits(db, now),
    purgeSessions(db, now),
    db.prepare('DELETE FROM invites WHERE (used_at IS NOT NULL OR revoked_at IS NOT NULL OR expires_at < ?1) AND COALESCE(used_at, revoked_at, expires_at) < ?2')
      .bind(now, now - INVITE_RETENTION_MS).run(),
    db.prepare('DELETE FROM audit_log WHERE at < ?').bind(now - AUDIT_RETENTION_MS).run(),
  ]);
}

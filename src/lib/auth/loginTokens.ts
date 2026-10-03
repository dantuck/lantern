import { randomToken, sha256Hex } from './crypto';
import { LOGIN_TOKEN_TTL } from './policy';

/**
 * Issues a single-use token bound to the browser that asked for it (via a nonce cookie).
 * Returns the raw token (to email) and the raw nonce (to set as a cookie); only hashes are stored.
 */
export async function issueLoginToken(db: D1Database, userId: string, now = Date.now()) {
  const token = randomToken();
  const nonce = randomToken();
  await db
    .prepare('INSERT INTO login_tokens (token_hash, user_id, nonce_hash, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), userId, await sha256Hex(nonce), now + LOGIN_TOKEN_TTL)
    .run();
  return { token, nonce };
}

/**
 * Atomically burns the token if it is unused, unexpired, belongs to an active user and the
 * presenting browser holds the matching nonce. A wrong nonce does NOT burn the token.
 */
export async function consumeLoginToken(
  db: D1Database,
  token: string,
  nonce: string,
  now = Date.now(),
): Promise<string | null> {
  if (!token || !nonce || token.length > 128 || nonce.length > 128) return null;
  const row = await db
    .prepare(
      `UPDATE login_tokens SET used_at = ?1
       WHERE token_hash = ?2 AND nonce_hash = ?3 AND used_at IS NULL AND expires_at > ?1
         AND user_id IN (SELECT id FROM users WHERE disabled_at IS NULL)
       RETURNING user_id`,
    )
    .bind(now, await sha256Hex(token), await sha256Hex(nonce))
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

/** Housekeeping: drop expired/used tokens. Safe to call opportunistically. */
export async function purgeLoginTokens(db: D1Database, now = Date.now()) {
  await db.prepare('DELETE FROM login_tokens WHERE expires_at < ? OR used_at IS NOT NULL').bind(now - 60_000).run();
}

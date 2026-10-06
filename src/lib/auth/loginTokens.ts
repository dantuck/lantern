import { randomToken, sha256Hex } from './crypto';
import { LOGIN_CODE_MAX_ATTEMPTS, LOGIN_TOKEN_TTL } from './policy';

/** 8 random digits, drawn without modulo bias. */
function randomCode(): string {
  const limit = 2 ** 32 - (2 ** 32 % 1e8);
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf); while (buf[0]! >= limit);
  return String(buf[0]! % 1e8).padStart(8, '0');
}

/** Strips spaces and dashes so "1234 5678" matches "12345678". Returns '' unless exactly 8 digits remain. */
export function normalizeCode(input: string): string {
  const digits = input.replace(/[\s-]/g, '');
  return /^\d{8}$/.test(digits) ? digits : '';
}

/**
 * Issues a single-use token bound to the browser that asked for it (via a nonce cookie).
 * Returns the raw token and short code (to email) and the raw nonce (to set as a cookie); only hashes are stored.
 * Either the token (via the link) or the code (typed into the requesting browser) completes the sign-in.
 */
export async function issueLoginToken(db: D1Database, userId: string, now = Date.now()) {
  const token = randomToken();
  const nonce = randomToken();
  const code = randomCode();
  const tokenHash = await sha256Hex(token);
  await db
    .prepare('INSERT INTO login_tokens (token_hash, user_id, nonce_hash, expires_at, code_hash) VALUES (?, ?, ?, ?, ?)')
    .bind(tokenHash, userId, await sha256Hex(nonce), now + LOGIN_TOKEN_TTL, await sha256Hex(`${tokenHash}:${code}`))
    .run();
  return { token, nonce, code };
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

/**
 * Completes a sign-in from the emailed code. Every attempt against the token held by this browser's nonce is
 * counted first, and the token is dead after LOGIN_CODE_MAX_ATTEMPTS wrong guesses, so 8 digits cannot be brute-forced.
 */
export async function consumeLoginCode(
  db: D1Database,
  code: string,
  nonce: string,
  now = Date.now(),
): Promise<string | null> {
  const digits = normalizeCode(code);
  if (!digits || !nonce || nonce.length > 128) return null;
  const row = await db
    .prepare(
      `UPDATE login_tokens SET attempts = attempts + 1
       WHERE nonce_hash = ?1 AND used_at IS NULL AND expires_at > ?2 AND attempts < ?3 AND code_hash IS NOT NULL
       RETURNING token_hash, code_hash`,
    )
    .bind(await sha256Hex(nonce), now, LOGIN_CODE_MAX_ATTEMPTS)
    .first<{ token_hash: string; code_hash: string }>();
  if (!row || (await sha256Hex(`${row.token_hash}:${digits}`)) !== row.code_hash) return null;
  const burned = await db
    .prepare(
      `UPDATE login_tokens SET used_at = ?1
       WHERE token_hash = ?2 AND used_at IS NULL AND expires_at > ?1
         AND user_id IN (SELECT id FROM users WHERE disabled_at IS NULL)
       RETURNING user_id`,
    )
    .bind(now, row.token_hash)
    .first<{ user_id: string }>();
  return burned?.user_id ?? null;
}

/** Housekeeping: drop expired/used tokens. Safe to call opportunistically. */
export async function purgeLoginTokens(db: D1Database, now = Date.now()) {
  await db.prepare('DELETE FROM login_tokens WHERE expires_at < ? OR used_at IS NOT NULL').bind(now - 60_000).run();
}

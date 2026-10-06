import { sha256Hex } from './auth/crypto';
import { DAY, MINUTE } from './auth/policy';

export interface Limit { max: number; windowMs: number }

export const LIMITS = {
  loginIp: { max: 10, windowMs: 15 * MINUTE },
  // Per (email, IP) so a stranger cannot use up a real person's allowance and lock them out of signing in.
  loginEmailPerIp: { max: 3, windowMs: 15 * MINUTE },
  // Backstop against email-bombing an address from many IPs.
  loginEmailTotal: { max: 30, windowMs: 60 * MINUTE },
  invite: { max: 20, windowMs: DAY },
  codeIp: { max: 20, windowMs: 15 * MINUTE },
  confirmIp: { max: 20, windowMs: 15 * MINUTE },
} satisfies Record<string, Limit>;

/**
 * Atomic fixed-window counter in D1 (a single upsert, so parallel requests cannot race past the limit).
 * Returns whether this hit is within the limit.
 */
export async function hit(db: D1Database, subject: string, limit: Limit, now = Date.now()): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO rate_limits (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN window_start <= ?3 THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN window_start <= ?3 THEN ?2 ELSE window_start END
       RETURNING count`,
    )
    .bind(await sha256Hex(subject), now, now - limit.windowMs)
    .first<{ count: number }>();
  return (row?.count ?? Infinity) <= limit.max;
}

export async function purgeRateLimits(db: D1Database, now = Date.now()) {
  await db.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now - DAY).run();
}

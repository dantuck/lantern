export const MINUTE = 60_000;
export const DAY = 24 * 60 * MINUTE;

export const LOGIN_TOKEN_TTL = 10 * MINUTE;
/** Wrong guesses allowed against one emailed code before it is burned. */
export const LOGIN_CODE_MAX_ATTEMPTS = 5;
export const INVITE_TTL = 7 * DAY;
export const SESSION_IDLE_TTL = 30 * DAY; // sliding
export const SESSION_ABSOLUTE_TTL = 90 * DAY; // hard cap
/** Only write last_seen/expiry back when it has moved this much, to limit D1 writes. */
export const SESSION_TOUCH_INTERVAL = 60 * MINUTE;

export const SESSION_COOKIE = '__Host-session';
export const NONCE_COOKIE = '__Host-login-nonce';

export interface SessionTimes {
  createdAt: number;
  lastSeen: number;
  expiresAt: number;
  revokedAt: number | null;
}

export function isSessionValid(s: SessionTimes, now: number): boolean {
  return s.revokedAt === null && now < s.expiresAt && now < s.createdAt + SESSION_ABSOLUTE_TTL;
}

/** New expiry after activity: slides by the idle TTL but never past the absolute cap. */
export function slideExpiry(createdAt: number, now: number): number {
  return Math.min(now + SESSION_IDLE_TTL, createdAt + SESSION_ABSOLUTE_TTL);
}

export const needsTouch = (s: SessionTimes, now: number): boolean =>
  now - s.lastSeen >= SESSION_TOUCH_INTERVAL;

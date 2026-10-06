import type { AstroCookies } from 'astro';
import { clearCookie, cookieOptions } from './cookies';
import { NONCE_COOKIE, SESSION_COOKIE } from './policy';
import { createSession, deviceLabel } from './sessions';
import { audit } from './users';

/** Shared tail of every sign-in method: start the session, swap the nonce cookie for the session cookie, log it. */
export async function startSession(
  db: D1Database,
  cookies: AstroCookies,
  request: Request,
  userId: string,
  method: 'link' | 'code',
) {
  const device = deviceLabel(request.headers.get('user-agent'));
  const { id, maxAgeSeconds } = await createSession(db, userId, device);
  clearCookie(cookies, NONCE_COOKIE);
  cookies.set(SESSION_COOKIE, id, cookieOptions(maxAgeSeconds));
  await audit(db, userId, 'login', { device, method });
}

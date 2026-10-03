import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { consumeLoginToken } from '../../lib/auth/loginTokens';
import { createSession, deviceLabel } from '../../lib/auth/sessions';
import { clearCookie, cookieOptions } from '../../lib/auth/cookies';
import { NONCE_COOKIE, SESSION_COOKIE } from '../../lib/auth/policy';
import { audit } from '../../lib/auth/users';
import { LIMITS, hit } from '../../lib/rateLimit';
import { clientIp, json, readJson } from '../../lib/http';

export const POST: APIRoute = async ({ request, cookies }) => {
  const db = env.DB;
  if (!(await hit(db, `confirm:ip:${clientIp(request)}`, LIMITS.confirmIp))) {
    return json({ ok: false, error: 'rate_limited' }, 429);
  }
  const body = (await readJson(request, 1024)) as { token?: unknown } | null | undefined;
  if (body === null) return json({ ok: false, error: 'too_large' }, 413);
  const token = typeof body?.token === 'string' ? body.token : '';
  const nonce = cookies.get(NONCE_COOKIE)?.value ?? '';

  const userId = await consumeLoginToken(db, token, nonce);
  if (!userId) {
    // One generic failure: expired, reused, wrong browser and unknown token are indistinguishable.
    return json({ ok: false, error: 'invalid_or_expired' }, 400);
  }

  const device = deviceLabel(request.headers.get('user-agent'));
  const { id, maxAgeSeconds } = await createSession(db, userId, device);
  clearCookie(cookies, NONCE_COOKIE);
  cookies.set(SESSION_COOKIE, id, cookieOptions(maxAgeSeconds));
  await audit(db, userId, 'login', { device });
  return json({ ok: true });
};

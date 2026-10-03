import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { revokeSessionByRawId } from '../../lib/auth/sessions';
import { SESSION_COOKIE } from '../../lib/auth/policy';
import { clearCookie } from '../../lib/auth/cookies';
import { audit } from '../../lib/auth/users';

export const POST: APIRoute = async ({ cookies, locals, redirect }) => {
  const sid = cookies.get(SESSION_COOKIE)?.value;
  if (sid) await revokeSessionByRawId(env.DB, sid);
  if (locals.user) await audit(env.DB, locals.user.id, 'logout');
  clearCookie(cookies, SESSION_COOKIE);
  return redirect('/login', 303);
};

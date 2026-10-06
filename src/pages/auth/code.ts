import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { consumeLoginCode } from '../../lib/auth/loginTokens';
import { NONCE_COOKIE } from '../../lib/auth/policy';
import { startSession } from '../../lib/auth/signIn';
import { LIMITS, hit } from '../../lib/rateLimit';
import { clientIp, readForm } from '../../lib/http';

/** Signs in with the code from the email. It only works in the browser that requested it (nonce cookie). */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const db = env.DB;
  if (!(await hit(db, `code:ip:${clientIp(request)}`, LIMITS.codeIp))) {
    return new Response('Too many requests. Try again later.', { status: 429, headers: { 'Retry-After': '900' } });
  }
  const form = await readForm(request, 1024);
  if (form === null) return new Response('Payload too large', { status: 413 });

  const userId = await consumeLoginCode(db, form.get('code') ?? '', cookies.get(NONCE_COOKIE)?.value ?? '');
  // One generic failure: wrong, expired, reused and wrong-browser are indistinguishable.
  if (!userId) return redirect('/login?sent=1&bad=1', 303);

  await startSession(db, cookies, request, userId, 'code');
  return redirect('/', 303);
};

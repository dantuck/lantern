import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { normalizeEmail, randomToken } from '../../lib/auth/crypto';
import { issueLoginToken } from '../../lib/auth/loginTokens';
import { NONCE_COOKIE, LOGIN_TOKEN_TTL } from '../../lib/auth/policy';
import { cookieOptions } from '../../lib/auth/cookies';
import { resolveLoginUser } from '../../lib/auth/users';
import { LIMITS, hit } from '../../lib/rateLimit';
import { runMaintenance } from '../../lib/maintenance';
import { safeAppOrigin } from '../../lib/origin';
import { loginEmail, selectMailer } from '../../lib/mailer';
import { clientIp, readForm } from '../../lib/http';

export const POST: APIRoute = async ({ request, cookies, locals, redirect }) => {
  const db = env.DB;
  const ip = clientIp(request);
  // A sign-in form is a few dozen bytes; the body is read with a hard cap, not trusted headers.
  const form = await readForm(request, 4096);
  if (form === null) return new Response('Payload too large', { status: 413 });
  const email = normalizeEmail(form.get('email') ?? '').slice(0, 254);

  if (!(await hit(db, `login:ip:${ip}`, LIMITS.loginIp))) {
    return new Response('Too many requests. Try again later.', { status: 429, headers: { 'Retry-After': '900' } });
  }

  // Every outcome below ends in the same response, including the cookie, so nothing reveals
  // whether the address belongs to the household.
  let nonce = randomToken();

  // && short-circuits: requests refused by the per-IP rule never count toward the address-wide backstop.
  const withinEmailLimit = email
    ? (await hit(db, `login:email-ip:${email}|${ip}`, LIMITS.loginEmailPerIp)) && (await hit(db, `login:email:${email}`, LIMITS.loginEmailTotal))
    : false;
  const user = withinEmailLimit
    ? await resolveLoginUser(db, email, { bootstrapEmail: env.BOOTSTRAP_MANAGER_EMAIL })
    : null;

  if (user) {
    const issued = await issueLoginToken(db, user.id);
    nonce = issued.nonce;
    const mailer = selectMailer(env, import.meta.env.DEV);
    // Origin comes from config, never from the Host header (prevents poisoned links), and is validated.
    const origin = safeAppOrigin(env.APP_ORIGIN, import.meta.env.DEV);
    const send = mailer && origin
      ? mailer.send({ to: user.email, ...loginEmail(`${origin}/auth/verify#token=${issued.token}`) }).catch((e) => console.error('mail failed', String(e)))
      : Promise.resolve(console.error('refusing to send: no mailer configured or APP_ORIGIN is invalid'));
    locals.cfContext.waitUntil(send);
  }

  cookies.set(NONCE_COOKIE, nonce, cookieOptions(Math.floor(LOGIN_TOKEN_TTL / 1000)));
  locals.cfContext.waitUntil(runMaintenance(db).catch((e) => console.error('maintenance failed', String(e))));
  return redirect('/login?sent=1', 303);
};

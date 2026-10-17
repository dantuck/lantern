import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { redeemInviteLink } from '../../../lib/auth/users';
import { startSession } from '../../../lib/auth/signIn';
import { LIMITS, hit } from '../../../lib/rateLimit';
import { clientIp, json, readJson } from '../../../lib/http';

/** Redeems a member invite link (POSTed by the confirm page, never by a GET) and signs the new member in. */
export const POST: APIRoute = async ({ request, cookies }) => {
  const db = env.DB;
  if (!(await hit(db, `invite-link:ip:${clientIp(request)}`, LIMITS.inviteLinkIp))) {
    return json({ ok: false, error: 'rate_limited' }, 429);
  }
  const body = (await readJson(request, 1024)) as { token?: unknown } | null | undefined;
  if (body === null) return json({ ok: false, error: 'too_large' }, 413);
  const token = typeof body?.token === 'string' ? body.token : '';

  const user = await redeemInviteLink(db, token);
  // One generic failure: unknown, used, revoked, expired and manager-invite links are indistinguishable.
  if (!user) return json({ ok: false, error: 'invalid_or_expired' }, 400);

  await startSession(db, cookies, request, user.id, 'invite');
  return json({ ok: true });
};

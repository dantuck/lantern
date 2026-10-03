import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { revokeAllForUser, revokeSession } from '../../lib/auth/sessions';
import { readForm } from '../../lib/http';
import type { FlashCode } from '../../lib/messages';

/** Any signed-in user: revoke one of your own devices, or sign out everywhere else. (Revocations audit themselves.) */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const { user, session } = locals;
  if (!user || !session) return new Response('Forbidden', { status: 403 });
  const f = await readForm(request, 2048);
  if (f === null) return redirect('/devices?msg=too_large', 303);
  let msg: FlashCode = 'bad_request';
  if (f.get('action') === 'revoke') {
    msg = (await revokeSession(env.DB, user, f.get('id') ?? '')) ? 'session_revoked' : 'not_found';
  } else if (f.get('action') === 'revoke_others') {
    await revokeAllForUser(env.DB, user.id, session.idHash);
    msg = 'others_revoked';
  }
  return redirect(`/devices?msg=${msg}`, 303);
};

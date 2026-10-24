import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { approveElevation, endElevation, requestElevation } from '../../lib/auth/elevation';
import { clientIp, isAdmin, readForm } from '../../lib/http';
import { LIMITS, hit } from '../../lib/rateLimit';
import type { FlashCode } from '../../lib/messages';

/**
 * A member's device asks for manager access (`request`) or gives it up (`lock`); a manager on their own device
 * approves it (`approve`). Form posts that redirect back with a fixed message code.
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const { user, session } = locals;
  if (!user || !session) return new Response('Forbidden', { status: 403 });
  const f = await readForm(request, 2048);
  if (f === null) return redirect('/elevate?msg=too_large', 303);
  const db = env.DB;
  const action = f.get('action');
  let msg: FlashCode | null = null;

  if (action === 'request' && !isAdmin(locals)) {
    if (!(await hit(db, `elevate:request:${session.idHash}`, LIMITS.elevateRequest))) msg = 'rate_limited_elevation';
    else if (!(await requestElevation(db, user, session.idHash))) msg = 'bad_request';
  } else if (action === 'approve') {
    // Only a manager signed in as themselves can approve; a device they unlocked cannot unlock another.
    if (!isAdmin(locals)) return new Response('Forbidden', { status: 403 });
    if (!(await hit(db, `elevate:approve:${user.id}|${clientIp(request)}`, LIMITS.elevateApprove))) msg = 'rate_limited_elevation';
    else msg = (await approveElevation(db, user, f.get('code') ?? '', Number(f.get('minutes')))) ? 'elevation_approved' : 'elevation_bad_code';
  } else if (action === 'lock') {
    await endElevation(db, user, session.idHash);
    msg = 'elevation_locked';
  } else {
    msg = 'bad_request';
  }
  return redirect(msg ? `/elevate?msg=${msg}` : '/elevate', 303);
};

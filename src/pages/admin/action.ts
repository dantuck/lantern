import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { createInvite, revokeInvite, updateUser, type Role } from '../../lib/auth/users';
import { revokeSession } from '../../lib/auth/sessions';
import { LIMITS, hit } from '../../lib/rateLimit';
import { inviteEmail, selectMailer } from '../../lib/mailer';
import { safeAppOrigin } from '../../lib/origin';
import { readForm } from '../../lib/http';
import { setFeature, switchableIds } from '../../lib/features';
import { registry } from '../../plugins/registry';
import type { FlashCode } from '../../lib/messages';

const asRole = (v: string): Role | null => (v === 'manager' || v === 'member' ? v : null);

/** One manager-only form endpoint. The page shows the outcome via a fixed message code, never reflected text. */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const me = locals.user;
  if (!me || me.role !== 'manager') return new Response('Forbidden', { status: 403 }); // defence in depth: middleware also guards /admin
  const db = env.DB;
  const f = await readForm(request, 8192);
  if (f === null) return redirect('/admin?msg=too_large', 303);
  const s = (k: string) => f.get(k) ?? '';
  let msg: FlashCode = 'bad_request';

  switch (s('action')) {
    case 'invite': {
      if (!(await hit(db, `invite:${me.id}`, LIMITS.invite))) { msg = 'rate_limited'; break; }
      const r = await createInvite(db, me, s('email'), asRole(s('role')) ?? 'member');
      msg = r.ok ? 'invite_sent' : r.error;
      if (r.ok) {
        const mailer = selectMailer(env, import.meta.env.DEV);
        const origin = safeAppOrigin(env.APP_ORIGIN, import.meta.env.DEV);
        if (mailer && origin) {
          const mail = { to: r.email, ...inviteEmail(me.email, `${origin}/login`) };
          locals.cfContext.waitUntil(mailer.send(mail).catch((e) => console.error('invite mail failed', String(e))));
        }
      }
      break;
    }
    case 'revoke_invite':
      msg = (await revokeInvite(db, me, s('id'))) ? 'invite_revoked' : 'not_found';
      break;
    case 'set_role': {
      const role = asRole(s('role'));
      if (!role) break;
      const r = await updateUser(db, me, s('id'), { role });
      msg = r.ok ? 'role_changed' : r.error;
      break;
    }
    case 'set_disabled': {
      const disabled = s('disabled') === '1';
      const r = await updateUser(db, me, s('id'), { disabled });
      msg = r.ok ? (disabled ? 'user_disabled' : 'user_enabled') : r.error;
      break;
    }
    case 'set_feature': {
      const enabled = s('enabled') === '1';
      const ok = await setFeature(db, me, switchableIds(registry.enabled.map((p) => p.def.id)), s('id'), enabled);
      msg = ok ? (enabled ? 'feature_enabled' : 'feature_disabled') : 'not_found';
      break;
    }
    case 'revoke_session':
      msg = (await revokeSession(db, me, s('id'))) ? 'session_revoked' : 'not_found';
      break;
  }
  return redirect(`/admin?msg=${msg}`, 303);
};

import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { loadPeople } from '../../lib/peopleStore';
import { isOn } from '../../lib/features';
import { isAdmin, json, readJson } from '../../lib/http';
import { managerSubscribed, pushKeys, removeManagerSubscription, removeSubscription, saveManagerSubscription, saveSubscription, subscribedPeople } from '../../lib/push';

const person = z.string().min(1).max(64);
const endpoint = z.string().min(1).max(1024);
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('status'), endpoint }),
  z.object({ action: z.literal('subscribe'), person, subscription: z.object({ endpoint, keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }) }) }),
  z.object({ action: z.literal('unsubscribe'), endpoint, person: person.optional() }),
  // A manager's own notifications. Kept apart from the per-person alerts above, which follow a child, not a login.
  z.object({ action: z.literal('manager_status'), endpoint }),
  z.object({ action: z.literal('manager_subscribe'), subscription: z.object({ endpoint, keys: z.object({ p256dh: z.string().min(1).max(200), auth: z.string().min(1).max(100) }) }) }),
  z.object({ action: z.literal('manager_unsubscribe'), endpoint }),
]);

const off = (locals: App.Locals) => !isOn(locals.disabled, 'chores');

/** Whether "time is up" alerts are set up on this Worker, and the public key a browser needs to subscribe. Any signed-in member may ask. */
export const GET: APIRoute = ({ locals }) => {
  const keys = pushKeys(env);
  if (off(locals) || !keys) return json({ enabled: false });
  return json({ enabled: true, publicKey: keys.publicKey });
};

/** Middleware has already required a session and a same-origin Origin. Any member may sign a device up for alerts, as they may start a timer. */
export const POST: APIRoute = async ({ request, locals }) => {
  if (off(locals) || !pushKeys(env)) return json({ error: 'not_found' }, 404);
  const raw = await readJson(request, 4096);
  if (raw === null) return json({ error: 'too_large' }, 413);
  const parsed = body.safeParse(raw);
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const b = parsed.data;
  const db = env.DB;
  if (b.action === 'manager_status' || b.action === 'manager_subscribe' || b.action === 'manager_unsubscribe') {
    if (!isAdmin(locals)) return json({ error: 'forbidden' }, 403);
    const me = locals.user!.id;
    if (b.action === 'manager_subscribe') {
      const { endpoint: address, keys } = b.subscription;
      const result = await saveManagerSubscription(db, me, { endpoint: address, ...keys });
      if (result !== 'ok') return json({ error: result }, result === 'limit' ? 409 : 400);
      return json({ on: true });
    }
    if (b.action === 'manager_unsubscribe') await removeManagerSubscription(db, b.endpoint, me);
    return json({ on: await managerSubscribed(db, b.endpoint, me) });
  }
  if (b.action === 'status') return json({ people: await subscribedPeople(db, b.endpoint) });
  if (b.action === 'unsubscribe') {
    await removeSubscription(db, b.endpoint, b.person);
    return json({ people: await subscribedPeople(db, b.endpoint) }); // what is left, so the device knows whether to drop its subscription
  }
  if (!(await loadPeople(db)).some((p) => p.id === b.person)) return json({ error: 'bad_request' }, 400);
  const { endpoint: address, keys } = b.subscription;
  const result = await saveSubscription(db, b.person, { endpoint: address, ...keys });
  if (result !== 'ok') return json({ error: result }, result === 'limit' ? 409 : 400);
  return json({ ok: true });
};

export const ALL: APIRoute = () => new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });

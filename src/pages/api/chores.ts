import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { addChore, choreState, removeChore, setChoreDone } from '../../lib/chores';
import { householdZone, people } from '../../lib/household';
import { dayKey } from '../../lib/dates';
import { json, readJson } from '../../lib/http';
import { isOn } from '../../lib/features';

const title = z.string().trim().min(1).max(80);
const person = z.string().refine((id) => people.some((p) => p.id === id), 'unknown person').nullable();
const id = z.string().min(1).max(64);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add'), title, person, repeat: z.literal('daily') }),
  z.object({ action: z.literal('add'), title, person, repeat: z.literal('weekly'), weekday: z.number().int().min(0).max(6) }),
  z.object({ action: z.literal('add'), title, person, repeat: z.literal('once'), dueDate: day }),
  z.object({ action: z.literal('done'), id, done: z.boolean() }),
  z.object({ action: z.literal('remove'), id }),
]);

const today = () => dayKey(Date.now(), householdZone);

/** Any signed-in member may read and change chores (middleware has already required a session and a same-origin Origin). */
const off = (locals: App.Locals) => !isOn(locals.disabled, 'chores');

export const GET: APIRoute = async ({ locals }) => (off(locals) ? json({ error: 'not_found' }, 404) : json(await choreState(env.DB, today())));

export const POST: APIRoute = async ({ request, locals }) => {
  if (off(locals)) return json({ error: 'not_found' }, 404);
  const raw = await readJson(request, 2048);
  if (raw === null) return json({ error: 'too_large' }, 413);
  const parsed = body.safeParse(raw);
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const b = parsed.data;
  const day = today();
  if (b.action === 'add') {
    const { action: _a, ...chore } = b;
    if ((await addChore(env.DB, chore)) === 'limit') return json({ error: 'limit' }, 409);
  } else if (b.action === 'done') {
    if (!(await setChoreDone(env.DB, b.id, day, b.done))) return json({ error: 'not_found' }, 404);
  } else if (!(await removeChore(env.DB, b.id))) {
    return json({ error: 'not_found' }, 404);
  }
  return json(await choreState(env.DB, day));
};

export const ALL: APIRoute = () => new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });

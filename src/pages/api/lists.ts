import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { addItem, addList, clearDone, getLists, removeItem, removeList, setItemDone } from '../../lib/lists';
import { json, readJson } from '../../lib/http';
import { isOn } from '../../lib/features';

const id = z.string().min(1).max(64);
const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('add_list'), name: z.string().trim().min(1).max(60) }),
  z.object({ action: z.literal('remove_list'), id }),
  z.object({ action: z.literal('add_item'), listId: id, text: z.string().trim().min(1).max(120) }),
  z.object({ action: z.literal('done'), id, done: z.boolean() }),
  z.object({ action: z.literal('remove_item'), id }),
  z.object({ action: z.literal('clear_done'), listId: id }),
]);

/** Any signed-in member may read and change lists (middleware has already required a session and a same-origin Origin). */
const off = (locals: App.Locals) => !isOn(locals.disabled, 'lists');

export const GET: APIRoute = async ({ locals }) => (off(locals) ? json({ error: 'not_found' }, 404) : json(await getLists(env.DB)));

export const POST: APIRoute = async ({ request, locals }) => {
  if (off(locals)) return json({ error: 'not_found' }, 404);
  const raw = await readJson(request, 2048);
  if (raw === null) return json({ error: 'too_large' }, 413);
  const parsed = body.safeParse(raw);
  if (!parsed.success) return json({ error: 'bad_request' }, 400);
  const b = parsed.data;
  const db = env.DB;
  let result: 'ok' | 'not_found' | 'limit' = 'ok';
  switch (b.action) {
    case 'add_list': result = await addList(db, b.name); break;
    case 'remove_list': if (!(await removeList(db, b.id))) result = 'not_found'; break;
    case 'add_item': result = await addItem(db, b.listId, b.text); break;
    case 'done': if (!(await setItemDone(db, b.id, b.done))) result = 'not_found'; break;
    case 'remove_item': if (!(await removeItem(db, b.id))) result = 'not_found'; break;
    case 'clear_done': await clearDone(db, b.listId); break;
  }
  if (result !== 'ok') return json({ error: result }, result === 'limit' ? 409 : 404);
  return json(await getLists(db));
};

export const ALL: APIRoute = () => new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });

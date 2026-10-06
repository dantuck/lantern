import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { addItem, choreState, removeItem, removeList, saveList, setCheck, updateItem } from '../../lib/chores';
import { PERIODS } from '../../lib/choreTypes';
import { adjustPoints, decideRedemption, removeReward, requestRedemption, saveReward } from '../../lib/rewards';
import { householdZone } from '../../lib/household';
import { loadPeople } from '../../lib/peopleStore';
import { dayKey } from '../../lib/dates';
import { isManager, json, readJson } from '../../lib/http';
import { isOn } from '../../lib/features';

const id = z.string().min(1).max(64);
const title = z.string().trim().min(1).max(80);
const points = z.number().int().min(0).max(100);
const person = z.string().min(1).max(64); // checked against the household's people in POST
const itemDays = z.number().int().min(1).max(127).nullable().optional(); // weekday bitmask, or null to follow the list
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const list = {
  name: z.string().trim().min(1).max(60),
  person: person.nullable(),
  period: z.enum(PERIODS as [string, ...string[]]),
  days: z.number().int().min(0).max(127),
  onceDate: date.nullable(),
  bonus: z.number().int().min(0).max(1000),
};
const schedulable = (l: { days: number; onceDate: string | null }) => l.onceDate !== null || l.days > 0;

/** What anyone signed in may do: tick chores and ask to spend points. */
const memberBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('check'), id, done: z.boolean() }),
  z.object({ action: z.literal('redeem'), person, rewardId: id }),
]);

/** What only a manager may do: everything that shapes the routines and the rewards. */
const managerBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('list_save'), id: id.optional(), ...list, items: z.array(z.object({ title, points, days: itemDays })).max(30).optional() }),
  z.object({ action: z.literal('list_remove'), id }),
  z.object({ action: z.literal('item_add'), listId: id, title, points, days: itemDays }),
  z.object({ action: z.literal('item_update'), id, title, points, days: itemDays }),
  z.object({ action: z.literal('item_remove'), id }),
  z.object({ action: z.literal('reward_save'), id: id.optional(), name: z.string().trim().min(1).max(60), cost: z.number().int().min(1).max(100_000), listIds: z.array(id).max(40).nullable().optional() }),
  z.object({ action: z.literal('reward_remove'), id }),
  z.object({ action: z.literal('decide'), id, approve: z.boolean() }),
  z.object({ action: z.literal('adjust'), person, delta: z.number().int().min(-1000).max(1000).refine((n) => n !== 0), note: z.string().trim().max(60) }),
]);

/** Whether a request's `person`, if it names one, is someone in the household. */
const knows = async (b: object) => {
  const who = 'person' in b ? (b.person as string | null) : null;
  return who === null || (await loadPeople(env.DB)).some((p) => p.id === who);
};

const today = () => dayKey(Date.now(), householdZone);

/** Middleware has already required a session and a same-origin Origin. Reading and ticking are open to every member. */
const off = (locals: App.Locals) => !isOn(locals.disabled, 'chores');
const view = async (locals: App.Locals) => json(await choreState(env.DB, today(), isManager(locals)));

const STATUS: Record<string, number> = { not_found: 404, not_due: 409, limit: 409, insufficient: 409, not_eligible: 409, bad_request: 400 };

export const GET: APIRoute = async ({ locals }) => (off(locals) ? json({ error: 'not_found' }, 404) : view(locals));

export const POST: APIRoute = async ({ request, locals }) => {
  if (off(locals)) return json({ error: 'not_found' }, 404);
  const raw = await readJson(request, 8192);
  if (raw === null) return json({ error: 'too_large' }, 413);
  const db = env.DB;
  let result: string = 'ok';

  const asMember = memberBody.safeParse(raw);
  if (asMember.success) {
    const b = asMember.data;
    if (!(await knows(b))) return json({ error: 'bad_request' }, 400);
    result = b.action === 'check' ? await setCheck(db, b.id, today(), b.done) : await requestRedemption(db, b.person, b.rewardId);
  } else {
    const parsed = managerBody.safeParse(raw);
    if (!parsed.success) return json({ error: 'bad_request' }, 400);
    if (!isManager(locals)) return json({ error: 'forbidden' }, 403);
    const b = parsed.data;
    if (!(await knows(b))) return json({ error: 'bad_request' }, 400);
    const manager = locals.user!;
    switch (b.action) {
      case 'list_save': {
        if (!schedulable(b)) return json({ error: 'bad_request' }, 400);
        const { action: _a, id: listId, items, ...input } = b;
        result = await saveList(db, input as Parameters<typeof saveList>[1], { ...(listId ? { id: listId } : {}), ...(items ? { items } : {}) });
        break;
      }
      case 'list_remove': if (!(await removeList(db, b.id))) result = 'not_found'; break;
      case 'item_add': result = await addItem(db, b.listId, b.title, b.points, b.days ?? null); break;
      case 'item_update': result = await updateItem(db, b.id, b.title, b.points, b.days); break;
      case 'item_remove': if (!(await removeItem(db, b.id))) result = 'not_found'; break;
      case 'reward_save': result = await saveReward(db, { name: b.name, cost: b.cost, ...(b.listIds !== undefined ? { listIds: b.listIds } : {}) }, b.id); break;
      case 'reward_remove': if (!(await removeReward(db, b.id))) result = 'not_found'; break;
      case 'decide': result = await decideRedemption(db, manager, b.id, b.approve); break;
      case 'adjust': await adjustPoints(db, manager, b.person, b.delta, b.note); break;
    }
  }
  if (result !== 'ok') return json({ error: result }, STATUS[result] ?? 400);
  return view(locals);
};

export const ALL: APIRoute = () => new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });

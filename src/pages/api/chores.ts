import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { addItem, choreState, removeItem, setBonus, setCheck, updateItem } from '../../lib/chores';
import { PERIODS, type Period } from '../../lib/choreTypes';
import { adjustMinutes, adjustPoints, approveAffordable, claimGoal, decideRedemption, removeGoal, removeReward, requestRedemption, saveGoal, saveReward, setAllowance, useMinutes } from '../../lib/rewards';
import { householdZone } from '../../lib/household';
import { loadPeople } from '../../lib/peopleStore';
import { dayKey } from '../../lib/dates';
import { isManager, json, readJson } from '../../lib/http';
import { isOn } from '../../lib/features';

const id = z.string().min(1).max(64);
const title = z.string().trim().min(1).max(80);
const points = z.number().int().min(0).max(100);
const person = z.string().min(1).max(64); // checked against the household's people in POST
const itemDays = z.number().int().min(1).max(127).nullable().optional(); // weekday bitmask, or null for every day
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const period = z.enum(PERIODS as [string, ...string[]]);

/** What anyone signed in may do: tick chores and ask to spend points. */
const memberBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('check'), id, done: z.boolean() }),
  z.object({ action: z.literal('redeem'), person, rewardId: id }),
  z.object({ action: z.literal('use_time'), person, minutes: z.number().int().min(1).max(1440) }),
]);

/** What only a manager may do: everything that shapes the routines and the rewards. */
const managerBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('item_add'), person: person.nullable(), title, points, period, days: itemDays, onceDate: date.nullable().optional() }),
  z.object({ action: z.literal('item_update'), id, title: title.optional(), points: points.optional(), period: period.optional(), days: itemDays, onceDate: date.nullable().optional() }),
  z.object({ action: z.literal('item_remove'), id }),
  z.object({ action: z.literal('bonus_set'), person, period, bonus: z.number().int().min(0).max(1000) }),
  z.object({ action: z.literal('reward_save'), id: id.optional(), name: z.string().trim().min(1).max(60), cost: z.number().int().min(1).max(100_000), minutes: z.number().int().min(0).max(1440).optional(), people: z.array(person).max(40).nullable().optional(), hidden: z.boolean().optional() }),
  z.object({ action: z.literal('reward_remove'), id }),
  z.object({ action: z.literal('decide'), id, approve: z.boolean() }),
  z.object({ action: z.literal('decide_all') }),
  z.object({ action: z.literal('goal_save'), id: id.optional(), name: z.string().trim().min(1).max(60), target: z.number().int().min(1).max(1_000_000) }),
  z.object({ action: z.literal('goal_remove'), id }),
  z.object({ action: z.literal('goal_claim'), id }),
  z.object({ action: z.literal('allowance_set'), person, weekday: z.number().int().min(0).max(1440), weekend: z.number().int().min(0).max(1440).nullable() }),
  z.object({ action: z.literal('adjust_time'), person, delta: z.number().int().min(-1440).max(1440).refine((n) => n !== 0), note: z.string().trim().max(60) }),
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
    result = b.action === 'check' ? await setCheck(db, b.id, today(), b.done)
      : b.action === 'use_time' ? await useMinutes(db, b.person, b.minutes, today())
      : await requestRedemption(db, b.person, b.rewardId);
  } else {
    const parsed = managerBody.safeParse(raw);
    if (!parsed.success) return json({ error: 'bad_request' }, 400);
    if (!isManager(locals)) return json({ error: 'forbidden' }, 403);
    const b = parsed.data;
    if (!(await knows(b))) return json({ error: 'bad_request' }, 400);
    const manager = locals.user!;
    switch (b.action) {
      case 'item_add': result = await addItem(db, b.person, { title: b.title, points: b.points, period: b.period as Period, days: b.days ?? null, onceDate: b.onceDate ?? null }); break;
      case 'item_update': {
        const { action: _a, id: itemId, ...changes } = b;
        result = await updateItem(db, itemId, Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)));
        break;
      }
      case 'item_remove': if (!(await removeItem(db, b.id))) result = 'not_found'; break;
      case 'bonus_set': await setBonus(db, b.person, b.period as Period, b.bonus); break;
      case 'reward_save': result = await saveReward(db, { name: b.name, cost: b.cost, ...(b.minutes !== undefined ? { minutes: b.minutes } : {}), ...(b.people !== undefined ? { people: b.people } : {}), ...(b.hidden !== undefined ? { hidden: b.hidden } : {}) }, b.id); break;
      case 'reward_remove': if (!(await removeReward(db, b.id))) result = 'not_found'; break;
      case 'decide': result = await decideRedemption(db, manager, b.id, b.approve); break;
      case 'decide_all': await approveAffordable(db, manager); break;
      case 'goal_save': result = await saveGoal(db, { name: b.name, target: b.target }, b.id); break;
      case 'goal_remove': if (!(await removeGoal(db, b.id))) result = 'not_found'; break;
      case 'goal_claim': result = await claimGoal(db, manager, b.id); break;
      case 'allowance_set': await setAllowance(db, manager, b.person, b.weekday, b.weekend); break;
      case 'adjust_time': await adjustMinutes(db, manager, b.person, b.delta, b.note); break;
      case 'adjust': await adjustPoints(db, manager, b.person, b.delta, b.note); break;
    }
  }
  if (result !== 'ok') return json({ error: result }, STATUS[result] ?? 400);
  return view(locals);
};

export const ALL: APIRoute = () => new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });

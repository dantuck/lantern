import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { z } from 'zod';
import { addItem, choreState, removeItem, setBonus, setCheck, setPeriodHours, setPeriodLabels, setSkip, updateItem } from '../../lib/chores';
import { scaled, validHours, HOURS_PERIODS, MAX_EVERY_WEEKS, MAX_PERIOD_LABEL, MAX_QUANTITY, PERIODS, SOUNDS, type Period } from '../../lib/choreTypes';
import { adjustMinutes, adjustPoints, approveAffordable, claimGoal, decideRedemption, removeGoal, removeReward, requestRedemption, saveGoal, saveReward, setAllowance, setBuyCap } from '../../lib/rewards';
import { setSound, startTimer, stopTimer, timersNow } from '../../lib/timers';
import { householdZone } from '../../lib/household';
import { loadPeople } from '../../lib/peopleStore';
import { dayKey } from '../../lib/dates';
import { isManager, json, managerActor, readJson } from '../../lib/http';
import { isOn } from '../../lib/features';
import { selectMailer } from '../../lib/mailer';
import { safeAppOrigin } from '../../lib/origin';
import { notifyManagers, type Activity } from '../../lib/managerNotify';
import { pushKeys } from '../../lib/push';

const id = z.string().min(1).max(64);
const title = z.string().trim().min(1).max(80);
const points = z.number().int().min(0).max(100);
const person = z.string().min(1).max(64); // checked against the household's people in POST
const itemDays = z.number().int().min(1).max(127).nullable().optional(); // weekday bitmask, or null for every day
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const period = z.enum(PERIODS as [string, ...string[]]);
const periodLabel = z.string().trim().max(MAX_PERIOD_LABEL); // blank goes back to the built-in name
const everyWeeks = z.number().int().min(1).max(MAX_EVERY_WEEKS).optional();
const untilDone = z.boolean().optional();
const keptPoints = points.optional();
const newItem = { title, points, period, days: itemDays, onceDate: date.nullable().optional(), everyWeeks, weekAnchor: date.nullable().optional(), untilDone, keptPoints, optional: z.boolean().optional() };

/** What anyone signed in may do: tick chores, and spend points on rewards (screen time at once, anything else once a manager approves). */
const memberBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('check'), id, done: z.boolean() }),
  z.object({ action: z.literal('redeem'), person, rewardId: id, quantity: z.number().int().min(1).max(MAX_QUANTITY).optional() }),
  z.object({ action: z.literal('use_time'), person, minutes: z.number().int().min(1).max(1440) }),
  z.object({ action: z.literal('timer_stop'), person }),
  z.object({ action: z.literal('sound_set'), person, sound: z.enum(SOUNDS) }),
]);

/** What only a manager may do: everything that shapes the routines and the rewards. */
const managerBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('item_add'), person: person.nullable(), ...newItem }),
  z.object({ action: z.literal('items_add'), items: z.array(z.object({ person: person.nullable(), ...newItem })).min(1).max(240) }),
  z.object({ action: z.literal('item_update'), id, title: title.optional(), points: points.optional(), period: period.optional(), days: itemDays, onceDate: date.nullable().optional(), everyWeeks, weekAnchor: date.nullable().optional(), untilDone, keptPoints, optional: z.boolean().optional() }),
  z.object({ action: z.literal('item_remove'), id }),
  z.object({ action: z.literal('item_skip'), id, skipped: z.boolean() }),
  z.object({ action: z.literal('period_labels_set'), labels: z.object({ morning: periodLabel.optional(), afternoon: periodLabel.optional(), evening: periodLabel.optional(), any: periodLabel.optional() }) }),
  z.object({ action: z.literal('period_hours_set'), hours: z.object(Object.fromEntries(HOURS_PERIODS.map((k) => [k, z.object({ from: z.number().int(), to: z.number().int() }).refine(validHours, 'A time of day must end after it starts, within the day').optional()]))) }),
  z.object({ action: z.literal('bonus_set'), person, period, bonus: z.number().int().min(0).max(1000) }),
  z.object({ action: z.literal('reward_save'), id: id.optional(), name: z.string().trim().min(1).max(60), cost: z.number().int().min(1).max(100_000), minutes: z.number().int().min(0).max(1440).optional(), people: z.array(person).max(40).nullable().optional(), hidden: z.boolean().optional() }),
  z.object({ action: z.literal('reward_remove'), id }),
  z.object({ action: z.literal('decide'), id, approve: z.boolean() }),
  z.object({ action: z.literal('decide_all') }),
  z.object({ action: z.literal('goal_save'), id: id.optional(), name: z.string().trim().min(1).max(60), target: z.number().int().min(1).max(1_000_000) }),
  z.object({ action: z.literal('goal_remove'), id }),
  z.object({ action: z.literal('goal_claim'), id }),
  z.object({ action: z.literal('buy_cap_set'), person, minutes: z.number().int().min(0).max(1440) }),
  z.object({ action: z.literal('allowance_set'), person, weekday: z.number().int().min(0).max(1440), weekend: z.number().int().min(0).max(1440).nullable() }),
  z.object({ action: z.literal('adjust_time'), person, delta: z.number().int().min(-1440).max(1440).refine((n) => n !== 0), note: z.string().trim().max(60) }),
  z.object({ action: z.literal('adjust'), person, delta: z.number().int().min(-1000).max(1000).refine((n) => n !== 0), note: z.string().trim().max(60) }),
]);

/** Whether every person a request names (its `person`, or each item's in a batch) is someone in the household. */
const knows = async (b: object) => {
  const who = 'person' in b ? [b.person as string | null] : 'items' in b ? (b.items as { person: string | null }[]).map((i) => i.person) : [];
  const named = who.filter((w) => w !== null);
  if (named.length === 0) return true;
  const people = await loadPeople(env.DB);
  return named.every((w) => people.some((p) => p.id === w));
};

const today = () => dayKey(Date.now(), householdZone);
/** The optional schedule fields of a request (every N weeks, until done, optional), left out when not given so an update keeps what is stored. */
const scheduleOf = (b: { everyWeeks?: number | undefined; weekAnchor?: string | null | undefined; untilDone?: boolean | undefined; keptPoints?: number | undefined; optional?: boolean | undefined }) => ({
  ...(b.everyWeeks !== undefined ? { everyWeeks: b.everyWeeks } : {}), ...(b.weekAnchor !== undefined ? { weekAnchor: b.weekAnchor } : {}),
  ...(b.untilDone !== undefined ? { untilDone: b.untilDone } : {}), ...(b.keptPoints !== undefined ? { keptPoints: b.keptPoints } : {}), ...(b.optional !== undefined ? { optional: b.optional } : {}),
});

/** Middleware has already required a session and a same-origin Origin. Reading and ticking are open to every member. */
const off = (locals: App.Locals) => !isOn(locals.disabled, 'chores');
const view = async (locals: App.Locals) => json(await choreState(env.DB, today(), isManager(locals)));

/** What a manager is told about a member action that worked, or null for the ones they are not told about. Read before the action runs, so "extended" and "stopped" can be told apart from a timer that was not there. */
async function activityFor(db: D1Database, b: z.infer<typeof memberBody>): Promise<(() => Activity) | null> {
  if (b.action !== 'redeem' && b.action !== 'use_time' && b.action !== 'timer_stop') return null;
  const [people, timers, reward] = await Promise.all([
    loadPeople(db),
    timersNow(db),
    b.action === 'redeem' ? db.prepare('SELECT name, cost, minutes FROM rewards WHERE id = ?').bind(b.rewardId).first<{ name: string; cost: number; minutes: number }>() : null,
  ]);
  const name = people.find((p) => p.id === b.person)?.name ?? 'Someone';
  const path = `/chores/${encodeURIComponent(b.person)}`;
  const running = (timers.timers[b.person]?.endsAt ?? 0) > timers.now;
  if (b.action === 'redeem' && reward && reward.minutes > 0) {
    const { cost, minutes } = scaled(reward, b.quantity ?? 1);
    return () => ({ kind: 'timers', headline: `${name} got screen time`, detail: `${name} spent ${cost} ${cost === 1 ? 'point' : 'points'} on "${reward.name}" (${minutes} ${minutes === 1 ? 'minute' : 'minutes'}).`, path });
  }
  if (b.action === 'redeem') return () => ({ kind: 'rewards', headline: `${name} asked for a reward`, detail: `${name} would like "${reward?.name ?? 'a reward'}". It is waiting for you to approve or deny it.`, path: '/inbox' });
  if (b.action === 'use_time') return () => ({ kind: 'timers', headline: running ? `${name} added screen time` : `${name} started a timer`, detail: `${name} ${running ? 'added' : 'started'} ${b.minutes} ${b.minutes === 1 ? 'minute' : 'minutes'} of screen time.`, path });
  if (!timers.timers[b.person]) return null;
  return () => ({ kind: 'timers', headline: `${name} stopped their timer`, detail: `${name} stopped their screen time timer${running ? ' early' : ''}.`, path });
}

const STATUS: Record<string, number> = { not_found: 404, daily_limit: 409, not_due: 409, closed: 409, limit: 409, insufficient: 409, locked: 409, not_eligible: 409, bad_request: 400 };

export const GET: APIRoute = async ({ locals, url }) => {
  if (off(locals)) return json({ error: 'not_found' }, 404);
  // Devices showing a countdown ask this every few seconds, so it reads only the timers, not the whole household.
  return url.searchParams.has('timers') ? json(await timersNow(env.DB)) : view(locals);
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (off(locals)) return json({ error: 'not_found' }, 404);
  const raw = await readJson(request, 65536);
  if (raw === null) return json({ error: 'too_large' }, 413);
  const db = env.DB;
  let result: string = 'ok';

  const asMember = memberBody.safeParse(raw);
  if (asMember.success) {
    const b = asMember.data;
    if (!(await knows(b))) return json({ error: 'bad_request' }, 400);
    const via = { mailer: selectMailer(env, import.meta.env.DEV), origin: safeAppOrigin(env.APP_ORIGIN, import.meta.env.DEV), keys: pushKeys(env) };
    const activity = await activityFor(db, b).catch(() => null); // always: the managers' inbox records it even when no email or push is set up
    result = b.action === 'check' ? await setCheck(db, b.id, today(), b.done, Date.now(), isManager(locals))
      : b.action === 'use_time' ? await startTimer(db, b.person, b.minutes, today())
      : b.action === 'timer_stop' ? (await stopTimer(db, b.person), 'ok')
      : b.action === 'sound_set' ? await setSound(db, b.person, b.sound)
      : await requestRedemption(db, b.person, b.rewardId, Date.now(), today(), b.quantity);
    if (result === 'ok' && activity) locals.cfContext.waitUntil(notifyManagers(db, via, activity(), locals.user?.id));
  } else {
    const parsed = managerBody.safeParse(raw);
    if (!parsed.success) return json({ error: 'bad_request' }, 400);
    if (!isManager(locals)) return json({ error: 'forbidden' }, 403);
    const b = parsed.data;
    if (!(await knows(b))) return json({ error: 'bad_request' }, 400);
    const manager = managerActor(locals)!; // the unlocking manager when a member's device is unlocked, so actions are logged to them
    switch (b.action) {
      case 'item_add': result = await addItem(db, b.person, { title: b.title, points: b.points, period: b.period as Period, days: b.days ?? null, onceDate: b.onceDate ?? null, ...scheduleOf(b) }); break;
      case 'items_add':
        for (const i of b.items) {
          result = await addItem(db, i.person, { title: i.title, points: i.points, period: i.period as Period, days: i.days ?? null, onceDate: i.onceDate ?? null, ...scheduleOf(i) });
          if (result !== 'ok') break;
        }
        break;
      case 'item_update': {
        const { action: _a, id: itemId, ...changes } = b;
        result = await updateItem(db, itemId, Object.fromEntries(Object.entries(changes).filter(([, v]) => v !== undefined)));
        break;
      }
      case 'item_remove': if (!(await removeItem(db, b.id))) result = 'not_found'; break;
      case 'item_skip': result = await setSkip(db, b.id, today(), b.skipped); break;
      case 'period_labels_set': result = await setPeriodLabels(db, Object.fromEntries(Object.entries(b.labels).filter(([, v]) => v !== undefined)) as Partial<Record<Period, string>>); break;
      case 'period_hours_set': result = await setPeriodHours(db, b.hours as Parameters<typeof setPeriodHours>[1]); break;
      case 'bonus_set': await setBonus(db, b.person, b.period as Period, b.bonus); break;
      case 'reward_save': result = await saveReward(db, { name: b.name, cost: b.cost, ...(b.minutes !== undefined ? { minutes: b.minutes } : {}), ...(b.people !== undefined ? { people: b.people } : {}), ...(b.hidden !== undefined ? { hidden: b.hidden } : {}) }, b.id); break;
      case 'reward_remove': if (!(await removeReward(db, b.id))) result = 'not_found'; break;
      case 'decide': result = await decideRedemption(db, manager, b.id, b.approve); break;
      case 'decide_all': await approveAffordable(db, manager); break;
      case 'goal_save': result = await saveGoal(db, { name: b.name, target: b.target }, b.id); break;
      case 'goal_remove': if (!(await removeGoal(db, b.id))) result = 'not_found'; break;
      case 'goal_claim': result = await claimGoal(db, manager, b.id); break;
      case 'buy_cap_set': await setBuyCap(db, manager, b.person, b.minutes); break;
      case 'allowance_set': await setAllowance(db, manager, b.person, b.weekday, b.weekend); break;
      case 'adjust_time': await adjustMinutes(db, manager, b.person, b.delta, b.note); break;
      case 'adjust': await adjustPoints(db, manager, b.person, b.delta, b.note); break;
    }
  }
  if (result !== 'ok') return json({ error: result }, STATUS[result] ?? 400);
  return view(locals);
};

export const ALL: APIRoute = () => new Response(null, { status: 405, headers: { Allow: 'GET, POST' } });

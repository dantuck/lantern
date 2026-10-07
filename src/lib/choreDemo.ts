// Browser-safe. The demo has no database, so this applies the same actions as /api/chores to a copy of the state held in the page.
import { allowanceFor, allowanceLeft, itemDue, periodRecord, PERIODS, type ChoreItem, type ChoreState, type Period } from './choreTypes';

let seq = 0;
const uid = (p: string) => `${p}-${++seq}`;

/** Returns the state after one API action. Unknown actions and missing ids change nothing. */
export function applyDemo(prev: ChoreState, p: Record<string, any>, now = Date.now()): ChoreState {
  const s: ChoreState = JSON.parse(JSON.stringify(prev)); // the state is plain data; this also accepts a Svelte $state proxy
  const log = (person: string, delta: number, kind: ChoreState['recent'][number]['kind'], note: string) => {
    s.balances[person] = (s.balances[person] ?? 0) + delta;
    if (kind === 'chore' || kind === 'bonus' || (kind === 'adjust' && delta > 0)) earn(delta);
    s.recent.unshift({ id: uid('e'), person, delta, kind, note, at: now });
    s.recent.length = Math.min(s.recent.length, 20);
  };
  const refresh = () => { for (const r of s.routines) for (const i of r.items) i.due = itemDue(i, s.day); };
  /** Pays or withdraws a person's bonus for a time of day after a tick, like the server's syncBonus. */
  const syncBonus = (person: string | null, period: Period) => {
    const r = s.routines.find((x) => x.person === person);
    if (!r || !person || r.bonuses[period] <= 0) return;
    const due = r.items.filter((i) => i.period === period && i.due);
    const all = due.length > 0 && due.every((i) => i.done);
    if (all !== r.bonusEarned[period]) { r.bonusEarned[period] = all; log(person, all ? r.bonuses[period] : -r.bonuses[period], 'bonus', 'All done'); }
  };
  const routineOf = (person: string | null) => {
    let r = s.routines.find((x) => x.person === person);
    if (!r) {
      r = { id: uid('r'), person, bonuses: periodRecord(0), bonusEarned: periodRecord(false), items: [] };
      s.routines.push(r);
    }
    return r;
  };
  // Household goals count every point anyone earns, so a gain moves them and an un-tick takes it back.
  const earn = (delta: number) => { for (const g of s.goals) if (!g.claimed) g.progress = Math.max(0, Math.min(g.target, g.progress + delta)); };

  switch (p.action) {
    case 'check': {
      for (const r of s.routines) for (const i of r.items) {
        if (i.id !== p.id || i.done === p.done) continue;
        i.done = p.done;
        if (r.person && i.points > 0) log(r.person, p.done ? i.points : -i.points, 'chore', i.title);
        syncBonus(r.person, i.period);
      }
      break;
    }
    case 'redeem': {
      const r = s.rewards.find((x) => x.id === p.rewardId);
      if (r && !r.hidden) s.pending.push({ id: uid('req'), person: p.person, rewardName: r.name, cost: r.cost, minutes: r.minutes, requestedAt: now });
      break;
    }
    case 'use_time': {
      const a = s.allowance[p.person];
      const fromAllowance = Math.min(p.minutes, allowanceLeft(a));
      const fromBank = p.minutes - fromAllowance;
      if (fromBank > (s.minutes[p.person] ?? 0)) break;
      if (a) a.used += fromAllowance;
      s.minutes[p.person] = (s.minutes[p.person] ?? 0) - fromBank;
      break;
    }
    case 'allowance_set':
      if (p.weekday <= 0 && (p.weekend === null || p.weekend <= 0)) delete s.allowance[p.person];
      else s.allowance[p.person] = { weekday: p.weekday, weekend: p.weekend, today: allowanceFor(s.day, p.weekday, p.weekend), used: s.allowance[p.person]?.used ?? 0 };
      break;
    case 'adjust_time': s.minutes[p.person] = Math.max(0, (s.minutes[p.person] ?? 0) + p.delta); break;
    case 'decide': {
      const at = s.pending.findIndex((r) => r.id === p.id);
      if (at < 0) break;
      const [r] = s.pending.splice(at, 1);
      if (p.approve && r) { log(r.person, -r.cost, 'redeem', r.rewardName); s.minutes[r.person] = (s.minutes[r.person] ?? 0) + r.minutes; }
      break;
    }
    case 'decide_all':
      for (const r of [...s.pending]) if ((s.balances[r.person] ?? 0) >= r.cost) { s.pending = s.pending.filter((x) => x.id !== r.id); log(r.person, -r.cost, 'redeem', r.rewardName); s.minutes[r.person] = (s.minutes[r.person] ?? 0) + r.minutes; }
      break;
    case 'goal_save': {
      const g = p.id ? s.goals.find((x) => x.id === p.id) : undefined;
      if (g) { g.name = p.name; g.target = p.target; g.progress = Math.min(g.progress, g.target); }
      else if (!p.id) s.goals.push({ id: uid('g'), name: p.name, target: p.target, progress: 0, claimed: false });
      break;
    }
    case 'goal_remove': s.goals = s.goals.filter((g) => g.id !== p.id); break;
    case 'goal_claim': { const g = s.goals.find((x) => x.id === p.id); if (g && !g.claimed && g.progress >= g.target) g.claimed = true; break; }
    case 'adjust': log(p.person, p.delta, 'adjust', p.note ?? ''); break;
    case 'item_add': {
      const r = routineOf(p.person ?? null);
      const item: ChoreItem = { id: uid('c'), title: p.title, points: p.points, done: false, period: p.period, days: p.onceDate ? null : p.days ?? null, onceDate: p.onceDate ?? null, due: false };
      r.items.push(item);
      refresh();
      break;
    }
    case 'item_update':
      for (const r of s.routines) for (const i of r.items) if (i.id === p.id) {
        if (p.title !== undefined) i.title = p.title;
        if (p.points !== undefined) i.points = p.points;
        if (p.period !== undefined) i.period = p.period;
        if (p.days !== undefined) i.days = p.days;
        if (p.onceDate !== undefined) i.onceDate = p.onceDate;
        if (i.onceDate !== null) i.days = null;
      }
      refresh();
      break;
    case 'item_remove': for (const r of s.routines) r.items = r.items.filter((i) => i.id !== p.id); break;
    case 'bonus_set': if (PERIODS.includes(p.period)) routineOf(p.person).bonuses[p.period as Period] = p.bonus; break;
    case 'reward_save': {
      const r = p.id ? s.rewards.find((x) => x.id === p.id) : undefined;
      if (r) { r.name = p.name; r.cost = p.cost; if (p.minutes !== undefined) r.minutes = p.minutes; if (p.people !== undefined) r.people = p.people; if (p.hidden !== undefined) r.hidden = p.hidden; }
      else if (!p.id) s.rewards.push({ id: uid('r'), name: p.name, cost: p.cost, minutes: p.minutes ?? 0, people: p.people ?? null, hidden: p.hidden ?? false });
      s.rewards.sort((a, b) => a.cost - b.cost);
      break;
    }
    case 'reward_remove': s.rewards = s.rewards.filter((r) => r.id !== p.id); break;
  }
  return s;
}

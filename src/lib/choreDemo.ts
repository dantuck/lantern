// Browser-safe. The demo has no database, so this applies the same actions as /api/chores to a copy of the state held in the page.
import { isDue, type ChoreState } from './choreTypes';

let seq = 0;
const uid = (p: string) => `${p}-${++seq}`;

/** Returns the state after one API action. Unknown actions and missing ids change nothing. */
export function applyDemo(prev: ChoreState, p: Record<string, any>, now = Date.now()): ChoreState {
  const s: ChoreState = JSON.parse(JSON.stringify(prev)); // the state is plain data; this also accepts a Svelte $state proxy
  const log = (person: string, delta: number, kind: ChoreState['recent'][number]['kind'], note: string) => {
    s.balances[person] = (s.balances[person] ?? 0) + delta;
    s.recent.unshift({ id: uid('e'), person, delta, kind, note, at: now });
    s.recent.length = Math.min(s.recent.length, 20);
  };
  const refresh = () => { for (const l of s.lists) l.due = isDue(l, s.day); };
  const owner = (listId: string) => s.lists.find((l) => l.id === listId);

  switch (p.action) {
    case 'check': {
      for (const l of s.lists) for (const i of l.items) {
        if (i.id !== p.id || i.done === p.done) continue;
        i.done = p.done;
        if (l.person && i.points > 0) log(l.person, p.done ? i.points : -i.points, 'chore', i.title);
        const all = l.items.every((x) => x.done);
        if (l.person && l.bonus > 0 && all !== l.bonusEarned) { l.bonusEarned = all; log(l.person, all ? l.bonus : -l.bonus, 'bonus', 'All done'); }
      }
      break;
    }
    case 'redeem': {
      const r = s.rewards.find((x) => x.id === p.rewardId);
      if (r) s.pending.push({ id: uid('req'), person: p.person, rewardName: r.name, cost: r.cost, requestedAt: now });
      break;
    }
    case 'decide': {
      const at = s.pending.findIndex((r) => r.id === p.id);
      if (at < 0) break;
      const [r] = s.pending.splice(at, 1);
      if (p.approve && r) log(r.person, -r.cost, 'redeem', r.rewardName);
      break;
    }
    case 'adjust': log(p.person, p.delta, 'adjust', p.note ?? ''); break;
    case 'list_save': {
      const fields = { name: p.name, person: p.person, period: p.period, days: p.days, onceDate: p.onceDate, bonus: p.bonus };
      const existing = p.id ? owner(p.id) : undefined;
      if (existing) Object.assign(existing, fields);
      else if (!p.id) s.lists.push({ id: uid('l'), ...fields, due: false, bonusEarned: false, items: (p.items ?? []).map((i: { title: string; points: number }) => ({ id: uid('c'), title: i.title, points: i.points, done: false })) });
      refresh();
      break;
    }
    case 'list_remove':
      s.lists = s.lists.filter((l) => l.id !== p.id);
      for (const r of s.rewards) if (r.listIds) r.listIds = r.listIds.filter((id) => id !== p.id); // a scoped reward never falls back to everyone
      break;
    case 'item_add': owner(p.listId)?.items.push({ id: uid('c'), title: p.title, points: p.points, done: false }); break;
    case 'item_update': for (const l of s.lists) for (const i of l.items) if (i.id === p.id) { i.title = p.title; i.points = p.points; } break;
    case 'item_remove': for (const l of s.lists) l.items = l.items.filter((i) => i.id !== p.id); break;
    case 'reward_save': {
      const r = p.id ? s.rewards.find((x) => x.id === p.id) : undefined;
      if (r) { r.name = p.name; r.cost = p.cost; if (p.listIds !== undefined) r.listIds = p.listIds; }
      else if (!p.id) s.rewards.push({ id: uid('r'), name: p.name, cost: p.cost, listIds: p.listIds ?? null });
      s.rewards.sort((a, b) => a.cost - b.cost);
      break;
    }
    case 'reward_remove': s.rewards = s.rewards.filter((r) => r.id !== p.id); break;
  }
  return s;
}

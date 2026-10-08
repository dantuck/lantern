import { PERIODS, type ChoreItem, type Period } from './choreTypes';

/** A list counts as finished when it has chores and every one is done. */
export const allDone = (items: ChoreItem[]) => items.length > 0 && items.every((i) => i.done);

/**
 * What to celebrate for one person: the whole day, plus each time of day that carries a bonus.
 * Keys are `<id>:day` and `<id>:<period>`, ready for completionTracker.
 */
export function celebrationKeys(id: string | null, items: ChoreItem[], bonuses?: Record<Period, number>): [string, boolean][] {
  const keys: [string, boolean][] = [[`${id}:day`, allDone(items)]];
  for (const p of PERIODS) if ((bonuses?.[p] ?? 0) > 0) keys.push([`${id}:${p}`, allDone(items.filter((i) => i.period === p))]);
  return keys;
}

/** A finished day gets the big burst; a time-of-day bonus on its own gets a small one. */
export const burstSize = (fresh: string[]): 'big' | 'small' => (fresh.some((k) => k.endsWith(':day')) ? 'big' : 'small');

/**
 * Remembers who has finished, so a celebration fires only on the change to finished: not for lists that
 * were already complete when the page loaded, and not again until something is un-done. `seen` seeds it.
 */
export function completionTracker<K>(seen: Iterable<K> = []) {
  const complete = new Set<K>(seen);
  /** Feed the current state; returns the keys that just became finished. */
  return (now: [K, boolean][]) => {
    const fresh: K[] = [];
    for (const [key, done] of now) {
      if (!done) complete.delete(key);
      else if (!complete.has(key)) { complete.add(key); fresh.push(key); }
    }
    return fresh;
  };
}

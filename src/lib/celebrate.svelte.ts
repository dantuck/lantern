// Drives the confetti for a chore page: feed it the keys to watch and it counts a burst each time one newly finishes.
import { burstSize, completionTracker } from './completion';

/** Call during component setup. `keys` is read reactively; `burst` goes up on every celebration, so use it as a {#key}. */
export function celebrate(keys: () => [string, boolean][]) {
  let burst = $state(0);
  let size = $state<'big' | 'small'>('big');
  let key = $state(''); // what finished: the day if it did, else the first time of day
  const finished = completionTracker(keys().filter(([, done]) => done).map(([k]) => k));
  $effect(() => {
    const fresh = finished(keys());
    if (fresh.length === 0) return;
    size = burstSize(fresh);
    key = fresh.find((k) => k.endsWith(':day')) ?? fresh[0]!;
    burst++;
  });
  return {
    get burst() { return burst; },
    get size() { return size; },
    get key() { return key; },
  };
}

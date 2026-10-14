// The countdown a chores page shows. Timers live on the server, so every device sees the same one; this keeps a ticking clock that is
// corrected for the device's own clock being a little off, and checks the server every few seconds for a timer started or stopped
// on another device. Call it while a component is being set up.
import { getChores, getTimers } from './choreClient';
import { timeLeftMs, type ChoreState } from './choreTypes';

const POLL_MS = 15_000;
const IDLE_POLL_MS = 60_000; // nothing counting down anywhere: a timer started elsewhere can wait a little longer to show up
const signature = (t: ChoreState['timers']): string => Object.entries(t).map(([p, v]) => `${p}:${v.endsAt}`).sort().join();

export function liveTimers(get: () => ChoreState, set: (s: ChoreState) => void, opts: { demo: boolean; busy: () => boolean; hold?: () => boolean }) {
  let now = $state(Date.now());
  let skew = 0; // server clock minus this device's, from the moment the state arrived

  const tick = () => (now = Date.now() + skew);
  $effect(() => {
    skew = get().now - Date.now();
    tick();
  });

  // Tick only while something is counting down (a finished timer waiting to be cleared is static); twice a second keeps the seconds smooth.
  const counting = $derived(Object.values(get().timers).some((t) => t.endsAt > now));
  const anyTimer = $derived(Object.keys(get().timers).length > 0);
  $effect(() => {
    if (!counting) return;
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  });

  let polling = false;
  async function poll() {
    if (opts.demo || polling || document.visibilityState !== 'visible' || opts.busy()) return;
    polling = true;
    try {
      const seen = await getTimers();
      if (!seen || opts.busy()) return;
      if (signature(get().timers) === signature(seen.timers)) return;
      // Someone started, extended or stopped a timer elsewhere. Their minutes changed too, so read everything again, unless this
      // person is in the middle of editing (the page picks it up on the next check).
      if (opts.hold?.()) return;
      const all = await getChores();
      if (all.ok && !opts.busy()) set(all.state);
    } finally {
      polling = false;
    }
  }

  $effect(() => {
    if (opts.demo) return;
    const id = setInterval(poll, anyTimer ? POLL_MS : IDLE_POLL_MS);
    const visible = () => void poll();
    document.addEventListener('visibilitychange', visible);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', visible); };
  });

  return {
    /** The server's clock now, in milliseconds. */
    get now() { return now; },
    /** Milliseconds left on a person's timer (0 when it has finished or there is none). */
    left(person: string): number {
      const t = get().timers[person];
      return t ? timeLeftMs(t, now) : 0;
    },
  };
}

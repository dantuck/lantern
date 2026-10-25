// The save pipeline the chore pages share: edits go to the server one after another (an edit made mid-save waits its turn instead of being lost),
// and the page reads `busy`, `error` and `saved` (a count that goes up on each successful save) to show progress.
import type { ChoreState } from './choreTypes';
import { runChores } from './choreClient';
import { applyDemo } from './choreDemo';
import { holdRefresh } from './holdRefresh.svelte';

export function chorePipe(get: () => ChoreState, set: (s: ChoreState) => void, demo: boolean) {
  let pending = $state(0);
  let error = $state('');
  let saved = $state(0);
  let tail: Promise<unknown> = Promise.resolve();
  holdRefresh(() => pending > 0); // a page refresh must not land mid-save

  const step = async (payload: Record<string, unknown>): Promise<boolean> => {
    pending++; error = '';
    const r = await runChores(get(), payload, demo);
    pending--;
    if (r.ok) {
      if (pending === 0) set(r.state); // while more edits wait, their screen already shows them; the last answer settles it
      saved++;
      return true;
    }
    error = r.error;
    if (isTick(payload)) set(applyDemo(get(), { ...payload, done: !payload.done })); // the tick did not save: put it back
    return false;
  };
  /** A tick is shown at once and saved behind it, so the checklist never waits on the network. (The demo has no network to wait on.) */
  const isTick = (p: Record<string, unknown>) => !demo && p.action === 'check';
  return {
    get busy() { return pending > 0; },
    get error() { return error; },
    get saved() { return saved; },
    send(payload: Record<string, unknown>): Promise<boolean> {
      if (isTick(payload)) set(applyDemo(get(), payload));
      const next = tail.then(() => step(payload));
      tail = next.catch(() => false); // one failed save must not block the ones after it
      return next;
    },
  };
}

// The save pipeline the chore pages share: edits go to the server one after another (an edit made mid-save waits its turn instead of being lost),
// and the page reads `busy`, `error` and `saved` (a count that goes up on each successful save) to show progress.
import type { ChoreState } from './choreTypes';
import { runChores } from './choreClient';

export function chorePipe(get: () => ChoreState, set: (s: ChoreState) => void, demo: boolean) {
  let pending = $state(0);
  let error = $state('');
  let saved = $state(0);
  let tail: Promise<unknown> = Promise.resolve();

  const step = async (payload: Record<string, unknown>): Promise<boolean> => {
    pending++; error = '';
    const r = await runChores(get(), payload, demo);
    pending--;
    if (r.ok) { set(r.state); saved++; return true; }
    error = r.error;
    return false;
  };
  return {
    get busy() { return pending > 0; },
    get error() { return error; },
    get saved() { return saved; },
    send(payload: Record<string, unknown>): Promise<boolean> {
      const next = tail.then(() => step(payload));
      tail = next.catch(() => false); // one failed save must not block the ones after it
      return next;
    },
  };
}

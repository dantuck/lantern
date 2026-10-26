// The time of day a chores page works from, in milliseconds since local midnight. It starts from the server's reading in the state and
// keeps moving, so a time of day opens or closes while the page is on screen (a kitchen display stays up all day). Call it while a component is being set up.
import { closedPeriods, type ChoreState } from './choreTypes';

const TICK_MS = 15_000;

export function dayClock(get: () => ChoreState) {
  let device = $state(Date.now());
  $effect(() => {
    const id = setInterval(() => (device = Date.now()), TICK_MS);
    return () => clearInterval(id);
  });
  // Time since the state was read, measured on the server's clock at reading and this device's since, so a wrong device clock does not matter.
  let arrived = Date.now();
  $effect(() => { get().now; arrived = Date.now(); device = arrived; });
  const dayMs = $derived(get().dayMs + (device - arrived));
  const closed = $derived(closedPeriods(get().periodHours, dayMs)); // the times of day that are over
  return { get dayMs() { return dayMs; }, get closed() { return closed; } };
}

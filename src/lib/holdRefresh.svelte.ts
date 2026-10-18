// Lets a component ask the page not to refresh itself (see scripts/refresh.ts) while it holds something the person would lose:
// an action in flight, a half-finished edit, a ringing alarm.

/** Holds the page now; call the returned function to let go (more than once is fine). */
export function hold(): () => void {
  const root = document.documentElement;
  root.dataset.holdRefresh = String((Number(root.dataset.holdRefresh) || 0) + 1);
  let held = true;
  return () => {
    if (!held) return;
    held = false;
    const left = (Number(root.dataset.holdRefresh) || 0) - 1;
    if (left > 0) root.dataset.holdRefresh = String(left);
    else delete root.dataset.holdRefresh;
  };
}

/** Holds the page for as long as `holding()` is true. Call it while a component is being set up. */
export function holdRefresh(holding: () => boolean) {
  const held = $derived(holding()); // keystrokes that leave the answer unchanged do not touch the page
  $effect(() => {
    return held ? hold() : undefined;
  });
}

// When an open page may quietly refresh itself. Kept free of the DOM so the rules can be tested on their own.
export const AWAY_MS = 60_000; // hidden at least this long: the page is probably out of date when it comes back
export const EVERY_MS = 5 * 60_000; // a page left in front (a wall display) still refreshes this often
export const QUIET_MS = 8_000; // no tap, key or scroll for this long, so nothing is swapped under a finger
export const TYPING_MS = 60_000; // a field was edited this recently: leave the person's draft alone
export const GIVE_UP_MS = 2 * 60_000; // stop retrying after this long; the next trigger tries again
export const RETRY_MS = 10_000;

export interface Activity {
  now: number;
  /** Last tap, key press, wheel or scroll. */
  active: number;
  /** Last edit to a form field. */
  typed: number;
  /** A text field has focus. */
  focused: boolean;
  /** A dialog or popover is open. */
  open: boolean;
  /** A component has asked to hold the page (see lib/holdRefresh.svelte.ts). */
  held: boolean;
}

export const blocked = (a: Activity): boolean =>
  a.focused || a.open || a.held || a.now - a.active < QUIET_MS || a.now - a.typed < TYPING_MS;

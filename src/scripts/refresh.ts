// Keeps an open page current. When the app comes back to the front, or a page left in front (a wall display) has sat a while, it reads
// the page again and swaps in what changed. Nothing is touched while the person is using the page; it waits and tries again.
// Pages opt in with <body data-live>. A plain fetch is not a navigation, so the service worker never sees or saves it.
import { AWAY_MS, EVERY_MS, GIVE_UP_MS, RETRY_MS, blocked, type Activity } from '../lib/refreshGuard';

if (document.body.hasAttribute('data-live')) {
  let hiddenAt = 0;
  let active = 0;
  let typed = 0;
  let running = false;
  let retry = 0;

  for (const type of ['pointerdown', 'keydown', 'wheel', 'touchmove', 'scroll']) addEventListener(type, () => (active = Date.now()), { capture: true, passive: true });
  addEventListener('input', () => (typed = Date.now()), { capture: true, passive: true });

  const TEXTY = 'input:not([type=checkbox],[type=radio],[type=button],[type=submit],[type=reset],[type=range]), textarea, select, [contenteditable]';
  const anyOpen = (): boolean => {
    if (document.querySelector('dialog[open]')) return true;
    try { return !!document.querySelector(':popover-open'); } catch { return false; } // an older browser without the selector has no popovers either
  };
  const busy = (): boolean => {
    const a: Activity = {
      now: Date.now(),
      active,
      typed,
      focused: !!document.activeElement?.matches(TEXTY),
      open: anyOpen(),
      held: document.documentElement.hasAttribute('data-hold-refresh'),
    };
    return blocked(a);
  };

  // A screen reader hears "Updated" after a swap, and only then.
  const status = document.createElement('div');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.className = 'sr-only';
  document.body.appendChild(status);
  const announce = (text: string) => {
    status.textContent = '';
    requestAnimationFrame(() => (status.textContent = text));
  };

  /** Try now; if the person is busy, try again shortly, for a couple of minutes. */
  function attempt(since = Date.now()) {
    clearTimeout(retry);
    if (document.visibilityState !== 'visible' || running) return;
    if (!busy()) { void refresh(); return; }
    if (Date.now() - since < GIVE_UP_MS) retry = window.setTimeout(() => attempt(since), RETRY_MS);
  }

  async function refresh() {
    running = true;
    try {
      const res = await fetch(location.href, { cache: 'no-store', redirect: 'manual', headers: { Accept: 'text/html' } });
      // Signed out or revoked: let the normal flow show the sign-in page rather than leave signed-in content on screen.
      if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403) { location.reload(); return; }
      // Offline, or the server is unwell: keep what is on screen.
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html')) return;
      const next = new DOMParser().parseFromString(await res.text(), 'text/html');
      const from = next.getElementById('main');
      const main = document.getElementById('main');
      if (!from || !main || busy()) return; // the person got busy while the page was on its way
      if (from.dataset.rev !== undefined && from.dataset.rev === main.dataset.rev) return; // nothing changed: no flicker, nothing re-mounted
      swap(main, from, next);
    } catch {
      /* unreachable right now: the next trigger tries again */
    } finally {
      running = false;
    }
  }

  function swap(main: HTMLElement, from: HTMLElement, next: Document) {
    const y = scrollY;
    const cards = [...main.querySelectorAll<HTMLElement>('.card')].map((c) => c.scrollTop);
    const open = [...main.querySelectorAll<HTMLDetailsElement>('details[id][open]')].map((d) => d.id);
    if (from.dataset.rev === undefined) delete main.dataset.rev;
    else main.dataset.rev = from.dataset.rev;
    main.replaceChildren(...from.childNodes); // the interactive islands upgrade as they land and start with the new data
    // Islands that were swapped out only shut down when this fires (it is what Astro's own page transitions send).
    document.dispatchEvent(new Event('astro:after-swap'));
    for (const id of open) document.getElementById(id)?.setAttribute('open', '');
    main.querySelectorAll<HTMLElement>('.card').forEach((c, i) => { c.scrollTop = cards[i] ?? 0; });
    scrollTo(0, y);
    // The navigation sits outside <main>; the approvals badge on Chores lives there.
    for (const sel of ['nav.rail', 'nav.tabbar', '#more .sheet-links']) {
      const a = next.querySelector(sel);
      const b = document.querySelector(sel);
      if (a && b && a.innerHTML !== b.innerHTML) b.innerHTML = a.innerHTML;
    }
    dispatchEvent(new CustomEvent('lantern:refreshed')); // scripts that ran once at load (local times) run again
    announce('Updated');
  }

  // The periodic check only runs while the page is in front, so a hidden tab never wakes for it.
  let every = 0;
  const watch = () => {
    clearInterval(every);
    if (document.visibilityState === 'visible') every = window.setInterval(() => attempt(), EVERY_MS);
  };
  watch();
  document.addEventListener('visibilitychange', () => {
    watch();
    if (document.visibilityState === 'hidden') hiddenAt = Date.now();
    else if (hiddenAt && Date.now() - hiddenAt > AWAY_MS) attempt();
  });
  addEventListener('pageshow', (e) => { if (e.persisted) attempt(); }); // restored from the back/forward cache without a load
  addEventListener('online', () => attempt());
}

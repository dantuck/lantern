// Wall-display mode for a tablet or monitor on the kitchen wall. The choice is remembered in this browser only.
export {}; // makes this a module, so its names don't collide with the other page scripts
const root = document.documentElement;
const KEY = 'wall';
let lock: WakeLockSentinel | null = null;

const saved = (): boolean => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

async function keepAwake(on: boolean) {
  try {
    if (on) lock = (await navigator.wakeLock?.request('screen')) ?? null;
    else { await lock?.release(); lock = null; }
  } catch { /* unsupported or refused: the screen may sleep, nothing else breaks */ }
}

function apply(on: boolean, fromClick = false) {
  root.toggleAttribute('data-wall', on);
  try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch {}
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-wall-toggle]')) b.setAttribute('aria-pressed', String(on));
  // Fullscreen needs a tap, so only ask for it when the person just chose wall mode.
  if (fromClick) {
    if (on && !document.fullscreenElement) root.requestFullscreen?.().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
  void keepAwake(on);
}

apply(saved());
document.addEventListener('click', (e) => {
  if ((e.target as Element | null)?.closest('[data-wall-toggle]')) apply(!root.hasAttribute('data-wall'), true);
});
// The browser drops a screen wake lock when the tab is hidden; take it again when the tab returns.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && root.hasAttribute('data-wall')) void keepAwake(true);
});

// Wall-display mode for a tablet or monitor on the kitchen wall. The choice is remembered in this browser only.
import { keepAwake } from '../lib/keepAwake';

const root = document.documentElement;
const KEY = 'wall';
let stopAwake: (() => void) | null = null;

const saved = (): boolean => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };

function apply(on: boolean, fromClick = false) {
  root.toggleAttribute('data-wall', on);
  try { on ? localStorage.setItem(KEY, '1') : localStorage.removeItem(KEY); } catch {}
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-wall-toggle]')) b.setAttribute('aria-pressed', String(on));
  // Fullscreen needs a tap, so only ask for it when the person just chose wall mode.
  if (fromClick) {
    if (on && !document.fullscreenElement) root.requestFullscreen?.().catch(() => {});
    if (!on && document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
  }
  stopAwake?.();
  stopAwake = on ? keepAwake(() => {}) : null;
}

apply(saved());
document.addEventListener('click', (e) => {
  if ((e.target as Element | null)?.closest('[data-wall-toggle]')) apply(!root.hasAttribute('data-wall'), true);
});

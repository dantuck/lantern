// Registers the service worker and wires the optional "Install app" button.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

// The worker is skipped in dev (it fights hot reload) unless PUBLIC_ENABLE_SW=1 is set.
if ('serviceWorker' in navigator && (import.meta.env.PROD || import.meta.env.PUBLIC_ENABLE_SW === '1')) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {});
  });
}

// Installing ------------------------------------------------------------------------------------------------------
// Three places offer it, all optional: a one-time banner (touch devices only, from the second visit, dismissible, back after
// 30 days), plus an "Install app" item in the side rail / More sheet as the always-available fallback. Nothing shows once the
// app is already running installed. Browsers that offer a native prompt (Chrome, Edge, Android) get an Install button; iPhone
// and iPad have no prompt, so the banner explains Share -> Add to Home Screen instead.
const installButtons = document.querySelectorAll<HTMLElement>('[data-install-app]');
const banner = document.getElementById('install-banner');
const copy = banner?.querySelector<HTMLElement>('[data-install-copy]');
const bannerGo = banner?.querySelector<HTMLElement>('[data-install-app]');
const DISMISS_KEY = 'lantern:install-dismissed';
const VISITS_KEY = 'lantern:visits';
const SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;
let deferred: BeforeInstallPromptEvent | null = null;

const installed = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const touch = () => matchMedia('(pointer: coarse)').matches;
const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode: the banner may come back, nothing breaks */ } };

const visits = (Number(read(VISITS_KEY)) || 0) + 1;
write(VISITS_KEY, String(visits));

function hideAll() {
  installButtons.forEach((b) => b.setAttribute('hidden', ''));
  banner?.setAttribute('hidden', '');
}

function showBanner() {
  if (!banner || installed() || !touch() || visits < 2) return;
  if (Date.now() - (Number(read(DISMISS_KEY)) || 0) < SNOOZE_MS) return;
  if (deferred) {
    bannerGo?.removeAttribute('hidden');
  } else if (ios()) {
    bannerGo?.setAttribute('hidden', '');
    if (copy) copy.textContent = 'Tap Share, then Add to Home Screen, for quick full-screen access.';
    banner.querySelector('[data-install-ios]')?.removeAttribute('hidden');
  } else return;
  banner.removeAttribute('hidden');
}

if (!installed()) {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    // The menu item is always offered once the browser says the app can be installed; the banner is more selective.
    document.querySelectorAll<HTMLElement>('.nav [data-install-app], .sheet [data-install-app]').forEach((b) => b.removeAttribute('hidden'));
    showBanner();
  });
  if (ios()) showBanner();
}
addEventListener('appinstalled', hideAll);

for (const b of installButtons) {
  b.addEventListener('click', async () => {
    if (!deferred) return;
    const prompt = deferred;
    deferred = null;
    hideAll();
    await prompt.prompt();
  });
}
banner?.querySelector('[data-install-dismiss]')?.addEventListener('click', () => {
  write(DISMISS_KEY, String(Date.now()));
  banner.setAttribute('hidden', '');
});

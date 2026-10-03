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

const installButton = document.getElementById('install-app');
let deferred: BeforeInstallPromptEvent | null = null;

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e as BeforeInstallPromptEvent;
  installButton?.removeAttribute('hidden');
});
addEventListener('appinstalled', () => installButton?.setAttribute('hidden', ''));
installButton?.addEventListener('click', async () => {
  if (!deferred) return;
  const prompt = deferred;
  deferred = null;
  installButton.setAttribute('hidden', '');
  await prompt.prompt();
});

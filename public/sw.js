'use strict';
/*
 * Lantern service worker. Hand-written so the caching rules are short enough to audit.
 *
 * What it does
 *   - Precaches the offline page.
 *   - Caches hashed build assets (/_astro/*) cache-first. They are public and immutable.
 *   - Optionally keeps a copy of the dashboard (/ and /p/<id>) so the family can glance at it offline.
 *
 * What it never does
 *   - Touch /admin, /devices, /api/*, /auth/* or /login, or anything that is not a GET (except noticing a logout).
 *   - Serve a saved page older than MAX_PAGE_AGE_MS.
 *   - Keep saved pages after sign-out, or after the server answers 401/403 or redirects to the sign-in page.
 *
 * Bump VERSION when changing the rules; old caches are deleted on activate.
 */
const VERSION = 'v1';
const SHELL = `shell-${VERSION}`;
const ASSETS = `assets-${VERSION}`;
const PAGES = `pages-${VERSION}`;
const KEEP = [SHELL, ASSETS, PAGES];

// Set to false to disable offline copies of signed-in pages entirely (assets and the offline page still work).
const OFFLINE_PAGES = true;
const MAX_PAGE_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_ASSETS = 120;
const PRECACHE = ['/offline.html', '/offline.css'];
const CACHED_AT = 'x-sw-cached-at';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL)
      .then((cache) => cache.addAll(PRECACHE.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => !KEEP.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'purge') event.waitUntil(purgePages());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Signing out: drop saved pages right away, then let the request go to the network untouched.
  if (req.method === 'POST' && url.pathname === '/auth/logout') {
    event.waitUntil(purgePages());
    return;
  }
  if (req.method !== 'GET') return;

  if (url.pathname.startsWith('/_astro/')) {
    event.respondWith(assetFirst(event, req));
  } else if (req.mode === 'navigate') {
    event.respondWith(navigate(event, req, url));
  }
  // Everything else (API calls, other assets) goes straight to the network.
});

const purgePages = () => caches.delete(PAGES);

/** Only the dashboard views are ever saved for offline use. */
const isSavedPage = (url) => url.pathname === '/' || /^\/p\/[a-z][a-z0-9-]*$/.test(url.pathname);
const pageKey = (url) => new URL(url.pathname, self.location.origin).href;
const isHtml = (res) => (res.headers.get('content-type') || '').includes('text/html');

async function assetFirst(event, req) {
  const cache = await caches.open(ASSETS);
  const hit = await cache.match(req.url);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.status === 200 && res.type === 'basic') {
    event.waitUntil(cache.put(req.url, res.clone()).then(() => trimAssets(cache)));
  }
  return res;
}

async function trimAssets(cache) {
  const keys = await cache.keys();
  // Oldest first (insertion order); hashed filenames mean old deploys' files are never requested again.
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ASSETS))) await cache.delete(k);
}

async function navigate(event, req, url) {
  const saved = OFFLINE_PAGES && isSavedPage(url);
  try {
    const res = await fetch(req);

    if (saved && (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403)) {
      // Signed out, revoked or disabled: the server no longer vouches for this person, so forget what we kept.
      event.waitUntil(purgePages());
      return res;
    }
    if (saved && res.status === 200 && isHtml(res)) {
      event.waitUntil(savePage(url, res.clone()));
      return res;
    }
    if (saved && res.status >= 500) return (await fallback(url)) || res;
    return res;
  } catch {
    return (await fallback(url)) || offlinePage();
  }
}

async function fallback(url) {
  if (!OFFLINE_PAGES || !isSavedPage(url)) return null;
  const cache = await caches.open(PAGES);
  const key = pageKey(url);
  const hit = await cache.match(key);
  if (!hit) return null;
  const cachedAt = Number(hit.headers.get(CACHED_AT));
  if (!(Date.now() - cachedAt <= MAX_PAGE_AGE_MS)) {
    await cache.delete(key);
    return null;
  }
  return withBanner(hit, cachedAt);
}

async function offlinePage() {
  const hit = await (await caches.open(SHELL)).match('/offline.html');
  return hit || Response.error();
}

/** Rebuilds a response from text. The body is already decoded, so encoding/length headers must go. */
function rebuild(text, res, extra) {
  const headers = new Headers(res.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  for (const [k, v] of Object.entries(extra || {})) headers.set(k, v);
  return new Response(text, { status: 200, headers });
}

async function savePage(url, res) {
  const text = await res.text();
  const cache = await caches.open(PAGES);
  await cache.put(pageKey(url), rebuild(text, res, { [CACHED_AT]: String(Date.now()) }));
  await warmAssets(text);
}

/** Fetch the build assets a saved page needs, so its islands also work offline. */
async function warmAssets(html) {
  const cache = await caches.open(ASSETS);
  const urls = new Set([...html.matchAll(/["'](\/_astro\/[^"'?#\s]+)["']/g)].map((m) => m[1]));
  await Promise.all([...urls].map(async (path) => {
    const abs = new URL(path, self.location.origin).href;
    if (await cache.match(abs)) return;
    try {
      const res = await fetch(abs);
      if (res.status === 200 && res.type === 'basic') await cache.put(abs, res);
    } catch { /* offline again; the page still renders without hydration */ }
  }));
  await trimAssets(cache);
}

async function withBanner(hit, cachedAt) {
  const when = new Date(cachedAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  // style="" is allowed by our CSP (style-src-attr); inline <style> and scripts are not, so none are used.
  const banner = `<div role="status" style="position:sticky;top:0;z-index:10;padding:.5rem 1rem;background:#f0b429;color:#1d1d1b;font:14px system-ui,sans-serif;text-align:center">Offline. Showing a copy saved ${when}.</div>`;
  const text = (await hit.text()).replace(/<body[^>]*>/i, (m) => m + banner);
  return rebuild(text, hit);
}

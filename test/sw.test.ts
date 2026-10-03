import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const ORIGIN = 'https://fam.example';
const HOUR = 3_600_000;
const SOURCE = readFileSync('public/sw.js', 'utf8');

type Net = (url: string) => Response | Promise<Response> | never;

/** Runs the real public/sw.js in a sandbox with a fake CacheStorage and a scriptable network. */
function boot() {
  const handlers: Record<string, (e: unknown) => void> = {};
  const store = new Map<string, Map<string, Response>>();
  const norm = (k: string | { url: string }) => new URL(typeof k === 'string' ? k : k.url, ORIGIN).href;
  const cacheFor = (name: string) => {
    const m = store.get(name) ?? new Map<string, Response>();
    store.set(name, m);
    return {
      match: async (k: string | { url: string }) => m.get(norm(k))?.clone(),
      put: async (k: string | { url: string }, r: Response) => void m.set(norm(k), r),
      delete: async (k: string | { url: string }) => m.delete(norm(k)),
      keys: async () => [...m.keys()].map((url) => ({ url })),
      addAll: async (reqs: { url: string }[]) => { for (const r of reqs) m.set(norm(r), await net.impl(r.url)); },
    };
  };
  const caches = {
    open: async (n: string) => cacheFor(n),
    keys: async () => [...store.keys()],
    delete: async (n: string) => store.delete(n),
  };
  const net = { impl: ((u: string) => new Response('net:' + u)) as Net, calls: [] as string[] };
  const fetchFn = async (r: string | { url: string }) => {
    const u = typeof r === 'string' ? r : r.url;
    net.calls.push(u);
    const res = await net.impl(u);
    // A same-origin fetch in a real worker yields a 'basic' response; Node's Response says 'default'.
    if (res instanceof Response) Object.defineProperty(res, 'type', { value: 'basic' });
    return res;
  };
  const self = { addEventListener: (t: string, h: (e: unknown) => void) => (handlers[t] = h), location: { origin: ORIGIN }, skipWaiting: async () => {}, clients: { claim: async () => {} } };
  // In a worker, relative URLs resolve against the scope; Node's Request needs them absolute.
  class SwRequest extends Request { constructor(i: string, init?: RequestInit) { super(new URL(i, ORIGIN).href, init); } }
  vm.runInNewContext(SOURCE, { self, caches, fetch: fetchFn, Request: SwRequest, Response, Headers, URL, Promise, Date, Number, Set, Object, Array, Math, Intl, console });

  async function fetchEvent(url: string, { method = 'GET', mode = 'navigate' } = {}) {
    let responded: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    handlers.fetch!({
      request: { url: url.startsWith('http') ? url : ORIGIN + url, method, mode, headers: new Headers() },
      respondWith: (p: Promise<Response>) => (responded = Promise.resolve(p)),
      waitUntil: (p: Promise<unknown>) => waits.push(Promise.resolve(p)),
    });
    const res = responded ? await responded : undefined;
    await Promise.all(waits);
    return { handled: responded !== undefined, res };
  }
  async function lifecycle(type: 'install' | 'activate') {
    const waits: Promise<unknown>[] = [];
    handlers[type]!({ waitUntil: (p: Promise<unknown>) => waits.push(Promise.resolve(p)) });
    await Promise.all(waits);
  }
  const pages = () => store.get('pages-v1');
  const offline = () => { net.impl = () => { throw new TypeError('Failed to fetch'); }; };
  return { handlers, store, net, fetchEvent, lifecycle, pages, offline, cacheFor };
}

const html = (body: string, headers: Record<string, string> = {}) =>
  new Response(`<!doctype html><html><head></head><body class="x">${body}</body></html>`, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-03T12:00:00Z')); });
afterEach(() => vi.useRealTimers());

describe('install / activate', () => {
  it('precaches the offline page and stylesheet', async () => {
    const sw = boot();
    await sw.lifecycle('install');
    expect([...sw.store.get('shell-v1')!.keys()]).toEqual([`${ORIGIN}/offline.html`, `${ORIGIN}/offline.css`]);
  });
  it('deletes caches from other versions on activate and keeps current ones', async () => {
    const sw = boot();
    await sw.cacheFor('pages-v0').put('/', new Response('old'));
    await sw.cacheFor('assets-v1').put('/_astro/a.js', new Response('a'));
    await sw.lifecycle('activate');
    expect([...sw.store.keys()]).toEqual(['assets-v1']);
  });
});

describe('what it must never touch', () => {
  it('ignores cross-origin requests and non-GET requests', async () => {
    const sw = boot();
    expect((await sw.fetchEvent('https://evil.example/', { mode: 'navigate' })).handled).toBe(false);
    expect((await sw.fetchEvent('/admin/action', { method: 'POST', mode: 'navigate' })).handled).toBe(false);
    expect((await sw.fetchEvent('/auth/confirm', { method: 'POST', mode: 'cors' })).handled).toBe(false);
    expect(sw.net.calls).toEqual([]);
  });
  it('leaves API calls and other subresources to the network', async () => {
    const sw = boot();
    expect((await sw.fetchEvent('/api/plugins/calendar/data', { mode: 'cors' })).handled).toBe(false);
    expect((await sw.fetchEvent('/icons/icon-192.png', { mode: 'no-cors' })).handled).toBe(false);
    expect(sw.pages()).toBeUndefined();
  });
  it.each(['/admin', '/devices', '/auth/verify', '/login', '/api/plugins/calendar/data', '/p/calendar/extra', '/p/Bad_ID', '/p/'])(
    'never saves a copy of %s, even when it loads fine',
    async (path) => {
      const sw = boot();
      sw.net.impl = () => html('secret');
      await sw.fetchEvent(path);
      expect(sw.pages()).toBeUndefined();
    },
  );
  it('shows the offline page, not a saved dashboard, for admin and devices when offline', async () => {
    const sw = boot();
    await sw.lifecycle('install');
    sw.net.impl = () => html('dashboard');
    await sw.fetchEvent('/');
    sw.offline();
    for (const path of ['/admin', '/devices', '/login']) {
      const { res } = await sw.fetchEvent(path);
      expect(await res!.text()).toContain('net:'); // came from the precached offline stub, not the dashboard copy
    }
  });
});

describe('saving the dashboard for offline use', () => {
  it('saves / and /p/<id>, drops encoding headers, keeps security headers, and warms build assets', async () => {
    const sw = boot();
    sw.net.impl = (u) => u.includes('/_astro/')
      ? new Response('js', { status: 200 })
      : html('<script type="module" src="/_astro/app.abc.js"></script><astro-island component-url="/_astro/Island.def.js">hi</astro-island>', {
        'content-encoding': 'br', 'content-length': '999', 'content-security-policy': "default-src 'none'",
      });
    const { res } = await sw.fetchEvent('/');
    expect(await res!.text()).toContain('hi'); // the browser still gets the live response
    await sw.fetchEvent('/p/calendar');
    expect([...sw.pages()!.keys()]).toEqual([`${ORIGIN}/`, `${ORIGIN}/p/calendar`]);
    const saved = sw.pages()!.get(`${ORIGIN}/`)!;
    expect(saved.headers.get('content-encoding')).toBeNull();
    expect(saved.headers.get('content-length')).toBeNull();
    expect(saved.headers.get('content-security-policy')).toBe("default-src 'none'");
    expect(saved.headers.get('x-sw-cached-at')).toBe(String(Date.now()));
    expect([...sw.store.get('assets-v1')!.keys()].sort()).toEqual([`${ORIGIN}/_astro/Island.def.js`, `${ORIGIN}/_astro/app.abc.js`]);
  });
  it('does not save errors, redirects or non-HTML', async () => {
    const sw = boot();
    sw.net.impl = () => new Response('nope', { status: 404, headers: { 'content-type': 'text/html' } });
    await sw.fetchEvent('/');
    sw.net.impl = () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    await sw.fetchEvent('/p/calendar');
    expect(sw.pages()).toBeUndefined();
  });
  it('serves the saved copy with an offline banner when the network is down', async () => {
    const sw = boot();
    sw.net.impl = () => html('<h1>Calendar</h1>', { 'content-security-policy': "default-src 'none'" });
    await sw.fetchEvent('/');
    sw.offline();
    const { res } = await sw.fetchEvent('/');
    const body = await res!.text();
    expect(res!.status).toBe(200);
    expect(body).toMatch(/<body class="x"><div role="status"[^>]*>Offline\. Showing a copy saved/);
    expect(body).toContain('<h1>Calendar</h1>');
    expect(res!.headers.get('content-security-policy')).toBe("default-src 'none'");
    expect(body).not.toMatch(/<script|<style/); // the banner must not need anything the CSP forbids
  });
  it('refuses a saved copy older than 24 hours and deletes it', async () => {
    const sw = boot();
    await sw.lifecycle('install');
    sw.net.impl = () => html('old data');
    await sw.fetchEvent('/');
    sw.offline();
    vi.setSystemTime(Date.now() + 23 * HOUR);
    expect(await (await sw.fetchEvent('/')).res!.text()).toContain('old data');
    vi.setSystemTime(Date.now() + 2 * HOUR);
    expect(await (await sw.fetchEvent('/')).res!.text()).not.toContain('old data');
    expect(sw.pages()!.size).toBe(0);
  });
  it('falls back to a saved copy on server errors, and passes errors through when nothing is saved', async () => {
    const sw = boot();
    sw.net.impl = () => new Response('boom', { status: 502 });
    expect((await sw.fetchEvent('/')).res!.status).toBe(502);
    sw.net.impl = () => html('fine');
    await sw.fetchEvent('/');
    sw.net.impl = () => new Response('boom', { status: 500 });
    expect(await (await sw.fetchEvent('/')).res!.text()).toContain('fine');
  });
  it('uses the offline page when offline with nothing saved, and an error if even that is missing', async () => {
    const sw = boot();
    await sw.lifecycle('install');
    sw.offline();
    expect(await (await sw.fetchEvent('/')).res!.text()).toContain('offline.html');
    const bare = boot();
    bare.offline();
    expect((await bare.fetchEvent('/')).res!.type).toBe('error');
  });
});

describe('forgetting saved pages', () => {
  const save = async (sw: ReturnType<typeof boot>) => { sw.net.impl = () => html('private'); await sw.fetchEvent('/'); await sw.fetchEvent('/p/calendar'); expect(sw.pages()!.size).toBe(2); };
  it('on logout, before the request even leaves, without intercepting it', async () => {
    const sw = boot();
    await save(sw);
    const { handled } = await sw.fetchEvent('/auth/logout', { method: 'POST' });
    expect(handled).toBe(false);
    expect(sw.pages()).toBeUndefined();
  });
  it.each([
    ['a redirect to sign-in', () => ({ type: 'opaqueredirect', status: 0, headers: new Headers(), clone() { return this; } }) as unknown as Response],
    ['401', () => new Response('x', { status: 401 })],
    ['403', () => new Response('x', { status: 403 })],
  ])('when the server answers with %s', async (_n, make) => {
    const sw = boot();
    await save(sw);
    sw.net.impl = make;
    await sw.fetchEvent('/p/calendar');
    expect(sw.pages()).toBeUndefined();
  });
  it('does not keep serving a purged copy offline', async () => {
    const sw = boot();
    await sw.lifecycle('install');
    await save(sw);
    await sw.fetchEvent('/auth/logout', { method: 'POST' });
    sw.offline();
    expect(await (await sw.fetchEvent('/')).res!.text()).not.toContain('private');
  });
  it('on an explicit purge message', async () => {
    const sw = boot();
    await save(sw);
    const waits: Promise<unknown>[] = [];
    sw.handlers.message!({ data: { type: 'purge' }, waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
    expect(sw.pages()).toBeUndefined();
  });
});

describe('build assets', () => {
  it('are served cache-first after the first load', async () => {
    const sw = boot();
    sw.net.impl = () => new Response('js');
    await sw.fetchEvent('/_astro/a.js', { mode: 'no-cors' });
    sw.offline();
    const { res } = await sw.fetchEvent('/_astro/a.js', { mode: 'no-cors' });
    expect(await res!.text()).toBe('js');
    expect(sw.net.calls).toHaveLength(1);
  });
  it('are not cached when the response is not a 200', async () => {
    const sw = boot();
    sw.net.impl = () => new Response('missing', { status: 404 });
    await sw.fetchEvent('/_astro/gone.js', { mode: 'no-cors' });
    expect(sw.store.get('assets-v1')?.size ?? 0).toBe(0);
  });
  it('are capped at 120 entries, dropping the oldest', async () => {
    const sw = boot();
    sw.net.impl = () => new Response('js');
    for (let i = 0; i < 130; i++) await sw.fetchEvent(`/_astro/f${i}.js`, { mode: 'no-cors' });
    const keys = [...sw.store.get('assets-v1')!.keys()];
    expect(keys).toHaveLength(120);
    expect(keys).not.toContain(`${ORIGIN}/_astro/f0.js`);
    expect(keys).toContain(`${ORIGIN}/_astro/f129.js`);
  });
});

describe('static config', () => {
  it('manifest is valid and its icons exist', async () => {
    const { existsSync } = await import('node:fs');
    const m = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
    expect(m).toMatchObject({ start_url: '/', scope: '/', display: 'standalone', id: '/' });
    expect(m.icons.some((i: { sizes: string }) => i.sizes === '192x192')).toBe(true);
    expect(m.icons.some((i: { sizes: string; purpose: string }) => i.sizes === '512x512' && i.purpose === 'maskable')).toBe(true);
    for (const i of m.icons) expect(existsSync(`public${i.src}`), i.src).toBe(true);
  });
  it('the offline page needs no inline code (it is served under a strict CSP)', () => {
    const page = readFileSync('public/offline.html', 'utf8');
    expect(page).not.toMatch(/<script|<style|\son[a-z]+=/i);
  });
  it('the service worker file is served uncached', () => {
    expect(readFileSync('public/_headers', 'utf8')).toMatch(/\/sw\.js\n\s+Cache-Control: no-cache/);
  });
});

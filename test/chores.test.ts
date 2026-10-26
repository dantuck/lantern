import { beforeEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';
import { createTestDb } from './d1shim';
import { addItem, choreState, MAX_ITEMS_PER_ROUTINE, removeItem, setBonus, setCheck, setPeriodHours, setPeriodLabels, setSkip, updateItem, type ChoreInput } from '../src/lib/chores';
import { adjustPoints, approveAffordable, adjustMinutes, balanceOf, claimGoal, decideRedemption, MAX_GOALS, MAX_PENDING, removeGoal, removeReward, requestRedemption, saveGoal, saveReward, setAllowance, setBuyCap, useMinutes } from '../src/lib/rewards';
import { zonedTimeMs } from '../src/lib/dates';
import { householdZone } from '../src/lib/household';
import { allDone } from '../src/lib/completion';
import { buyRoom, canAsk, closedPeriods, DEFAULT_HOURS, phaseOf, tickBlock, choreSuggestions, describeSchedule, finishedBefore, itemDue, pointsOnWeekday, holdingLabel, lockedPoints, sections, spendable, suggestedCost, typicalDailyPoints, toggleDay, WEEKDAYS_MASK, type ChoreItem, type Routine } from '../src/lib/choreTypes';
import { requiredRole } from '../src/lib/http';

const T = 1_700_000_000_000;
const at = (hour: number) => zonedTimeMs('2026-10-07', hour, 0, 0, householdZone); // a time on WED in the household's zone, whatever it is
const AM = at(8), PM = at(13);
const WED = '2026-10-07'; // a Wednesday (weekday 3)
const THU = '2026-10-08';
const manager = { id: 'u1', email: 'm@example.com', role: 'manager', createdAt: 0, disabledAt: null } as const;
const chore = (title: string, points = 0, extra: Partial<ChoreInput> = {}): ChoreInput => ({ title, points, period: 'morning', days: null, onceDate: null, ...extra });
const give = async (db: D1Database, person: string | null, ...items: ChoreInput[]) => { for (const [i, it] of items.entries()) await addItem(db, person, it, T + i); };

describe('schedules', () => {
  it('is due on the picked weekdays, every day, or on the one date', () => {
    expect(itemDue({ days: null, onceDate: null }, WED)).toBe(true);
    expect(itemDue({ days: WEEKDAYS_MASK, onceDate: null }, WED)).toBe(true);
    expect(itemDue({ days: WEEKDAYS_MASK, onceDate: null }, '2026-10-10')).toBe(false); // Saturday
    expect(itemDue({ days: 1 << 3, onceDate: null }, THU)).toBe(false);
    expect(itemDue({ days: 1 << 3, onceDate: WED }, WED)).toBe(true); // a one-off ignores the weekday mask
    expect(itemDue({ days: null, onceDate: THU }, WED)).toBe(false);
  });
  it('describes them for people', () => {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    expect(describeSchedule({ days: null, onceDate: null }, names)).toBe('Every day');
    expect(describeSchedule({ days: WEEKDAYS_MASK, onceDate: null }, names)).toBe('Weekdays');
    expect(describeSchedule({ days: toggleDay(toggleDay(0, 1), 3), onceDate: null }, names)).toBe('Mon, Wed');
    expect(describeSchedule({ days: null, onceDate: WED }, names)).toBe('Once, 2026-10-07');
  });
  it('repeats every Nth week, counted from the week it starts', () => {
    const everyOther = { days: 1 << 3, onceDate: null, everyWeeks: 2, weekAnchor: '2026-10-04' }; // Wednesdays, starting the week of Oct 4
    expect(itemDue(everyOther, WED)).toBe(true);
    expect(itemDue(everyOther, '2026-10-14')).toBe(false);
    expect(itemDue(everyOther, '2026-10-21')).toBe(true);
    expect(itemDue(everyOther, '2026-09-30')).toBe(false); // the week before it starts counts the same way
    expect(itemDue(everyOther, '2026-09-23')).toBe(true);
    expect(itemDue(everyOther, THU)).toBe(false); // right week, wrong weekday
    expect(itemDue({ ...everyOther, everyWeeks: 3 }, '2026-10-14')).toBe(false);
    expect(itemDue({ ...everyOther, everyWeeks: 3 }, '2026-10-28')).toBe(true);
    expect(itemDue({ days: 1 << 3, onceDate: null, everyWeeks: 3, weekAnchor: '2026-10-04' }, '2026-10-28')).toBe(true); // 3 weeks on
    expect(itemDue({ days: 1 << 3, onceDate: null, everyWeeks: 2, weekAnchor: null }, '2026-10-14')).toBe(true); // no anchor: every week
  });
  it('says so when weeks are skipped', () => {
    expect(describeSchedule({ days: 1 << 6, onceDate: null, everyWeeks: 2 })).toBe('Sat, every other week');
    expect(describeSchedule({ days: null, onceDate: null, everyWeeks: 3 })).toBe('Every day, every 3 weeks');
    expect(describeSchedule({ days: null, onceDate: null, everyWeeks: 1 })).toBe('Every day');
  });
  it('groups chores by time of day, in the order of the day', () => {
    const items = [{ period: 'evening' as const, n: 1 }, { period: 'any' as const, n: 2 }, { period: 'morning' as const, n: 3 }, { period: 'morning' as const, n: 4 }];
    expect(sections(items).map((x) => [x.period, x.items.map((i) => i.n)])).toEqual([['morning', [3, 4]], ['evening', [1]], ['any', [2]]]);
  });
});

describe('every other week, stored', () => {
  let db: D1Database;
  beforeEach(() => { db = createTestDb(); });
  const first = async (day: string) => (await choreState(db, day, true)).routines[0]!.items[0]!;

  it('keeps the week it starts on and is due only in its weeks', async () => {
    // T is in the week of 2023-11-12; "now" decides the week when none is given.
    await addItem(db, 'agnes', chore('Bins', 1, { days: 1 << 3, everyWeeks: 2, weekAnchor: '2026-10-07' }), T);
    let item = await first(WED);
    expect([item.everyWeeks, item.weekAnchor, item.due]).toEqual([2, '2026-10-04', true]);
    expect((await first('2026-10-14')).due).toBe(false);
    expect((await first('2026-10-21')).due).toBe(true);
    expect(await setCheck(db, item.id, '2026-10-14', true)).toBe('not_due');

    expect(await updateItem(db, item.id, { everyWeeks: 1 })).toBe('ok');
    item = await first('2026-10-14');
    expect([item.everyWeeks, item.weekAnchor, item.due]).toEqual([1, null, true]);

    expect(await updateItem(db, item.id, { everyWeeks: 3, weekAnchor: '2026-10-14' })).toBe('ok');
    expect((await first('2026-10-14')).weekAnchor).toBe('2026-10-11');
    expect(await updateItem(db, item.id, { onceDate: WED })).toBe('ok');
    expect([(await first(WED)).everyWeeks, (await first(WED)).weekAnchor]).toEqual([1, null]);
  });
  it('refuses a bad count or date, and defaults the week to the current one', async () => {
    expect(await addItem(db, 'agnes', chore('A', 0, { everyWeeks: 5 }), T)).toBe('bad_request');
    expect(await addItem(db, 'agnes', chore('B', 0, { everyWeeks: 0 }), T)).toBe('bad_request');
    expect(await addItem(db, 'agnes', chore('C', 0, { everyWeeks: 2, weekAnchor: 'next tuesday' }), T)).toBe('bad_request');
    expect(await addItem(db, 'agnes', chore('D', 0, { everyWeeks: 2 }), T)).toBe('ok');
    expect((await first(WED)).weekAnchor).toBe('2023-11-12'); // the Sunday of the week T falls in
  });
});

describe('one routine per person', () => {
  let db: D1Database;
  beforeEach(() => { db = createTestDb(); });
  const routineOf = async (person: string | null, day = WED) => (await choreState(db, day, true)).routines.find((r) => r.person === person);

  it('keeps every chore for a person in one routine, resets ticks each day and removes things', async () => {
    expect(await addItem(db, 'agnes', chore('Brush teeth', 1), T)).toBe('ok');
    expect(await addItem(db, 'agnes', chore('Make bed', 2, { period: 'evening' }), T + 1)).toBe('ok');
    expect((await choreState(db, WED, true)).routines).toHaveLength(1);
    const r = (await routineOf('agnes'))!;
    expect(r.items.map((i) => [i.title, i.period])).toEqual([['Brush teeth', 'morning'], ['Make bed', 'evening']]);
    const id = r.items[0]!.id;
    expect(await setCheck(db, id, WED, true, T)).toBe('ok');
    expect(await setCheck(db, id, WED, true, T)).toBe('ok'); // ticking twice is harmless
    expect((await routineOf('agnes', WED))!.items[0]!.done).toBe(true);
    expect((await routineOf('agnes', THU))!.items[0]!.done).toBe(false); // fresh the next morning
    expect(await setCheck(db, id, WED, false)).toBe('ok');
    expect((await routineOf('agnes', WED))!.items[0]!.done).toBe(false);
    expect(await setCheck(db, 'nope', WED, true)).toBe('not_found');
    expect(await removeItem(db, id)).toBe(true);
    expect(await removeItem(db, id)).toBe(false);
  });

  it('gives "Anyone" its own routine, and a different one to each person', async () => {
    await give(db, 'agnes', chore('A'));
    await give(db, 'margo', chore('B'));
    await give(db, null, chore('C'));
    await give(db, null, chore('D'));
    const rs = (await choreState(db, WED, true)).routines;
    expect(Object.fromEntries(rs.map((r) => [r.person ?? 'anyone', r.items.length]))).toEqual({ agnes: 1, margo: 1, anyone: 2 });
  });

  it('edits a chore, changing only what is given', async () => {
    await give(db, 'agnes', chore('A', 1));
    const id = (await routineOf('agnes'))!.items[0]!.id;
    expect(await updateItem(db, id, { title: 'B', points: 5 })).toBe('ok');
    expect(await updateItem(db, id, { period: 'evening' })).toBe('ok');
    expect(await updateItem(db, 'nope', { title: 'x' })).toBe('not_found');
    expect((await routineOf('agnes'))!.items[0]).toMatchObject({ title: 'B', points: 5, period: 'evening', days: null, onceDate: null });
  });

  it('only lets a chore be ticked on a day it is scheduled', async () => {
    await give(db, 'agnes', chore('Trash', 5, { days: 1 << 3 })); // Wednesdays
    const id = (await routineOf('agnes'))!.items[0]!.id;
    expect(await setCheck(db, id, THU, true)).toBe('not_due');
    expect(await balanceOf(db, 'agnes')).toBe(0);
    expect((await routineOf('agnes', THU))!.items[0]!.due).toBe(false);
    expect((await routineOf('agnes', WED))!.items[0]!.due).toBe(true);
  });

  it('enforces the cap on chores per routine', async () => {
    for (let i = 0; i < MAX_ITEMS_PER_ROUTINE; i++) await addItem(db, 'agnes', chore(`c${i}`), T + i);
    expect(await addItem(db, 'agnes', chore('one too many'))).toBe('limit');
    expect(await addItem(db, 'margo', chore('fine'))).toBe('ok'); // each person has their own allowance
  });
});

describe('points and rewards', () => {
  let db: D1Database;
  beforeEach(async () => {
    db = createTestDb();
    await db.prepare("INSERT INTO users (id, email, role, created_at) VALUES ('u1', 'm@example.com', 'manager', 0)").run();
  });

  it('pays the owner for each chore once, and takes it back when un-ticked', async () => {
    await give(db, 'agnes', chore('A', 2), chore('B', 3));
    const [a, b] = (await choreState(db, WED, false)).routines[0]!.items;
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
    await setBonus(db, 'agnes', 'morning', 4);
    await give(db, 'agnes', chore('A', 1), chore('B', 1));
    const [a, b] = (await choreState(db, WED, false)).routines[0]!.items;
    await setCheck(db, a!.id, WED, true, T);
    expect(await balanceOf(db, 'agnes')).toBe(1);
    await setCheck(db, b!.id, WED, true, T);
    expect(await balanceOf(db, 'agnes')).toBe(6);
    expect((await choreState(db, WED, false)).routines[0]!.bonusEarned.morning).toBe(true);
    await setCheck(db, b!.id, WED, true, T);
    expect(await balanceOf(db, 'agnes')).toBe(6);
    await setCheck(db, a!.id, WED, false);
    expect(await balanceOf(db, 'agnes')).toBe(1);
    expect((await choreState(db, WED, false)).routines[0]!.bonusEarned.morning).toBe(false);
    expect((await choreState(db, THU, false)).routines[0]!.bonusEarned.morning).toBe(false);
  });

  it('earns nothing on chores that belong to nobody', async () => {
    await give(db, null, chore('A', 3));
    await setCheck(db, (await choreState(db, WED, false)).routines[0]!.items[0]!.id, WED, true, T);
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

describe('rewards limited to people', () => {
  let db: D1Database;
  beforeEach(async () => {
    db = createTestDb();
    await db.prepare("INSERT INTO users (id, email, role, created_at) VALUES ('u1', 'm@example.com', 'manager', 0)").run();
    await adjustPoints(db, manager, 'agnes', 100, '', T);
    await adjustPoints(db, manager, 'margo', 100, '', T);
  });
  const reward = async () => (await choreState(db, WED, true)).rewards[0]!;

  it('is open to everyone unless it is limited, and can be limited and opened again', async () => {
    await saveReward(db, { name: 'Pizza', cost: 10 }, undefined, T);
    expect((await reward()).people).toBeNull();
    const id = (await reward()).id;
    await saveReward(db, { name: 'Pizza', cost: 10, people: ['agnes'] }, id);
    expect((await reward()).people).toEqual(['agnes']);
    await saveReward(db, { name: 'Pizza', cost: 12 }, id); // editing the price leaves the limit alone
    expect(await reward()).toMatchObject({ cost: 12, people: ['agnes'] });
    await saveReward(db, { name: 'Pizza', cost: 12, people: null }, id);
    expect((await reward()).people).toBeNull();
  });

  it('only lets the chosen people ask', async () => {
    await saveReward(db, { name: 'Shoes', cost: 10, people: ['agnes'] }, undefined, T);
    const r = await reward();
    expect(await requestRedemption(db, 'margo', r.id, T)).toBe('not_eligible');
    expect(await requestRedemption(db, 'agnes', r.id, T)).toBe('ok');
    expect(canAsk(r, 'agnes')).toBe(true);
    expect(canAsk(r, 'margo')).toBe(false);
  });

  it('never falls back to everyone when nobody is picked', async () => {
    await saveReward(db, { name: 'Shoes', cost: 10, people: [] }, undefined, T);
    const r = await reward();
    expect(r.people).toEqual([]);
    expect(await requestRedemption(db, 'agnes', r.id, T)).toBe('not_eligible');
    expect(canAsk(r, 'agnes')).toBe(false);
  });
});

describe('manager-only page', () => {
  it('is behind the manager role', () => {
    expect(requiredRole('/chores/manage')).toBe('manager');
    expect(requiredRole('/chores')).toBeNull();
  });
});

describe('migration 0012', () => {
  it('merges each person\'s lists into one routine and keeps schedules, bonuses, reward limits and paid bonuses', () => {
    const sqlite = new DatabaseSync(':memory:');
    sqlite.exec('PRAGMA foreign_keys = ON');
    const files = readdirSync('migrations').sort();
    for (const f of files.filter((n) => n < '0012')) sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));
    sqlite.exec(`
      INSERT INTO chore_lists (id, name, person, period, days, once_date, bonus, created_at) VALUES
        ('l1', 'Morning', 'agnes', 'morning', 127, NULL, 3, 1), ('l2', 'Ballet', 'agnes', 'afternoon', 8, NULL, 2, 2),
        ('l3', 'Party', 'agnes', 'evening', 127, '2026-10-09', 0, 3), ('l4', 'House', NULL, 'any', 127, NULL, 5, 4),
        ('l5', 'Dead', 'margo', 'any', 0, NULL, 0, 5), ('l6', 'Margo', 'margo', 'morning', 62, NULL, 1, 6);
      INSERT INTO chore_items (id, list_id, title, points, days, created_at) VALUES
        ('a', 'l1', 'Bed', 1, NULL, 1), ('b', 'l1', 'Bins', 1, 8, 2), ('c', 'l2', 'Bag', 1, NULL, 3), ('d', 'l3', 'Cake', 1, NULL, 4),
        ('e', 'l4', 'Plants', 0, NULL, 5), ('f', 'l5', 'Never', 1, NULL, 6), ('g', 'l6', 'Walk', 1, NULL, 7);
      INSERT INTO rewards (id, name, cost, created_at, scoped) VALUES ('r1', 'Shoes', 5, 1, 1), ('r2', 'Cake', 5, 1, 1);
      INSERT INTO reward_lists VALUES ('r1', 'l2'), ('r1', 'l6'), ('r2', 'l4');
      INSERT INTO chore_checks VALUES ('a', '2026-10-07', 1);
      INSERT INTO reward_ledger (id, person, delta, kind, ref, note, at) VALUES ('x', 'agnes', 3, 'bonus', 'l1:2026-10-07', 'All done', 1);`);
    sqlite.exec(readFileSync(`migrations/${files.find((n) => n.startsWith('0012'))!}`, 'utf8'));
    expect(sqlite.prepare('SELECT person FROM chore_lists ORDER BY created_at').all()).toEqual([{ person: 'agnes' }, { person: null }, { person: 'margo' }]);
    expect(sqlite.prepare('SELECT id, period, days, once_date FROM chore_items ORDER BY id').all()).toEqual([
      { id: 'a', period: 'morning', days: null, once_date: null }, { id: 'b', period: 'morning', days: 8, once_date: null },
      { id: 'c', period: 'afternoon', days: 8, once_date: null }, { id: 'd', period: 'evening', days: null, once_date: '2026-10-09' },
      { id: 'e', period: 'any', days: null, once_date: null }, { id: 'g', period: 'morning', days: 62, once_date: null },
    ]); // the chore on a list that never ran ('f') is gone
    expect(sqlite.prepare('SELECT person, COUNT(*) AS n FROM chore_items i JOIN chore_lists l ON l.id = i.list_id GROUP BY person ORDER BY person').all()).toEqual([
      { person: null, n: 1 }, { person: 'agnes', n: 4 }, { person: 'margo', n: 1 },
    ]);
    expect(sqlite.prepare('SELECT person, period, bonus FROM chore_bonus ORDER BY person, period').all()).toEqual([
      { person: 'agnes', period: 'afternoon', bonus: 2 }, { person: 'agnes', period: 'morning', bonus: 3 }, { person: 'margo', period: 'morning', bonus: 1 },
    ]); // nothing for "Anyone", which earns no points
    expect(sqlite.prepare('SELECT reward_id, person FROM reward_people ORDER BY reward_id, person').all()).toEqual([
      { reward_id: 'r1', person: 'agnes' }, { reward_id: 'r1', person: 'margo' },
    ]); // r2 was limited to a list nobody owns, so it still reaches nobody
    expect(sqlite.prepare('SELECT ref FROM reward_ledger').all()).toEqual([{ ref: 'agnes:morning:2026-10-07' }]);
    expect(sqlite.prepare('SELECT item_id FROM chore_checks').all()).toEqual([{ item_id: 'a' }]);
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

describe('chore schedules and bonuses by time of day', () => {
  let db: D1Database;
  beforeEach(() => { db = createTestDb(); });
  const items = async (day: string) => (await choreState(db, day, false)).routines[0]!.items;

  it('is due every day unless the chore has its own weekdays', async () => {
    await give(db, 'agnes', chore('Brush teeth', 1), chore('Bins', 2, { days: 1 << 3 })); // bins on Wednesdays
    expect((await items(WED)).map((i) => [i.title, i.due])).toEqual([['Brush teeth', true], ['Bins', true]]);
    expect((await items(THU)).map((i) => [i.title, i.due])).toEqual([['Brush teeth', true], ['Bins', false]]);
  });
  it('supports one-off chores, which win over weekdays', async () => {
    await give(db, 'agnes', chore('Party', 1, { onceDate: THU, days: 1 << 3 }));
    expect((await items(THU))[0]).toMatchObject({ due: true, days: null, onceDate: THU });
    expect((await items(WED))[0]!.due).toBe(false);
    const id = (await items(THU))[0]!.id;
    expect(await setCheck(db, id, WED, true, T)).toBe('not_due');
    expect(await setCheck(db, id, THU, true, T)).toBe('ok');
    await updateItem(db, id, { onceDate: null, days: 1 << 3 }); // make it repeat on Wednesdays instead
    expect((await items(WED))[0]).toMatchObject({ due: true, days: 1 << 3, onceDate: null });
  });
  it('rejects empty or impossible weekdays', async () => {
    expect(await addItem(db, 'agnes', chore('x', 0, { days: 0 }))).toBe('bad_request');
    expect(await addItem(db, 'agnes', chore('x', 0, { days: 200 }))).toBe('bad_request');
    await give(db, 'agnes', chore('ok'));
    expect(await updateItem(db, (await items(WED))[0]!.id, { days: 0 })).toBe('bad_request');
  });
  it('pays a bonus for each time of day on its own, counting only what is due', async () => {
    await setBonus(db, 'agnes', 'morning', 4);
    await setBonus(db, 'agnes', 'evening', 10);
    await give(db, 'agnes', chore('Teeth', 1), chore('Bins', 1, { days: 1 << 3 }), chore('Bath', 1, { period: 'evening' }));
    const [teeth, , bath] = await items(THU);
    await setCheck(db, teeth!.id, THU, true, T);
    expect((await choreState(db, THU, false)).balances.agnes).toBe(5); // 1 + the morning bonus; Wednesday-only Bins is not required
    const r = (await choreState(db, THU, false)).routines[0]!;
    expect(r.bonusEarned).toMatchObject({ morning: true, evening: false });
    await setCheck(db, bath!.id, THU, true, T);
    expect((await choreState(db, THU, false)).balances.agnes).toBe(16); // + 1 + the evening bonus
    await setCheck(db, teeth!.id, THU, false);
    expect((await choreState(db, THU, false)).balances.agnes).toBe(11); // the morning bonus and chore are withdrawn
  });
  it('sets and clears a bonus', async () => {
    await setBonus(db, 'agnes', 'morning', 4);
    await give(db, 'agnes', chore('A'));
    expect((await choreState(db, WED, false)).routines[0]!.bonuses.morning).toBe(4);
    await setBonus(db, 'agnes', 'morning', 0);
    expect((await choreState(db, WED, false)).routines[0]!.bonuses.morning).toBe(0);
  });
});

describe('household goals and hidden rewards', () => {
  let db: D1Database;
  beforeEach(async () => {
    db = createTestDb();
    await db.prepare("INSERT INTO users (id, email, role, created_at) VALUES ('u1', 'm@example.com', 'manager', 0)").run();
  });
  const goals = async () => (await choreState(db, WED, true)).goals;

  it('counts what everyone earns, ignores spending, and only counts points from after the goal began', async () => {
    await give(db, 'agnes', chore('A', 5));
    await give(db, 'margo', chore('B', 7));
    const items = (await choreState(db, WED, false)).routines.flatMap((r) => r.items);
    await adjustPoints(db, manager, 'agnes', 100, 'before', T - 1);
    await saveGoal(db, { name: 'Pizza', target: 20 }, undefined, T);
    for (const i of items) await setCheck(db, i.id, WED, true, T + 1);
    expect((await goals())[0]).toMatchObject({ name: 'Pizza', target: 20, progress: 12, claimed: false });
    await saveReward(db, { name: 'Treat', cost: 5 }, undefined, T);
    await requestRedemption(db, 'agnes', (await choreState(db, WED, true)).rewards[0]!.id, T + 2);
    await decideRedemption(db, manager, (await choreState(db, WED, true)).pending[0]!.id, true, T + 3);
    expect((await goals())[0]!.progress).toBe(12); // spending does not lower it
    const five = items.find((i) => i.points === 5)!;
    await setCheck(db, five.id, WED, false); // un-ticking takes the points back
    expect((await goals())[0]!.progress).toBe(7);
  });

  it('is claimed once, and only after the target is reached', async () => {
    await saveGoal(db, { name: 'Trip', target: 5 }, undefined, T);
    const id = (await goals())[0]!.id;
    expect(await claimGoal(db, manager, id, T)).toBe('insufficient');
    await adjustPoints(db, manager, 'agnes', 5, '', T + 1);
    expect(await claimGoal(db, manager, id, T + 2)).toBe('ok');
    expect(await claimGoal(db, manager, id, T + 3)).toBe('not_found');
    expect((await goals())[0]).toMatchObject({ claimed: true, progress: 5 });
    expect(await removeGoal(db, id)).toBe(true);
    expect(await removeGoal(db, id)).toBe(false);
  });

  it('edits and caps goals', async () => {
    await saveGoal(db, { name: 'A', target: 5 }, undefined, T);
    const id = (await goals())[0]!.id;
    expect(await saveGoal(db, { name: 'B', target: 9 }, id)).toBe('ok');
    expect((await goals())[0]).toMatchObject({ name: 'B', target: 9 });
    expect(await saveGoal(db, { name: 'B', target: 9 }, 'nope')).toBe('not_found');
    for (let i = 1; i < MAX_GOALS; i++) await saveGoal(db, { name: `G${i}`, target: 1 }, undefined, T);
    expect(await saveGoal(db, { name: 'Too many', target: 1 })).toBe('limit');
  });

  it('hides a reward from requests without deleting it', async () => {
    await adjustPoints(db, manager, 'agnes', 50, '', T);
    await saveReward(db, { name: 'Movie', cost: 10 }, undefined, T);
    const r = (await choreState(db, WED, true)).rewards[0]!;
    await saveReward(db, { name: 'Movie', cost: 10, hidden: true }, r.id);
    expect((await choreState(db, WED, true)).rewards[0]!.hidden).toBe(true);
    expect(await requestRedemption(db, 'agnes', r.id, T)).toBe('not_found');
    await saveReward(db, { name: 'Movie', cost: 10, hidden: false }, r.id);
    expect(await requestRedemption(db, 'agnes', r.id, T)).toBe('ok');
  });

  it('approves every request that can still be afforded and leaves the rest waiting', async () => {
    await adjustPoints(db, manager, 'agnes', 10, '', T);
    await adjustPoints(db, manager, 'margo', 3, '', T);
    await saveReward(db, { name: 'Cheap', cost: 3 }, undefined, T);
    await saveReward(db, { name: 'Dear', cost: 10 }, undefined, T);
    const [cheap, dear] = (await choreState(db, WED, true)).rewards;
    await requestRedemption(db, 'agnes', dear!.id, T);
    await requestRedemption(db, 'margo', cheap!.id, T + 1);
    await adjustPoints(db, manager, 'agnes', -5, 'oops', T + 2); // agnes can no longer afford hers
    await approveAffordable(db, manager, T + 3);
    expect(await balanceOf(db, 'margo')).toBe(0);
    expect(await balanceOf(db, 'agnes')).toBe(5);
    expect((await choreState(db, WED, true)).pending.map((p) => p.person)).toEqual(['agnes']);
  });
});

describe('screen time bank', () => {
  let db: D1Database;
  beforeEach(async () => {
    db = createTestDb();
    await db.prepare("INSERT INTO users (id, email, role, created_at) VALUES ('u1', 'm@example.com', 'manager', 0)").run();
  });
  const bank = async () => (await choreState(db, WED, true)).minutes;

  it('grants screen time at once, with no approval, and takes the points', async () => {
    await adjustPoints(db, manager, 'agnes', 40, '', T);
    await saveReward(db, { name: 'Screen time', cost: 20, minutes: 30 }, undefined, T);
    const r = (await choreState(db, WED, true)).rewards[0]!;
    expect(r.minutes).toBe(30);
    expect(await requestRedemption(db, 'agnes', r.id, T, WED)).toBe('ok');
    const s = await choreState(db, WED, true);
    expect(s.pending).toEqual([]);
    expect(s.minutes).toEqual({ agnes: 30 });
    expect(s.balances.agnes).toBe(20);
    expect(await requestRedemption(db, 'agnes', r.id, T + 1, WED)).toBe('ok');
    expect(await requestRedemption(db, 'agnes', r.id, T + 2, WED)).toBe('insufficient');
    expect(await bank()).toEqual({ agnes: 60 });
  });

  it('still waits for a manager when the reward has no screen time', async () => {
    await adjustPoints(db, manager, 'agnes', 40, '', T);
    await saveReward(db, { name: 'Ice cream', cost: 20 }, undefined, T);
    const r = (await choreState(db, WED, true)).rewards[0]!;
    await requestRedemption(db, 'agnes', r.id, T, WED);
    expect((await choreState(db, WED, true)).pending).toHaveLength(1);
    expect((await choreState(db, WED, true)).balances.agnes).toBe(40);
  });

  it('spends minutes without going below zero, and a manager can adjust by hand', async () => {
    await adjustMinutes(db, manager, 'agnes', 20, 'bonus', T);
    expect(await useMinutes(db, 'agnes', 15, WED, T)).toBe('ok');
    expect(await useMinutes(db, 'agnes', 15, WED, T)).toBe('insufficient');
    expect((await bank()).agnes).toBe(5);
    await adjustMinutes(db, manager, 'agnes', -60, 'grounded', T + 1); // cannot take more than there is
    expect((await bank()).agnes).toBe(0);
    const audits = await db.prepare("SELECT event FROM audit_log WHERE event LIKE 'screentime.%'").all<{ event: string }>();
    expect(audits.results).toHaveLength(2);
  });

  describe('daily allowance', () => {
    const SAT = '2026-10-10';
    const allowance = async (day = WED) => (await choreState(db, day, true)).allowance.agnes;

    it('is the same every day unless weekends are set, and is not banked', async () => {
      await setAllowance(db, manager, 'agnes', 60, null, T);
      expect(await allowance(WED)).toEqual({ weekday: 60, weekend: null, today: 60, used: 0 });
      expect(await allowance(SAT)).toMatchObject({ today: 60 });
      await setAllowance(db, manager, 'agnes', 60, 90, T);
      expect(await allowance(SAT)).toMatchObject({ weekend: 90, today: 90 });
      expect(await allowance('2026-10-11')).toMatchObject({ today: 90 }); // Sunday
      expect(await allowance(THU)).toMatchObject({ today: 60 });
      expect((await bank()).agnes).toBeUndefined(); // nothing is added to the bank
    });

    it('is spent before the bank, and a new day starts fresh', async () => {
      await setAllowance(db, manager, 'agnes', 30, null, T);
      await adjustMinutes(db, manager, 'agnes', 20, '', T);
      expect(await useMinutes(db, 'agnes', 20, WED, T)).toBe('ok'); // all from the allowance
      expect(await allowance()).toMatchObject({ used: 20 });
      expect((await bank()).agnes).toBe(20);
      expect(await useMinutes(db, 'agnes', 25, WED, T)).toBe('ok'); // 10 left of the allowance, 15 from the bank
      expect(await allowance()).toMatchObject({ used: 30 });
      expect((await bank()).agnes).toBe(5);
      expect(await useMinutes(db, 'agnes', 6, WED, T)).toBe('insufficient'); // allowance gone, only 5 banked
      expect(await allowance(THU)).toMatchObject({ used: 0 }); // fresh the next day; yesterday's leftovers never carry over
    });

    it('works without a bank, and is removed by setting zero', async () => {
      await setAllowance(db, manager, 'agnes', 15, null, T);
      expect(await useMinutes(db, 'agnes', 15, WED, T)).toBe('ok');
      expect(await useMinutes(db, 'agnes', 1, WED, T)).toBe('insufficient');
      await setAllowance(db, manager, 'agnes', 0, null, T);
      expect(await allowance()).toBeUndefined();
      expect(await useMinutes(db, 'margo', 5, WED, T)).toBe('insufficient'); // nobody gets time without an allowance or a bank
    });
  });
});

describe('skipping a chore for a day', () => {
  let db: D1Database;
  beforeEach(() => { db = createTestDb(); });
  const items = async (day = WED) => (await choreState(db, day, true)).routines.find((r) => r.person === 'agnes')!.items;

  it('skips one day only, and can be undone', async () => {
    await give(db, 'agnes', chore('Brush teeth', 1), chore('Bins', 1));
    const [teeth] = await items();
    expect(await setSkip(db, teeth!.id, WED, true, T)).toBe('ok');
    expect(await setSkip(db, teeth!.id, WED, true, T)).toBe('ok'); // harmless twice
    expect((await items(WED)).map((i) => [i.title, i.skipped])).toEqual([['Brush teeth', true], ['Bins', false]]);
    expect((await items(THU)).every((i) => !i.skipped)).toBe(true);
    expect(await setCheck(db, teeth!.id, WED, true)).toBe('not_due');
    expect(await setSkip(db, teeth!.id, WED, false)).toBe('ok');
    expect((await items(WED))[0]!.skipped).toBe(false);
    expect(await setCheck(db, teeth!.id, WED, true, T)).toBe('ok');
    expect(await setSkip(db, 'nope', WED, true)).toBe('not_found');
  });
  it('cannot skip a chore that is not scheduled', async () => {
    await give(db, 'agnes', chore('Bins', 0, { days: 1 << 3 }));
    expect(await setSkip(db, (await items())[0]!.id, THU, true)).toBe('not_due');
  });
  it('takes back points for a ticked chore that is skipped', async () => {
    await give(db, 'agnes', chore('Brush teeth', 5));
    const id = (await items())[0]!.id;
    await setCheck(db, id, WED, true, T);
    expect(await balanceOf(db, 'agnes')).toBe(5);
    await setSkip(db, id, WED, true, T);
    expect(await balanceOf(db, 'agnes')).toBe(0);
    expect((await items())[0]!.done).toBe(false);
  });
  it('pays the bonus once the remaining chores are done, and withdraws it when the skip is undone', async () => {
    await setBonus(db, 'agnes', 'morning', 10);
    await give(db, 'agnes', chore('Brush teeth', 0), chore('Bins', 0));
    const [teeth, bins] = await items();
    await setCheck(db, teeth!.id, WED, true, T);
    expect(await balanceOf(db, 'agnes')).toBe(0);
    await setSkip(db, bins!.id, WED, true, T);
    expect(await balanceOf(db, 'agnes')).toBe(10);
    await setSkip(db, bins!.id, WED, false, T);
    expect(await balanceOf(db, 'agnes')).toBe(0);
  });
  it('is gone when the chore is removed', async () => {
    await give(db, 'agnes', chore('Bins'));
    const id = (await items())[0]!.id;
    await setSkip(db, id, WED, true);
    await removeItem(db, id);
    await give(db, 'agnes', chore('Bins'));
    expect((await items())[0]!.skipped).toBe(false);
  });
});

describe('choreSuggestions', () => {
  const item = (title: string, o: Partial<ChoreItem> = {}): ChoreItem => ({ id: title, title, points: 2, done: false, period: 'morning', days: null, onceDate: null, everyWeeks: 1, weekAnchor: null, untilDone: false, keptPoints: 0, optional: false, due: true, kept: false, skipped: false, ...o });
  const routine = (person: string | null, items: ChoreItem[]): Routine => ({ id: String(person), person, bonuses: { morning: 0, afternoon: 0, evening: 0, any: 0 }, bonusEarned: { morning: false, afternoon: false, evening: false, any: false }, items });
  const routines = [routine('a', [item('Feed the dog'), item('Make bed'), item('Old trip', { onceDate: '2020-01-01' })]), routine('b', [item('Feed the Dog'), item('Dishes', { points: 5 })]), routine('c', [item('Make bed')])];

  it('offers chores from other lists once each, leaving out ones the person already has', () => {
    expect(choreSuggestions(routines, 'c', '', '2026-10-18').map((c) => c.title)).toEqual(['Dishes', 'Feed the dog']);
  });
  it('matches the query anywhere, best prefix first, and skips one-offs that have passed', () => {
    expect(choreSuggestions(routines, 'c', 'd', '2026-10-18').map((c) => c.title)).toEqual(['Dishes', 'Feed the dog']);
    expect(choreSuggestions(routines, 'c', 'trip', '2026-10-18')).toEqual([]);
  });
  it('carries the points and schedule over', () => {
    expect(choreSuggestions(routines, 'c', 'dish', '2026-10-18')).toEqual([{ title: 'Dishes', points: 5, period: 'morning', days: null, onceDate: null, everyWeeks: 1, weekAnchor: null, untilDone: false, keptPoints: 0, optional: false }]);
  });
});

describe('time of day locks', () => {
  let db: D1Database;
  beforeEach(async () => {
    db = createTestDb();
    await db.prepare("INSERT INTO users (id, email, role, created_at) VALUES ('u1', 'm@example.com', 'manager', 0)").run();
    await saveReward(db, { name: 'Screen time', cost: 3, minutes: 15 }, undefined, T);
    await saveReward(db, { name: 'Ice cream', cost: 3 }, undefined, T);
  });
  const reward = async (name: string) => (await choreState(db, WED, true)).rewards.find((r) => r.name === name)!;
  const tick = async (title: string, done = true) => {
    const i = (await choreState(db, WED, false)).routines.flatMap((r) => r.items).find((x) => x.title === title)!;
    await setCheck(db, i.id, WED, done, T + 1);
  };

  it('holds back the points of a time of day until every chore in it is done', async () => {
    await give(db, 'agnes', chore('Teeth', 3, { period: 'morning' }), chore('Bag', 2, { period: 'morning' }), chore('Reading', 5, { period: 'afternoon' }));
    await tick('Teeth');
    expect(await requestRedemption(db, 'agnes', (await reward('Screen time')).id, AM, WED)).toBe('locked');
    await tick('Bag'); // morning is finished: its 5 points are free, afternoon holds nothing yet
    expect(await requestRedemption(db, 'agnes', (await reward('Screen time')).id, AM, WED)).toBe('ok');
  });

  it('takes screen time several times over, within the points', async () => {
    await adjustPoints(db, manager, 'agnes', 10, 'gift', T);
    const id = (await reward('Screen time')).id; // 3 points for 15 minutes
    expect(await requestRedemption(db, 'agnes', id, AM, WED, 3)).toBe('ok');
    const s = await choreState(db, WED, false);
    expect(s.balances.agnes).toBe(1);
    expect(s.minutes.agnes).toBe(45);
    expect(s.recent[0]).toMatchObject({ delta: -9, note: 'Screen time ×3' });
    expect(await requestRedemption(db, 'agnes', id, AM, WED, 1)).toBe('insufficient');
    expect(await requestRedemption(db, 'agnes', (await reward('Ice cream')).id, AM, WED, 2)).toBe('not_found'); // only screen time can be taken more than once
    expect(await requestRedemption(db, 'agnes', id, AM, WED, 0)).toBe('not_found');
  });

  it('stops buying screen time at the per-child daily limit', async () => {
    await adjustPoints(db, manager, 'agnes', 30, 'gift', T);
    const id = (await reward('Screen time')).id; // 3 points for 15 minutes
    await setBuyCap(db, manager, 'agnes', 45);
    expect(await requestRedemption(db, 'agnes', id, AM, WED, 2)).toBe('ok'); // 30 minutes
    expect(await requestRedemption(db, 'agnes', id, AM, WED, 2)).toBe('daily_limit'); // 30 more would pass 45
    const s = await choreState(db, WED, false, AM);
    expect(s.buyCap.agnes).toEqual({ limit: 45, bought: 30 });
    expect(buyRoom(s, 'agnes')).toBe(15);
    expect(await requestRedemption(db, 'agnes', id, AM, WED, 1)).toBe('ok');
    expect(await requestRedemption(db, 'agnes', id, AM, WED, 1)).toBe('daily_limit');
    expect(await requestRedemption(db, 'margo', id, AM, WED, 1)).toBe('insufficient'); // no limit for margo, just no points
    await setBuyCap(db, manager, 'agnes', 0);
    expect(buyRoom((await choreState(db, WED, false, AM)), 'agnes')).toBe(Infinity);
  });

  it('gives each time of day its own lock', async () => {
    await give(db, 'agnes', chore('Teeth', 3, { period: 'morning' }), chore('Reading', 5, { period: 'afternoon' }), chore('Tidy', 1, { period: 'afternoon' }));
    await tick('Teeth');
    await tick('Reading'); // afternoon is not finished, so its 5 are held; morning's 3 are free
    const id = (await reward('Ice cream')).id;
    expect(await requestRedemption(db, 'agnes', id, PM, WED)).toBe('ok');
    expect(await requestRedemption(db, 'agnes', id, PM, WED)).toBe('locked'); // the 3 free points are spent; the 5 left are held
    await tick('Tidy');
    expect(await requestRedemption(db, 'agnes', id, PM, WED)).toBe('ok'); // afternoon is finished, so its points are free
  });

  it('opens a lock when the chore holding it is skipped, and does not hold points from earlier days', async () => {
    await give(db, 'agnes', chore('Teeth', 3, { period: 'morning' }), chore('Bag', 1, { period: 'morning' }));
    await tick('Teeth');
    const bag = (await choreState(db, WED, false)).routines[0]!.items.find((i) => i.title === 'Bag')!;
    const id = (await reward('Screen time')).id;
    expect(await requestRedemption(db, 'agnes', id, AM, WED)).toBe('locked');
    await setSkip(db, bag.id, WED, true, T + 2);
    expect(await requestRedemption(db, 'agnes', id, AM, WED)).toBe('ok');
    await adjustPoints(db, manager, 'agnes', 3, 'gift', T);
    expect(await requestRedemption(db, 'agnes', (await reward('Ice cream')).id, T, THU)).toBe('ok'); // another day: yesterday's chores hold nothing
  });

  it('is not bypassed by a hand adjustment: only chore points are held', async () => {
    await give(db, 'agnes', chore('Teeth', 2, { period: 'morning' }), chore('Bag', 1, { period: 'morning' }));
    await adjustPoints(db, manager, 'agnes', 3, 'gift', T);
    await tick('Teeth');
    expect(await requestRedemption(db, 'agnes', (await reward('Screen time')).id, T, WED)).toBe('ok'); // the 3 gifted points are free
  });
});

describe('time of day names', () => {
  it('starts with the usual names, can be renamed, and goes back when cleared', async () => {
    const db = createTestDb();
    expect((await choreState(db, WED, true)).periodLabels).toEqual({ morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', any: 'Any time' });
    expect(await setPeriodLabels(db, { morning: '  Before school ', afternoon: 'After school' })).toBe('ok');
    expect((await choreState(db, WED, false)).periodLabels).toMatchObject({ morning: 'Before school', afternoon: 'After school', evening: 'Evening' });
    await setPeriodLabels(db, { morning: '', afternoon: 'Afternoon' });
    expect((await choreState(db, WED, false)).periodLabels).toMatchObject({ morning: 'Morning', afternoon: 'Afternoon' });
    expect(await db.prepare('SELECT COUNT(*) AS n FROM period_labels').first()).toEqual({ n: 0 });
  });
  it('refuses a name that is too long or a time of day that does not exist', async () => {
    const db = createTestDb();
    expect(await setPeriodLabels(db, { morning: 'x'.repeat(25) })).toBe('bad_request');
    expect(await setPeriodLabels(db, { midnight: 'Late' } as never)).toBe('bad_request');
  });
});

describe('ticking within a time of day\'s hours', () => {
  it('lets only a manager tick or un-tick outside the hours, and lets hours be changed', async () => {
    const db = createTestDb();
    await addItem(db, 'agnes', { title: 'Brush teeth', points: 1, period: 'morning', days: null, onceDate: null } as ChoreInput, T);
    const id = (await choreState(db, WED, true)).routines[0]!.items[0]!.id;
    const eight = AM, three = at(15); // 8 AM and 3 PM
    expect(await setCheck(db, id, WED, true, three, false)).toBe('closed');
    expect(await setCheck(db, id, WED, true, eight, false)).toBe('ok');
    expect(await setCheck(db, id, WED, false, three, false)).toBe('closed');
    expect(await setCheck(db, id, WED, false, three, true)).toBe('ok');
    expect(await setPeriodHours(db, { morning: { from: 360, to: 960 } })).toBe('ok'); // 6 AM to 4 PM
    expect((await choreState(db, WED, false)).periodHours.morning).toEqual({ from: 360, to: 960 });
    expect(await setCheck(db, id, WED, true, three, false)).toBe('ok');
    expect(await setPeriodHours(db, { morning: { from: 600, to: 600 } })).toBe('bad_request');
    expect(await setPeriodHours(db, { any: { from: 0, to: 60 } } as never)).toBe('bad_request');
  });
});

describe('optional chores and celebrating', () => {
  it('finishes a list once what it needs is done, not waiting for an optional chore', () => {
    const c = (done: boolean, optional: boolean) => ({ done, optional }) as ChoreItem;
    expect(allDone([c(true, false), c(false, true)])).toBe(true);
    expect(allDone([c(false, false), c(true, true)])).toBe(false);
    expect(allDone([c(true, true)])).toBe(false); // only optional chores: nothing needed, nothing to celebrate
  });
});

describe('optional chores', () => {
  const item = (period: ChoreItem['period'], points: number, done: boolean, optional: boolean) => ({ period, points, done, optional, due: true, kept: false, skipped: false });
  it('hold nothing back when undone, and count only once ticked', () => {
    expect(lockedPoints([item('morning', 3, true, false), item('morning', 2, false, true)])).toBe(0); // the lunch box was not needed
    expect(lockedPoints([item('morning', 3, true, false), item('morning', 2, false, false)])).toBe(3);
  });
  it('is left out of the all-done bonus, and a manager can take a tick back', async () => {
    const db = createTestDb();
    await setBonus(db, 'agnes', 'morning', 3);
    await addItem(db, 'agnes', { title: 'Teeth', points: 1, period: 'morning', days: null, onceDate: null } as ChoreInput, T);
    await addItem(db, 'agnes', { title: 'Lunch box', points: 2, period: 'morning', days: null, onceDate: null, optional: true } as ChoreInput, T + 1);
    const items = async () => (await choreState(db, WED, true, AM)).routines[0]!.items;
    const [teeth, lunch] = await items();
    expect(lunch!.optional).toBe(true);
    await setCheck(db, teeth!.id, WED, true, AM);
    expect((await choreState(db, WED, true, AM)).balances.agnes).toBe(4); // 1 point + the 3 bonus, without waiting for the lunch box
    await setCheck(db, lunch!.id, WED, true, AM);
    expect((await choreState(db, WED, true, AM)).balances.agnes).toBe(6);
    await setSkip(db, lunch!.id, WED, true, AM); // no lunch box that day after all
    expect((await choreState(db, WED, true, AM)).balances.agnes).toBe(4);
    expect(await setCheck(db, lunch!.id, WED, true, AM)).toBe('not_due'); // and it cannot be ticked again
  });
});

describe('times of day have hours', () => {
  const h = 3_600_000;
  it('is before, open or closed by the clock', () => {
    expect(phaseOf(DEFAULT_HOURS.morning, 4 * h)).toBe('before');
    expect(phaseOf(DEFAULT_HOURS.morning, 5 * h)).toBe('open');
    expect(phaseOf(DEFAULT_HOURS.morning, 12 * h)).toBe('closed');
    expect(phaseOf(null, 3 * h)).toBe('open');
    expect([...closedPeriods(DEFAULT_HOURS, 13 * h)]).toEqual(['morning']);
  });
  it('says why a chore cannot be ticked outside the hours', () => {
    expect(tickBlock(DEFAULT_HOURS, 'evening', 8 * h)).toBe('Opens at 5 PM');
    expect(tickBlock(DEFAULT_HOURS, 'morning', 13 * h)).toBe('Time is up');
    expect(tickBlock(DEFAULT_HOURS, 'any', 3 * h)).toBe('');
  });
});

describe('spendable points on the client', () => {
  const item = (period: ChoreItem['period'], points: number, done: boolean, extra: Partial<ChoreItem> = {}) => ({ period, points, done, due: true, kept: false, skipped: false, optional: false, ...extra });
  it('holds the points of an unfinished time of day and nothing else', () => {
    expect(lockedPoints([item('morning', 3, true), item('morning', 1, false), item('evening', 4, true)])).toBe(3);
    expect(lockedPoints([item('morning', 3, true), item('morning', 1, false, { skipped: true })])).toBe(0);
    expect(lockedPoints([item('morning', 3, true), item('morning', 1, false, { due: false })])).toBe(0);
  });
  it('takes held points and waiting requests off the balance', () => {
    const items = [item('morning', 3, true), item('morning', 1, false)] as ChoreItem[];
    const state = { routines: [{ id: 'r', person: 'agnes', bonuses: {}, bonusEarned: {}, items }] as unknown as Routine[], balances: { agnes: 10 }, periodHours: DEFAULT_HOURS, dayMs: 8 * 3_600_000, pending: [{ id: 'p', person: 'agnes', rewardName: 'x', cost: 2, minutes: 0, requestedAt: 0 }] };
    expect(spendable(state, 'agnes')).toBe(5);
    expect(spendable(state, 'margo')).toBe(0);
    expect(spendable({ ...state, dayMs: 13 * 3_600_000 }, 'agnes')).toBe(8); // the morning is over, so it no longer holds its points
  });
  it('names the unfinished times of day that hold points', () => {
    const labels = { morning: 'Before school', afternoon: 'After school', evening: 'Evening', any: 'Any time' };
    expect(holdingLabel([item('morning', 3, true), item('morning', 1, false), item('afternoon', 0, true), item('afternoon', 1, false)], labels)).toBe('Before school');
    expect(holdingLabel([item('morning', 3, true), item('morning', 1, true)], labels)).toBe('');
  });
});

describe('reward cost calculator', () => {
  const at = (title: string, points: number, days: number | null, period: ChoreItem['period'] = 'morning') => ({ id: title, title, points, done: false, period, days, onceDate: null, everyWeeks: 1, weekAnchor: null, untilDone: false, keptPoints: 0, due: true, kept: false, skipped: false }) as ChoreItem;
  it('averages the week, counting bonuses and ignoring one-offs', () => {
    const bonuses = { morning: 7, afternoon: 0, evening: 0, any: 0 };
    const items = [at('Daily', 2, null), at('Weekdays', 5, WEEKDAYS_MASK), { ...at('Once', 50, null), onceDate: WED }];
    expect(typicalDailyPoints({ items, bonuses })).toBeCloseTo((7 * 2 + 5 * 5 + 7 * 7) / 7); // the bonus is earned on every day the time of day has chores
    expect(typicalDailyPoints(undefined)).toBe(0);
  });
  it('prices by days of effort or by minutes per point, within the allowed range', () => {
    expect(suggestedCost({ perDay: 6.4, days: 3 })).toBe(19);
    expect(suggestedCost({ minutes: 30, minutesPerPoint: 2 })).toBe(15);
    expect(suggestedCost({ perDay: 0, days: 1 })).toBe(1);
  });
});

describe('until-done chores', () => {
  let db: D1Database;
  const MON = '2026-10-05', TUE = '2026-10-06', FRI = '2026-10-09', NEXT_MON = '2026-10-12';
  const homework = chore('Math homework', 20, { days: WEEKDAYS_MASK, untilDone: true, keptPoints: 5 });
  const mine = async (day: string) => (await choreState(db, day, true, T)).routines[0]!.items[0]!;
  const bal = async () => (await choreState(db, WED, true, T)).balances.sam ?? 0;
  beforeEach(async () => { db = createTestDb(); await give(db, 'sam', homework); });

  it('finds when it was finished earlier in the same Sunday-to-Saturday week', () => {
    expect(finishedBefore([TUE], WED)).toBe(TUE);
    expect(finishedBefore([TUE], TUE)).toBeNull(); // the finish day itself is not "after"
    expect(finishedBefore([TUE], NEXT_MON)).toBeNull(); // a new week starts over
    expect(finishedBefore([], WED)).toBeNull();
  });
  it('stays on the list every day until it is ticked, and pays nothing for days that pass', async () => {
    for (const d of [MON, TUE, WED]) expect(await mine(d)).toMatchObject({ due: true, kept: false });
    expect(await bal()).toBe(0);
  });
  it('pays its points on the finish day, then the kept-up points for each remaining weekday', async () => {
    const id = (await mine(MON)).id;
    expect(await setCheck(db, id, TUE, true, T)).toBe('ok');
    expect(await mine(TUE)).toMatchObject({ done: true, kept: false });
    expect(await balanceOf(db, 'sam')).toBe(20);
    expect(await mine(WED)).toMatchObject({ kept: true, done: false });
    expect(await balanceOf(db, 'sam')).toBe(25); // Wednesday, now settled
    await choreState(db, FRI, true, T);
    expect(await balanceOf(db, 'sam')).toBe(35); // Thursday and Friday, caught up even though nobody looked on Thursday
    await choreState(db, FRI, true, T);
    expect(await balanceOf(db, 'sam')).toBe(35); // settling again pays nothing more
    expect(await choreState(db, '2026-10-10', true, T).then((s) => s.routines[0]!.items[0]!.kept)).toBe(false); // Saturday is not a scheduled day
    expect(await balanceOf(db, 'sam')).toBe(35);
  });
  it('cannot be finished twice in a week, and starts over the next week', async () => {
    const id = (await mine(MON)).id;
    await setCheck(db, id, MON, true, T);
    expect(await setCheck(db, id, TUE, true, T)).toBe('not_due');
    expect(await mine(NEXT_MON)).toMatchObject({ due: true, kept: false });
    expect(await setCheck(db, id, NEXT_MON, true, T)).toBe('ok');
  });
  it('takes back the finish and the kept-up points together when un-ticked', async () => {
    const id = (await mine(MON)).id;
    await setCheck(db, id, MON, true, T);
    await choreState(db, WED, true, T);
    expect(await balanceOf(db, 'sam')).toBe(30); // 20 + Tue + Wed
    await setCheck(db, id, MON, false, T);
    expect(await balanceOf(db, 'sam')).toBe(0);
    expect(await mine(WED)).toMatchObject({ kept: false });
  });
  it('does not pay a day a manager skipped, and does not hold back the all-done bonus', async () => {
    const id = (await mine(MON)).id;
    await setBonus(db, 'sam', 'morning', 3);
    await setCheck(db, id, MON, true, T);
    expect(await setSkip(db, id, TUE, true, T)).toBe('ok');
    await choreState(db, WED, true, T);
    expect(await balanceOf(db, 'sam')).toBe(28); // 20 + 3 bonus on Monday + Wednesday's 5; Tuesday was skipped
  });
  it('is stored only for repeating chores, with kept-up points in range', async () => {
    expect(await addItem(db, 'sam', chore('Once', 1, { onceDate: WED, untilDone: true, keptPoints: 5 }), T)).toBe('ok');
    const items = (await choreState(db, WED, true, T)).routines[0]!.items;
    expect(items.find((i) => i.title === 'Once')).toMatchObject({ untilDone: false, keptPoints: 0 });
    expect(await addItem(db, 'sam', chore('Too much', 1, { untilDone: true, keptPoints: 101 }), T)).toBe('bad_request');
    expect(await updateItem(db, items[0]!.id, { untilDone: false }, T)).toBe('ok');
    expect(await mine(WED)).toMatchObject({ untilDone: false, keptPoints: 0 });
  });
  it('ignores an un-tick on a day it was never ticked, leaving kept-up points alone', async () => {
    const id = (await mine(MON)).id;
    await setCheck(db, id, MON, true, T);
    await choreState(db, WED, true, T);
    expect(await balanceOf(db, 'sam')).toBe(30);
    await setCheck(db, id, WED, false, T); // a stale or doubled request
    expect(await balanceOf(db, 'sam')).toBe(30);
  });
  it('re-checks the bonus on later days when the finish is undone', async () => {
    const id = (await mine(MON)).id;
    await setBonus(db, 'sam', 'morning', 3);
    await setCheck(db, id, MON, true, T);
    await setCheck(db, id, TUE, false, T); // nothing was ticked Tuesday: no effect
    expect(await balanceOf(db, 'sam')).toBe(23); // 20 + Monday's bonus
    await setCheck(db, id, MON, false, T);
    expect(await balanceOf(db, 'sam')).toBe(0);
  });
  it('does not read ticks from before it became until-done as a finish', async () => {
    const plain = (await choreState(db, MON, true, T)).routines[0]!;
    await addItem(db, 'sam', chore('Dishes', 2, { days: WEEKDAYS_MASK }), T);
    const dishes = (await choreState(db, MON, true, T)).routines[0]!.items.find((i) => i.title === 'Dishes')!;
    expect(plain.items).toHaveLength(1);
    await setCheck(db, dishes.id, MON, true, T);
    await setCheck(db, dishes.id, TUE, true, T);
    const before = await balanceOf(db, 'sam');
    await updateItem(db, dishes.id, { untilDone: true, keptPoints: 5 }, Date.parse('2026-10-07T12:00:00Z')); // switched on Wednesday
    expect(await choreState(db, WED, true, T).then((st) => st.routines[0]!.items.find((i) => i.title === 'Dishes')!)).toMatchObject({ kept: false });
    expect(await balanceOf(db, 'sam')).toBe(before); // no back-pay for Tuesday or Wednesday
    expect(await setCheck(db, dishes.id, WED, true, T)).toBe('ok'); // Wednesday's tick is the finish
  });
  it('pays nothing extra on a list for Anyone', async () => {
    await addItem(db, null, chore('Plants', 0, { untilDone: true, keptPoints: 5 }), T);
    const anyone = (await choreState(db, MON, true, T)).routines.find((r) => r.person === null)!;
    expect(anyone.items[0]).toMatchObject({ untilDone: true, keptPoints: 0 });
  });
  it('counts the finish points on the first scheduled weekday and the kept-up points after', () => {
    const hw = { untilDone: true, days: WEEKDAYS_MASK, onceDate: null, points: 20, keptPoints: 5 };
    expect([0, 1, 2, 5, 6].map((d) => pointsOnWeekday(hw, d))).toEqual([20, 20, 5, 5, 5]); // Sunday is not scheduled, so Monday is the first day
    expect(pointsOnWeekday({ ...hw, untilDone: false }, 3)).toBe(20);
  });
});

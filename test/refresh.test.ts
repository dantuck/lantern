import { describe, expect, it } from 'vitest';
import { QUIET_MS, TYPING_MS, blocked, type Activity } from '../src/lib/refreshGuard';
import { choreRev, revOf } from '../src/lib/rev';
import type { ChoreState } from '../src/lib/choreTypes';

const NOW = 1_000_000_000;
const idle: Activity = { now: NOW, active: 0, typed: 0, focused: false, open: false, held: false };

describe('when an open page may refresh itself', () => {
  it('goes ahead when nothing is happening', () => {
    expect(blocked(idle)).toBe(false);
  });

  it('waits while a field has focus, a dialog or popover is open, or a component asked to hold', () => {
    expect(blocked({ ...idle, focused: true })).toBe(true);
    expect(blocked({ ...idle, open: true })).toBe(true);
    expect(blocked({ ...idle, held: true })).toBe(true);
  });

  it('waits for a quiet moment after a tap or scroll', () => {
    expect(blocked({ ...idle, active: NOW - QUIET_MS + 1 })).toBe(true);
    expect(blocked({ ...idle, active: NOW - QUIET_MS })).toBe(false);
  });

  it('leaves a recent edit alone for longer', () => {
    expect(blocked({ ...idle, typed: NOW - TYPING_MS + 1 })).toBe(true);
    expect(blocked({ ...idle, typed: NOW - TYPING_MS })).toBe(false);
  });
});

describe('page fingerprint', () => {
  const state = (now: number, done: number) => ({ day: '2026-10-18', now, done }) as unknown as ChoreState;

  it('is steady for the same data and changes with it', async () => {
    expect(await revOf({ a: 1 })).toBe(await revOf({ a: 1 }));
    expect(await revOf({ a: 1 })).not.toBe(await revOf({ a: 2 }));
  });

  it('ignores the server clock the chores state carries, but not the data around it', async () => {
    expect(await choreRev(state(1792363528937, 1), [])).toBe(await choreRev(state(1792363529988, 1), []));
    expect(await choreRev(state(1792363528937, 1), [])).not.toBe(await choreRev(state(1792363528937, 2), []));
  });

  it('changes when the people change', async () => {
    expect(await choreRev(state(1, 1), [])).not.toBe(await choreRev(state(1, 1), [{ id: 'a', name: 'A', color: '#000', match: [] }]));
  });
});

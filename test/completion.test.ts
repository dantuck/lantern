import { describe, expect, it } from 'vitest';
import { allDone, burstSize, celebrationKeys, completionTracker } from '../src/lib/completion';
import type { ChoreItem } from '../src/lib/choreTypes';

const item = (done: boolean, period: ChoreItem['period'] = 'any') => ({ done, period }) as ChoreItem;

describe('allDone', () => {
  it('needs at least one chore, all of them done', () => {
    expect(allDone([])).toBe(false);
    expect(allDone([item(true), item(false)])).toBe(false);
    expect(allDone([item(true), item(true)])).toBe(true);
  });
});

describe('completionTracker', () => {
  it('fires once when someone becomes finished', () => {
    const track = completionTracker<string>();
    expect(track([['a', false]])).toEqual([]);
    expect(track([['a', true]])).toEqual(['a']);
    expect(track([['a', true]])).toEqual([]);
  });

  it('does not fire for lists already finished at the start', () => {
    const track = completionTracker(['a']);
    expect(track([['a', true]])).toEqual([]);
  });

  it('fires again after something is un-done', () => {
    const track = completionTracker<string>();
    track([['a', true]]);
    track([['a', false]]);
    expect(track([['a', true]])).toEqual(['a']);
  });

  it('tracks people independently', () => {
    const track = completionTracker<string | null>();
    expect(track([['a', true], ['b', false], [null, true]])).toEqual(['a', null]);
    expect(track([['a', true], ['b', true], [null, true]])).toEqual(['b']);
  });
});

describe('celebrationKeys', () => {
  const bonuses = { morning: 5, afternoon: 0, evening: 0, any: 0 };

  it('always tracks the day, and only the times of day that carry a bonus', () => {
    const keys = celebrationKeys('a', [item(true, 'morning'), item(false, 'evening')], bonuses);
    expect(keys).toEqual([['a:day', false], ['a:morning', true]]);
  });

  it('a bonus period finishing before the day gives a small burst; the day gives a big one', () => {
    const track = completionTracker<string>();
    const items = [item(false, 'morning'), item(false, 'evening')];
    track(celebrationKeys('a', items, bonuses));
    const morning = track(celebrationKeys('a', [item(true, 'morning'), item(false, 'evening')], bonuses));
    expect(burstSize(morning)).toBe('small');
    const day = track(celebrationKeys('a', [item(true, 'morning'), item(true, 'evening')], bonuses));
    expect(burstSize(day)).toBe('big');
  });

  it('finishing the day and the bonus period together is one big burst', () => {
    const track = completionTracker<string>();
    track(celebrationKeys('a', [item(false, 'morning')], bonuses));
    expect(burstSize(track(celebrationKeys('a', [item(true, 'morning')], bonuses)))).toBe('big');
  });
});

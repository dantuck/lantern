import { describe, expect, it } from 'vitest';
import { layoutDay, weekStartKey } from '../src/plugins/calendar/agenda';
import type { CalEvent } from '../src/plugins/calendar/types';

const H = 3_600_000;
const DAY = 24 * H;
const t = (id: string, startH: number, endH: number): CalEvent => ({ id, title: id, allDay: false, start: startH * H, end: endH * H });

describe('weekStartKey', () => {
  it('finds the start of the week for either convention', () => {
    expect(weekStartKey('2026-10-06')).toBe('2026-10-04'); // Tuesday -> Sunday
    expect(weekStartKey('2026-10-04')).toBe('2026-10-04');
    expect(weekStartKey('2026-10-06', 1)).toBe('2026-10-05'); // Monday start
    expect(weekStartKey('2026-10-04', 1)).toBe('2026-09-28');
  });
});

describe('layoutDay', () => {
  it('gives a lone event the full width and the right position', () => {
    const [p] = layoutDay([t('a', 9, 10.5)], 0, DAY);
    expect(p).toMatchObject({ top: 540, height: 90, col: 0, cols: 1 });
  });

  it('puts overlapping events in side-by-side lanes', () => {
    const out = layoutDay([t('a', 9, 11), t('b', 10, 12)], 0, DAY);
    expect(out.map((p) => [p.ev.id, p.col, p.cols])).toEqual([['a', 0, 2], ['b', 1, 2]]);
  });

  it('reuses a lane once an event ends, and keeps separate clusters independent', () => {
    const out = layoutDay([t('a', 9, 10), t('b', 9.5, 12), t('c', 10, 11), t('d', 14, 15)], 0, DAY);
    const by = Object.fromEntries(out.map((p) => [p.ev.id, p]));
    expect([by.a!.col, by.b!.col, by.c!.col]).toEqual([0, 1, 0]);
    expect(by.a!.cols).toBe(2);
    expect(by.d).toMatchObject({ col: 0, cols: 1 });
  });

  it('clips events that cross midnight and drops ones that do not touch the day', () => {
    const overnight = t('night', 23, 26); // 11pm to 2am next day
    const day1 = layoutDay([overnight], 0, DAY);
    expect(day1[0]).toMatchObject({ top: 1380, height: 60 });
    const day2 = layoutDay([overnight, t('x', 1, 2)], DAY, 2 * DAY);
    expect(day2.map((p) => p.ev.id)).toEqual(['night']);
    expect(day2[0]).toMatchObject({ top: 0, height: 120 });
  });

  it('ignores all-day events and gives zero-length events a visible height', () => {
    const allDay: CalEvent = { id: 'ad', title: 'ad', allDay: true, startDate: '1970-01-01', endDate: '1970-01-01' };
    const out = layoutDay([allDay, t('z', 8, 8)], 0, DAY);
    expect(out).toHaveLength(1);
    expect(out[0]!.height).toBeGreaterThanOrEqual(20);
  });
});

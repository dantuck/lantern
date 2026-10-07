import { describe, expect, it } from 'vitest';
import { bannerSpans, hourSpan, isBannerEvent, isLongEvent, layoutDay, weekStartKey } from '../src/plugins/calendar/agenda';
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

describe('isLongEvent', () => {
  const HOUR = 3_600_000;
  const at = (day: number, hour: number) => Date.UTC(2026, 9, day, hour);
  const timed = (start: number, end: number): CalEvent => ({ id: 'x', title: 'x', allDay: false, start, end });
  it('is a timed event of 18+ hours that crosses midnight', () => {
    expect(isLongEvent(timed(at(9, 15), at(14, 11)), 'UTC')).toBe(true);
  });
  it('leaves overnight and long same-day events alone', () => {
    expect(isLongEvent(timed(at(9, 21), at(10, 1)), 'UTC')).toBe(false);
    expect(isLongEvent(timed(at(9, 0), at(9, 0) + 17 * HOUR), 'UTC')).toBe(false);
  });
  it('ignores all-day events', () => {
    expect(isLongEvent({ id: 'a', title: 'a', allDay: true, startDate: '2026-10-09', endDate: '2026-10-12' }, 'UTC')).toBe(false);
  });
});

describe('isBannerEvent', () => {
  it('includes all-day events that run past one day, not single days', () => {
    expect(isBannerEvent({ id: 'a', title: 'a', allDay: true, startDate: '2026-10-19', endDate: '2026-10-21' }, 'UTC')).toBe(true);
    expect(isBannerEvent({ id: 'a', title: 'a', allDay: true, startDate: '2026-10-19', endDate: '2026-10-19' }, 'UTC')).toBe(false);
  });
});

describe('bannerSpans', () => {
  const week = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'];
  const trip = (id: string, startDate: string, endDate: string): CalEvent => ({ id, title: id, allDay: true, startDate, endDate });
  const keys = (ev: CalEvent): [string, string] => (ev.allDay ? [ev.startDate, ev.endDate] : ['', '']);

  it('covers the visible columns and marks edges that carry on past the week', () => {
    const { spans } = bannerSpans([trip('a', '2026-10-02', '2026-10-05'), trip('b', '2026-10-09', '2026-10-12')], week, keys);
    expect(spans.map((s) => [s.ev.id, s.from, s.to, s.opensHere, s.closesHere])).toEqual([['a', 0, 1, false, true], ['b', 5, 6, true, false]]);
  });
  it('stacks overlapping banners into lanes and reuses a free lane', () => {
    const { spans, lanes } = bannerSpans([trip('a', '2026-10-04', '2026-10-06'), trip('b', '2026-10-05', '2026-10-07'), trip('c', '2026-10-08', '2026-10-09')], week, keys);
    expect(spans.map((s) => s.lane)).toEqual([0, 1, 0]);
    expect(lanes).toBe(2);
  });
  it('stretches across every column in the day view and ignores duplicates', () => {
    const { spans } = bannerSpans([trip('a', '2026-10-06', '2026-10-08'), trip('a', '2026-10-06', '2026-10-08')], ['2026-10-07', '2026-10-07'], keys, true);
    expect(spans.map((s) => [s.from, s.to])).toEqual([[0, 1]]);
  });
});

describe('hourSpan', () => {
  const at = (top: number, height: number) => ({ ev: t('x', 0, 1) as never, top, height, col: 0, cols: 1 });
  it('defaults to 7 AM–9 PM', () => expect(hourSpan([])).toEqual({ first: 7, count: 14 }));
  it('stretches for early and late events', () => expect(hourSpan([at(5 * 60 + 30, 60), at(22 * 60, 90)])).toEqual({ first: 5, count: 19 }));
});

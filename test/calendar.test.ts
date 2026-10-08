import { describe, expect, it, vi } from 'vitest';
import { addDays, dayKey, dayLabel, formatTime, isValidTimeZone, startOfDayMs, weekdayOf } from '../src/lib/dates';
import { groupByDay, monthGrid } from '../src/plugins/calendar/agenda';
import { getAccessToken, listEvents, normalizeEvent, parseServiceAccount, signJwt } from '../src/plugins/calendar/google';
import { parseNhlSchedule } from '../src/plugins/calendar/nhl';
import { PRESETS } from '../src/plugins/calendar/presets';
import { parseIcs } from '../src/plugins/calendar/ics';
import plugin, { configSchema } from '../src/plugins/calendar/plugin';
import { resolveFetchPolicy } from '../src/plugins/types';
import { loadPluginData } from '../src/plugins/host';
import { buildRegistry } from '../src/plugins/registry';
import type { CalEvent } from '../src/plugins/calendar/types';
import { fakeKv } from './kvshim';
import mealFixture from './fixtures/mealq-meal-plan.json';
import { mealRange } from '../src/plugins/calendar/meals';

const NY = 'America/New_York';
const ms = (iso: string) => Date.parse(iso);

describe('time zone helpers', () => {
  it('computes the local calendar day, not the UTC day', () => {
    expect(dayKey(ms('2026-10-04T02:30:00Z'), NY)).toBe('2026-10-03'); // 10:30pm EDT the day before
    expect(dayKey(ms('2026-10-04T02:30:00Z'), 'UTC')).toBe('2026-10-04');
    expect(dayKey(ms('2026-10-03T15:30:00Z'), 'Pacific/Auckland')).toBe('2026-10-04');
  });
  it('finds the start of a day across DST changes', () => {
    expect(startOfDayMs('2026-10-03', NY)).toBe(ms('2026-10-03T04:00:00Z')); // EDT, UTC-4
    expect(startOfDayMs('2026-01-15', NY)).toBe(ms('2026-01-15T05:00:00Z')); // EST, UTC-5
    expect(startOfDayMs('2026-03-08', NY)).toBe(ms('2026-03-08T05:00:00Z')); // spring-forward day starts in EST
    expect(startOfDayMs('2026-11-01', NY)).toBe(ms('2026-11-01T04:00:00Z')); // fall-back day starts in EDT
    expect(startOfDayMs('2026-10-03', 'UTC')).toBe(ms('2026-10-03T00:00:00Z'));
  });
  it('does date arithmetic across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(weekdayOf('2026-10-03')).toBe(6); // Saturday
  });
  it('validates zones and labels days', () => {
    expect(isValidTimeZone('America/Chicago')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(dayLabel('2026-10-03', '2026-10-03')).toBe('Today');
    expect(dayLabel('2026-10-04', '2026-10-03')).toBe('Tomorrow');
    expect(dayLabel('2026-10-07', '2026-10-03')).toBe('Wed, Oct 7');
    expect(formatTime(ms('2026-10-03T21:05:00Z'), NY)).toBe('5:05 PM');
  });
});

const timed = (id: string, start: string, end: string, title = id): CalEvent => ({ id, title, allDay: false, start: ms(start), end: ms(end) });
const allDay = (id: string, startDate: string, endDate: string): CalEvent => ({ id, title: id, allDay: true, startDate, endDate });

describe('groupByDay', () => {
  it('buckets by local day and orders all-day first, then by time', () => {
    const days = groupByDay([
      timed('late', '2026-10-03T22:00:00Z', '2026-10-03T23:00:00Z'),
      timed('early', '2026-10-03T13:00:00Z', '2026-10-03T14:00:00Z'),
      allDay('holiday', '2026-10-03', '2026-10-03'),
    ], NY, '2026-10-03', 3);
    expect(days.map((d) => d.key)).toEqual(['2026-10-03', '2026-10-04', '2026-10-05']);
    expect(days[0]!.events.map((e) => e.id)).toEqual(['holiday', 'early', 'late']);
    expect(days[1]!.events).toEqual([]);
  });
  it('puts a late-evening event on the local day, not the UTC day', () => {
    const [d0, d1] = groupByDay([timed('dinner', '2026-10-04T01:00:00Z', '2026-10-04T02:00:00Z')], NY, '2026-10-03', 2);
    expect(d0!.events).toHaveLength(1); // 9pm EDT on Oct 3
    expect(d1!.events).toHaveLength(0);
  });
  it('repeats multi-day events on each covered day, with inclusive all-day ends', () => {
    const days = groupByDay([allDay('trip', '2026-10-04', '2026-10-06'), timed('overnight', '2026-10-03T23:00:00Z', '2026-10-04T14:00:00Z')], NY, '2026-10-03', 5);
    expect(days.map((d) => d.events.map((e) => e.id).join(','))).toEqual(['overnight', 'trip,overnight', 'trip', 'trip', '']);
  });
  it('ignores events outside the range and treats an event ending exactly at midnight as ending the day before', () => {
    const days = groupByDay([
      allDay('past', '2026-09-01', '2026-09-02'),
      timed('endsAtMidnight', '2026-10-03T20:00:00Z', '2026-10-04T04:00:00Z'), // ends 00:00 EDT Oct 4
    ], NY, '2026-10-03', 2);
    expect(days[0]!.events.map((e) => e.id)).toEqual(['endsAtMidnight']);
    expect(days[1]!.events).toEqual([]);
  });
});

describe('monthGrid', () => {
  it('returns 6 weeks starting on the configured weekday and containing the whole month', () => {
    const g = monthGrid(2026, 10); // Oct 1 2026 is a Thursday
    expect(g).toHaveLength(42);
    expect(g[0]).toBe('2026-09-27'); // Sunday before
    expect(weekdayOf(g[0]!)).toBe(0);
    expect(g).toContain('2026-10-31');
    expect(monthGrid(2026, 10, 1)[0]).toBe('2026-09-28'); // Monday start
    expect(monthGrid(2026, 2)[0]).toBe('2026-02-01'); // Feb 1 2026 is a Sunday
  });
});

describe('google event normalisation', () => {
  it('maps timed, all-day (exclusive end), untitled and located events; drops cancelled', () => {
    expect(normalizeEvent({ id: 'a', summary: ' Dentist ', location: ' Main St ', start: { dateTime: '2026-10-05T14:00:00-04:00' }, end: { dateTime: '2026-10-05T15:00:00-04:00' } }))
      .toEqual({ id: 'a', title: 'Dentist', location: 'Main St', allDay: false, start: ms('2026-10-05T18:00:00Z'), end: ms('2026-10-05T19:00:00Z') });
    expect(normalizeEvent({ id: 'b', start: { date: '2026-10-10' }, end: { date: '2026-10-12' } }))
      .toEqual({ id: 'b', title: '(No title)', allDay: true, startDate: '2026-10-10', endDate: '2026-10-11' });
    expect(normalizeEvent({ id: 'c', status: 'cancelled', start: { date: '2026-10-10' }, end: { date: '2026-10-11' } })).toBeNull();
    expect(normalizeEvent({ summary: 'no id', start: { date: '2026-10-10' }, end: { date: '2026-10-11' } })).toBeNull();
    expect(normalizeEvent({ id: 'd', start: { dateTime: 'garbage' } })).toBeNull();
  });
  it('drops descriptions and attendees even if Google sends them', () => {
    const ev = normalizeEvent({ id: 'e', summary: 's', description: 'secret door code', attendees: [{ email: 'x@y.z' }], start: { date: '2026-10-10' }, end: { date: '2026-10-11' } } as never);
    expect(JSON.stringify(ev)).not.toContain('secret');
    expect(JSON.stringify(ev)).not.toContain('x@y.z');
  });
});

async function testServiceAccount() {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const der = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const b64 = btoa(String.fromCharCode(...der)).replace(/(.{64})/g, '$1\n');
  const sa = { client_email: 'dash@proj.iam.gserviceaccount.com', private_key: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n` };
  return { sa, publicKey: pair.publicKey };
}
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

describe('google auth', () => {
  it('signs a valid RS256 JWT with the right claims', async () => {
    const { sa, publicKey } = await testServiceAccount();
    const jwt = await signJwt(sa, 1_800_000_000_000);
    const [h, c, s] = jwt.split('.') as [string, string, string];
    expect(JSON.parse(new TextDecoder().decode(unb64url(h)))).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(new TextDecoder().decode(unb64url(c)))).toEqual({
      iss: sa.client_email, scope: 'https://www.googleapis.com/auth/calendar.readonly',
      aud: 'https://oauth2.googleapis.com/token', iat: 1_800_000_000, exp: 1_800_003_600,
    });
    expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, unb64url(s), new TextEncoder().encode(`${h}.${c}`))).toBe(true);
  });
  it('only ever requests the read-only scope', async () => {
    const { sa } = await testServiceAccount();
    const claims = JSON.parse(new TextDecoder().decode(unb64url((await signJwt(sa, 0)).split('.')[1]!)));
    expect(claims.scope).toMatch(/calendar\.readonly$/);
  });
  it('exchanges the assertion for a token and fails without leaking details', async () => {
    const { sa } = await testServiceAccount();
    const f = vi.fn(async (_u: unknown, init?: RequestInit) => {
      expect(String(init!.body)).toContain('grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer');
      return new Response(JSON.stringify({ access_token: 'tok' }));
    });
    expect(await getAccessToken(f as never, sa, 0)).toBe('tok');
    const bad = vi.fn(async () => new Response('{"error":"invalid_grant","detail":"PRIVATE"}', { status: 400 }));
    await expect(getAccessToken(bad as never, sa, 0)).rejects.toThrow(/^Google token endpoint 400$/);
  });
  it('parses the service-account secret strictly and never echoes it', () => {
    expect(() => parseServiceAccount('not json {{')).toThrow(/not valid JSON/);
    expect(() => parseServiceAccount(JSON.stringify({ client_email: 'a@b.co', private_key: 'hunter2' }))).toThrow(/missing/);
    try { parseServiceAccount('{"private_key":"SECRETKEY"'); } catch (e) { expect(String(e)).not.toContain('SECRETKEY'); }
  });
});

describe('listEvents', () => {
  it('encodes the calendar id, sends the bearer token, requests minimal fields and follows pages', async () => {
    const calls: string[] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
      const page2 = url.includes('pageToken=p2');
      return new Response(JSON.stringify({
        items: [{ id: page2 ? 'e2' : 'e1', summary: 'x', start: { date: '2026-10-10' }, end: { date: '2026-10-11' } }],
        ...(page2 ? {} : { nextPageToken: 'p2' }),
      }));
    });
    const evs = await listEvents(f as never, 'tok', 'fam+ily@group.calendar.google.com', ms('2026-10-01T00:00:00Z'), ms('2026-12-01T00:00:00Z'));
    expect(evs.map((e) => e.id)).toEqual(['e1', 'e2']);
    expect(calls[0]).toContain('/calendars/fam%2Bily%40group.calendar.google.com/events?');
    expect(calls[0]).toContain('singleEvents=true');
    expect(calls[0]).toContain('timeMin=2026-10-01T00%3A00%3A00.000Z');
    expect(decodeURIComponent(calls[0]!)).toContain('fields=nextPageToken,items(id,status,summary,location,start,end)');
    expect(calls[0]).not.toContain('description');
  });
  it('throws a generic error on API failure', async () => {
    const f = vi.fn(async () => new Response('{"error":{"message":"calendar id leaked"}}', { status: 404 }));
    await expect(listEvents(f as never, 't', 'c', 0, 1)).rejects.toThrow(/^Google Calendar API 404$/);
  });
  it('stops after a bounded number of pages', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ items: [], nextPageToken: 'more' })));
    await listEvents(f as never, 't', 'c', 0, 1);
    expect(f).toHaveBeenCalledTimes(4);
  });
});

describe('calendar plugin', () => {
  it('validates config and applies defaults', () => {
    expect(configSchema.parse({})).toEqual({ timeZone: 'UTC', locale: 'en-US', daysAhead: 60, feeds: [] });
    expect(() => configSchema.parse({ timeZone: 'Nowhere/Land' })).toThrow();
    expect(() => configSchema.parse({ daysAhead: 500 })).toThrow();
  });
  it('declares a least-privilege network policy and only its own secrets', () => {
    expect(resolveFetchPolicy(plugin, configSchema.parse({})).hosts).toEqual(['oauth2.googleapis.com', 'www.googleapis.com']);
    expect(plugin.secrets).toEqual(['GOOGLE_SERVICE_ACCOUNT_JSON', 'GOOGLE_CALENDAR_ID']);
  });
  it('runs end to end through the host with mocked Google, and cannot reach any other host', async () => {
    const { sa } = await testServiceAccount();
    const seen: string[] = [];
    const google = vi.fn(async (url: string) => {
      seen.push(new URL(url).host);
      if (url.startsWith('https://oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'tok' }));
      return new Response(JSON.stringify({ items: [{ id: 'e1', summary: 'Soccer', start: { dateTime: '2026-10-05T22:00:00Z' }, end: { dateTime: '2026-10-05T23:00:00Z' } }] }));
    });
    const kv = fakeKv();
    const enabled = buildRegistry({ './calendar/plugin.ts': plugin }, { title: 't', plugins: [{ id: 'calendar', config: { timeZone: NY } }] }).enabled[0]!;
    const now = ms('2026-10-03T16:00:00Z');
    const r = await loadPluginData(enabled, { env: { GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(sa), GOOGLE_CALENDAR_ID: 'cal@group.calendar.google.com' }, kv, now, fetchImpl: google as never });
    expect(r).toMatchObject({ status: 'ok', data: { events: [{ title: 'Soccer' }], windowStart: ms('2026-10-01T04:00:00Z') } });
    expect(seen).toEqual(['oauth2.googleapis.com', 'www.googleapis.com']);
  });
});

describe('ics feeds', () => {
  const ics = [
    'BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:g1', 'DTSTART:20261010T230000Z', 'DTEND:20261011T020000Z',
    'SUMMARY:Red Wings at Bruins', 'LOCATION:TD Garden\\, Boston', 'DESCRIPTION:secret', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:g2', 'DTSTART;TZID=America/Detroit:20261012T190000', 'SUMMARY:Bruins at Red', '  Wings', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:h1', 'DTSTART;VALUE=DATE:20261010', 'DTEND;VALUE=DATE:20261012', 'SUMMARY:Trip', 'END:VEVENT',
    'BEGIN:VEVENT', 'UID:x', 'STATUS:CANCELLED', 'DTSTART:20261013T000000Z', 'SUMMARY:Gone', 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  it('parses UTC, TZID, all-day, folded lines and escapes; drops cancelled and descriptions', () => {
    const evs = parseIcs(ics, 'f0', NY);
    expect(evs).toEqual([
      { id: 'f0:g1', title: 'Red Wings at Bruins', location: 'TD Garden, Boston', allDay: false, start: ms('2026-10-10T23:00:00Z'), end: ms('2026-10-11T02:00:00Z') },
      { id: 'f0:g2', title: 'Bruins at Red Wings', allDay: false, start: ms('2026-10-12T23:00:00Z'), end: ms('2026-10-12T23:00:00Z') },
      { id: 'f0:h1', title: 'Trip', allDay: true, startDate: '2026-10-10', endDate: '2026-10-11' },
    ]);
    expect(JSON.stringify(evs)).not.toContain('secret');
  });
  it('accepts webcal:// and limits the host allowlist to the feed hosts', () => {
    const cfg = configSchema.parse({ timeZone: NY, feeds: [{ name: 'Wings', url: 'webcal://example.com/wings.ics', color: '#ce1126' }] });
    expect(resolveFetchPolicy(plugin, cfg).hosts).toContain('example.com');
    expect(() => configSchema.parse({ feeds: [{ name: 'x', url: 'http://example.com/a.ics' }] })).toThrow();
  });
});

describe('nhl feed and presets', () => {
  const game = (id: number, away: string, home: string, extra = {}) => ({
    id, gameType: 2, startTimeUTC: '2026-10-02T22:30:00Z', venue: { default: 'Little Caesars Arena' },
    awayTeam: { abbrev: away, commonName: { default: away } }, homeTeam: { abbrev: home, commonName: { default: home } }, ...extra,
  });
  it('maps games to events from the chosen team\'s point of view, skipping cancelled and malformed ones', () => {
    const evs = parseNhlSchedule({ games: [
      game(1, 'NYR', 'DET'), game(2, 'DET', 'BOS', { gameType: 1 }), game(3, 'DET', 'TOR', { gameScheduleState: 'CNCL' }), { id: 4 },
    ] }, 'f0', 'DET');
    expect(evs.map((e) => e.title)).toEqual(['DET vs NYR', 'DET at BOS (Preseason)']);
    expect(evs[0]).toEqual({ id: 'f0:1', title: 'DET vs NYR', location: 'Little Caesars Arena', allDay: false, start: ms('2026-10-02T22:30:00Z'), end: ms('2026-10-03T01:30:00Z') });
    expect(() => parseNhlSchedule({}, 'f0', 'DET')).toThrow();
  });
  it('resolves presets and nhl feeds in config and allows only the NHL host for them', () => {
    const cfg = configSchema.parse({ feeds: [{ preset: 'nhl-det' }, { nhl: 'BOS', name: 'Bruins', color: '#fcb514' }, { preset: 'nhl-det', name: 'Wings', color: '#000000' }] });
    expect(cfg.feeds[0]).toEqual({ name: 'Red Wings', color: '#ce1126', source: { kind: 'nhl', team: 'DET' } });
    expect(cfg.feeds[2]).toMatchObject({ name: 'Wings', color: '#000000' });
    expect(resolveFetchPolicy(plugin, cfg).hosts).toContain('api-web.nhle.com');
    expect(() => configSchema.parse({ feeds: [{ preset: 'nope' }] })).toThrow(/unknown preset/);
    expect(() => configSchema.parse({ feeds: [{ nhl: 'detroit', name: 'x' }] })).toThrow();
  });
  it('has 32 NHL presets with valid colours', () => {
    const nhl = Object.entries(PRESETS).filter(([id]) => id.startsWith('nhl-'));
    expect(nhl).toHaveLength(32);
    for (const [, p] of Object.entries(PRESETS)) expect(p.color).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('calendar meals', () => {
  const MEALQ = 'api.mealq.example';
  const now = ms('2026-10-03T16:00:00Z');
  const withMeals = { timeZone: NY, meals: { apiHost: MEALQ } };

  it('is off by default and defaults to dinner when on', () => {
    expect(configSchema.parse({}).meals).toBeUndefined();
    expect(configSchema.parse(withMeals).meals).toEqual({ apiHost: MEALQ, slots: ['dinner'] });
    expect(configSchema.parse({ meals: { apiHost: MEALQ, slots: ['lunch', 'dinner'] } }).meals!.slots).toEqual(['lunch', 'dinner']);
    expect(() => configSchema.parse({ meals: { apiHost: 'https://x.com/path' } })).toThrow();
    expect(() => configSchema.parse({ meals: { apiHost: MEALQ, slots: ['brunch'] } })).toThrow();
  });
  it('borrows the MealQ plugin\'s host when meals has none of its own', async () => {
    const mealq = (await import('../src/plugins/mealq/plugin')).default;
    const modules = { './calendar/plugin.ts': plugin, './mealq/plugin.ts': mealq };
    const cfg = (calendar: object) => ({ title: 't', plugins: [{ id: 'calendar', config: calendar }, { id: 'mealq', config: { apiHost: MEALQ } }] });
    const cal = buildRegistry(modules, cfg({ timeZone: NY, meals: {} })).enabled[0]!;
    expect(cal.fetchPolicy.hosts).toContain(MEALQ);
    // An explicit host wins, and no MealQ entry means there is nothing to borrow.
    expect(buildRegistry(modules, cfg({ timeZone: NY, meals: { apiHost: 'other.example' } })).enabled[0]!.fetchPolicy.hosts).toContain('other.example');
    expect(() => buildRegistry({ './calendar/plugin.ts': plugin }, { title: 't', plugins: [{ id: 'calendar', config: { timeZone: NY, meals: {} } }] })).toThrow(/apiHost/);
  });
  it('allows the MealQ host only when meals are configured', () => {
    expect(resolveFetchPolicy(plugin, configSchema.parse({})).hosts).not.toContain(MEALQ);
    expect(resolveFetchPolicy(plugin, configSchema.parse(withMeals)).hosts).toContain(MEALQ);
    expect(plugin.optionalSecrets).toEqual(['MEALQ_API_TOKEN']);
  });
  it('asks for a week back to about three weeks ahead, within one MealQ request and the calendar window', () => {
    // Window is the 1st of the month to 60 days out; today is Oct 3, so a week back is clipped to the 1st.
    expect(mealRange(now, ms('2026-10-01T04:00:00Z'), now + 60 * 86_400_000, NY)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    const late = ms('2026-10-20T16:00:00Z');
    expect(mealRange(late, ms('2026-10-01T04:00:00Z'), late + 60 * 86_400_000, NY)).toEqual({ from: '2026-10-13', to: '2026-11-12' });
    expect(mealRange(late, ms('2026-10-01T04:00:00Z'), late + 7 * 86_400_000, NY).to).toBe('2026-10-27'); // never past the window
  });

  async function run(env: Record<string, string>, config: unknown, mealFetch: (url: string) => Response) {
    const { sa } = await testServiceAccount();
    const seen: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      seen.push(url);
      const host = new URL(url).host;
      if (host === 'oauth2.googleapis.com') return new Response(JSON.stringify({ access_token: 'tok' }));
      if (host === 'www.googleapis.com') return new Response(JSON.stringify({ items: [{ id: 'e1', summary: 'Soccer', start: { dateTime: '2026-10-05T22:00:00Z' }, end: { dateTime: '2026-10-05T23:00:00Z' } }] }));
      return mealFetch(url);
    });
    const enabled = buildRegistry({ './calendar/plugin.ts': plugin }, { title: 't', plugins: [{ id: 'calendar', config }] }).enabled[0]!;
    const r = await loadPluginData(enabled, { env: { GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(sa), GOOGLE_CALENDAR_ID: 'c@x', ...env }, kv: fakeKv(), now, fetchImpl: fetchImpl as never });
    return { r, seen, fetchImpl };
  }

  it('adds the meal plan, keeping only days that have meals, using the shared token', async () => {
    const { r, seen, fetchImpl } = await run({ MEALQ_API_TOKEN: 'secret' }, withMeals, () => new Response(JSON.stringify(mealFixture)));
    expect(r).toMatchObject({ status: 'ok', data: { events: [{ title: 'Soccer' }] } });
    const data = (r as { data: { meals: { date: string; meals: { title: string }[] }[] } }).data;
    expect(data.meals.map((d) => d.date)).toEqual(['2026-10-03', '2026-10-04', '2026-10-06']); // Oct 5 and 7 are empty
    expect(data.meals[0]!.meals.map((m) => m.title)).toEqual(['Oatmeal with berries', 'Leftover pasta', 'Chicken tacos']);
    const mealCall = fetchImpl.mock.calls.find(([u]) => new URL(u).host === MEALQ)!;
    expect(seen.find((u) => u.includes(MEALQ))).toContain('/v1/meal-plan?from=2026-10-01&to=2026-10-31');
    expect(((mealCall as unknown as [string, RequestInit])[1].headers as Headers).get('authorization')).toBe('Bearer secret');
  });
  it('still shows the calendar when the token is missing, without calling MealQ', async () => {
    const { r, seen } = await run({}, withMeals, () => new Response('{}'));
    expect(r).toMatchObject({ status: 'ok', data: { events: [{ title: 'Soccer' }] } });
    expect((r as { data: object }).data).not.toHaveProperty('meals');
    expect(seen.some((u) => u.includes(MEALQ))).toBe(false);
  });
  it('still shows the calendar when MealQ fails or answers with the wrong shape', async () => {
    for (const bad of [() => new Response('nope', { status: 500 }), () => new Response(JSON.stringify({ days: 'x' }))]) {
      const { r } = await run({ MEALQ_API_TOKEN: 'secret' }, withMeals, bad);
      expect(r).toMatchObject({ status: 'ok', data: { events: [{ title: 'Soccer' }] } });
      expect((r as { data: object }).data).not.toHaveProperty('meals');
    }
  });
  it('never calls MealQ when meals are not configured, even with the token set', async () => {
    const { seen } = await run({ MEALQ_API_TOKEN: 'secret' }, { timeZone: NY }, () => new Response('{}'));
    expect(seen.some((u) => u.includes(MEALQ))).toBe(false);
  });
});

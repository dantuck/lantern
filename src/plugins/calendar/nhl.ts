import { z } from 'zod';
import { clip } from './events';
import type { CalEvent } from './types';

/** The NHL's public, key-less schedule API. */
export const NHL_HOST = 'api-web.nhle.com';
/** NHL games have no end time in the API; three hours covers a typical game. */
const GAME_MS = 3 * 3_600_000;

const name = z.object({ default: z.string() });
const team = z.object({ abbrev: z.string(), commonName: name });
const gameSchema = z.object({
  id: z.number(),
  gameType: z.number(),
  gameScheduleState: z.string().optional(),
  startTimeUTC: z.string(),
  venue: name.optional(),
  awayTeam: team,
  homeTeam: team,
});
const scheduleSchema = z.object({ games: z.array(z.unknown()) });

/** Maps the NHL season-schedule response for `abbrev` to events. Games that don't parse are skipped, not fatal. */
export function parseNhlSchedule(json: unknown, idPrefix: string, abbrev: string): CalEvent[] {
  const top = scheduleSchema.safeParse(json);
  if (!top.success) throw new Error('NHL schedule response had no games');
  const events: CalEvent[] = [];
  for (const raw of top.data.games) {
    const parsed = gameSchema.safeParse(raw);
    if (!parsed.success) continue;
    const g = parsed.data;
    // Postponed games come back with a new date once rescheduled; cancelled ones are dropped.
    if (g.gameScheduleState === 'CNCL') continue;
    const start = Date.parse(g.startTimeUTC);
    if (Number.isNaN(start)) continue;
    const home = g.homeTeam.abbrev === abbrev;
    const us = home ? g.homeTeam : g.awayTeam;
    const them = home ? g.awayTeam : g.homeTeam;
    const tag = g.gameType === 1 ? ' (Preseason)' : g.gameType === 3 ? ' (Playoffs)' : '';
    events.push({
      id: `${idPrefix}:${g.id}`,
      title: clip(`${us.commonName.default} ${home ? 'vs' : 'at'} ${them.commonName.default}${tag}`, 200),
      ...(g.venue ? { location: clip(g.venue.default, 120) } : {}),
      allDay: false, start, end: start + GAME_MS,
    });
  }
  return events;
}

export async function fetchNhl(fetchFn: typeof fetch, abbrev: string, idPrefix: string): Promise<CalEvent[]> {
  const res = await fetchFn(`https://${NHL_HOST}/v1/club-schedule-season/${abbrev}/now`);
  if (!res.ok) throw new Error(`NHL schedule ${res.status}`);
  return parseNhlSchedule(await res.json(), idPrefix, abbrev);
}

import { feedUrl, fetchFeed } from './ics';
import { NHL_HOST, fetchNhl } from './nhl';
import type { CalEvent } from './types';

/** Where an extra calendar's events come from. Add a kind here, in `sourceHost` and in `fetchSource`. */
export type FeedSource = { kind: 'ics'; url: string } | { kind: 'nhl'; team: string };

/** The one host this source needs, for the plugin's outbound allowlist. */
export const sourceHost = (s: FeedSource): string => (s.kind === 'nhl' ? NHL_HOST : feedUrl(s.url).hostname);

export const fetchSource = (fetchFn: typeof fetch, s: FeedSource, idPrefix: string, zone: string): Promise<CalEvent[]> =>
  s.kind === 'nhl' ? fetchNhl(fetchFn, s.team, idPrefix) : fetchFeed(fetchFn, s.url, idPrefix, zone);

import type { FeedSource } from './feeds';

/** A known calendar a household can subscribe to by id, e.g. `feeds: [{ preset: 'nhl-det' }]`. Add more here. */
export interface FeedPreset { name: string; color: string; source: FeedSource }

const nhl = (team: string, name: string, color: string): [string, FeedPreset] =>
  [`nhl-${team.toLowerCase()}`, { name, color, source: { kind: 'nhl', team } }];

export const PRESETS: Readonly<Record<string, FeedPreset>> = Object.fromEntries([
  ['us-holidays', { name: 'US Holidays', color: '#2f9e44', source: { kind: 'ics', url: 'https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics' } }],
  nhl('ANA', 'Ducks', '#f47a38'), nhl('BOS', 'Bruins', '#fcb514'), nhl('BUF', 'Sabres', '#003087'),
  nhl('CGY', 'Flames', '#d2001c'), nhl('CAR', 'Hurricanes', '#cc0000'), nhl('CHI', 'Blackhawks', '#cf0a2c'),
  nhl('COL', 'Avalanche', '#6f263d'), nhl('CBJ', 'Blue Jackets', '#002654'), nhl('DAL', 'Stars', '#006847'),
  nhl('DET', 'Red Wings', '#ce1126'), nhl('EDM', 'Oilers', '#fc4c02'), nhl('FLA', 'Panthers', '#c8102e'),
  nhl('LAK', 'Kings', '#a2aaad'), nhl('MIN', 'Wild', '#154734'), nhl('MTL', 'Canadiens', '#af1e2d'),
  nhl('NSH', 'Predators', '#ffb81c'), nhl('NJD', 'Devils', '#ce1126'), nhl('NYI', 'Islanders', '#00539b'),
  nhl('NYR', 'Rangers', '#0038a8'), nhl('OTT', 'Senators', '#c52032'), nhl('PHI', 'Flyers', '#f74902'),
  nhl('PIT', 'Penguins', '#fcb514'), nhl('SJS', 'Sharks', '#006d75'), nhl('SEA', 'Kraken', '#99d9d9'),
  nhl('STL', 'Blues', '#002f87'), nhl('TBL', 'Lightning', '#002868'), nhl('TOR', 'Maple Leafs', '#00205b'),
  nhl('UTA', 'Mammoth', '#6cace4'), nhl('VAN', 'Canucks', '#00205b'), nhl('VGK', 'Golden Knights', '#b4975a'),
  nhl('WSH', 'Capitals', '#c8102e'), nhl('WPG', 'Jets', '#041e42'),
]);

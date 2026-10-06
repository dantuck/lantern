import dashboardConfig from '../../dashboard.config';
import { isValidTimeZone } from './dates';
import { parsePeople } from './peopleConfig';

/** The household's people, validated once at startup. */
export const people = parsePeople((dashboardConfig as { people?: unknown }).people);

/** The household's time zone: `timeZone` in dashboard.config, else the calendar's, else UTC. */
export const householdZone: string = (() => {
  const top = (dashboardConfig as { timeZone?: string }).timeZone;
  const cal = (dashboardConfig.plugins.find((p) => p.id === 'calendar')?.config as { timeZone?: string } | undefined)?.timeZone;
  const zone = top ?? cal ?? 'UTC';
  if (!isValidTimeZone(zone)) throw new Error(`dashboard.config: "${zone}" is not an IANA time zone`);
  return zone;
})();

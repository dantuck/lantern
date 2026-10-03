import { z } from 'zod';
import { isValidTimeZone } from '../lib/dates';

/** Settings shared by plugins that show dates. Spread into a plugin's configSchema: z.object({ ...zoneLocaleShape, ... }). */
export const zoneLocaleShape = {
  timeZone: z.string().refine(isValidTimeZone, 'must be an IANA time zone, e.g. America/Chicago').default('UTC'),
  locale: z.string().min(2).max(20).default('en-US'),
};

import { z } from 'zod';
import { isValidTimeZone } from '../lib/dates';

/** Settings shared by plugins that show dates. Spread into a plugin's configSchema: z.object({ ...zoneLocaleShape, ... }). */
export const zoneLocaleShape = {
  timeZone: z.string().refine(isValidTimeZone, 'must be an IANA time zone, e.g. America/Chicago').default('UTC'),
  locale: z.string().min(2).max(20).default('en-US'),
};

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

/** A bare hostname (no scheme, port or path), for settings that become a plugin's allowed network host. */
export const hostnameField = z.string().trim().toLowerCase().regex(HOST, 'must be a bare hostname such as api.example.com');

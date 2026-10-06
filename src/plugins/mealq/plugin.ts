import { z } from 'zod';
import { addDays, dayKey } from '../../lib/dates';
import { zoneLocaleShape } from '../fields';
import { definePlugin } from '../types';
import { fetchMealPlan, type MealPlanData } from './client';

/**
 * Read-only view of a household's MealQ meal plan. Needs the read endpoint and scoped token described in
 * docs/mealq-api-contract.md, then `wrangler secret put MEALQ_API_TOKEN`. The token identifies the household.
 */
const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export const configSchema = z.object({
  /** Bare hostname of the MealQ API (no scheme, port or path). It becomes this plugin's only allowed network host. */
  apiHost: z.string().trim().toLowerCase().regex(HOST, 'must be a bare hostname such as api.example.com'),
  ...zoneLocaleShape,
  daysAhead: z.number().int().min(1).max(14).default(7),
});
export type MealQConfig = z.infer<typeof configSchema>;

export default definePlugin({
  id: 'mealq',
  name: 'Meal plan',
  icon: '/icons/mealq.png',
  configSchema,
  secrets: ['MEALQ_API_TOKEN'],
  // Derived from validated config, then checked again by the registry: one exact host, GET only.
  fetchPolicy: (config) => ({ hosts: [config.apiHost] }),
  cacheTtlSeconds: 900,
  async loader({ config, secrets, fetch, now }): Promise<MealPlanData> {
    const from = dayKey(now, config.timeZone);
    return fetchMealPlan(fetch, {
      apiHost: config.apiHost,
      token: secrets.MEALQ_API_TOKEN!,
      from,
      to: addDays(from, config.daysAhead - 1),
    });
  },
});

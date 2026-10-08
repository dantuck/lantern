import { addDays, dayKey } from '../../lib/dates';
import { MAX_SPAN_DAYS, fetchMealPlan, type MealDay } from '../mealq/client';

/** Meals are optional, so a slow MealQ must never hold the calendar up. */
const MEALS_TIMEOUT_MS = 3000;
/** Days before today to keep, so the week view can look back a little. */
export const LOOKBACK_DAYS = 7;

/** The days to ask MealQ for: a week back from today, as far ahead as one request and the calendar window allow. */
export function mealRange(now: number, windowStart: number, windowEnd: number, zone: string): { from: string; to: string } {
  const weekAgo = addDays(dayKey(now, zone), -LOOKBACK_DAYS), first = dayKey(windowStart, zone), last = dayKey(windowEnd, zone);
  const from = weekAgo > first ? weekAgo : first;
  const limit = addDays(from, MAX_SPAN_DAYS - 1);
  return { from, to: limit < last ? limit : last };
}

/** Days that have at least one meal. The calendar shows nothing for the rest. */
export async function fetchMeals(
  fetchFn: typeof fetch,
  req: { apiHost: string; token: string; now: number; windowStart: number; windowEnd: number; zone: string },
): Promise<MealDay[]> {
  const { from, to } = mealRange(req.now, req.windowStart, req.windowEnd, req.zone);
  if (to < from) return [];
  const timed: typeof fetch = (input, init) => fetchFn(input, { ...init, signal: AbortSignal.any([AbortSignal.timeout(MEALS_TIMEOUT_MS), ...(init?.signal ? [init.signal] : [])]) });
  const plan = await fetchMealPlan(timed, { apiHost: req.apiHost, token: req.token, from, to });
  return plan.days.filter((d) => d.meals.length > 0);
}

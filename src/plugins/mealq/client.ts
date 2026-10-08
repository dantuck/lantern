import { z } from 'zod';
import { addDays } from '../../lib/dates';
import { SLOTS, type Slot } from './slots';

export interface Meal {
  id: string; slot: Slot; title: string; note?: string;
  description?: string; ingredients?: string[]; instructions?: string[]; prepMinutes?: number; recipeUrl?: string;
}
export interface MealDay { date: string; meals: Meal[] }
export interface MealPlanData { from: string; to: string; days: MealDay[] }

/** MealQ answers at most this many days per request. */
export const MAX_SPAN_DAYS = 31;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// The response comes from another system, so it is validated strictly and unknown fields are dropped.
const mealSchema = z.object({
  id: z.string().min(1).max(64),
  slot: z.string().transform((s): Slot => ((SLOTS as readonly string[]).includes(s) ? (s as Slot) : 'other')),
  title: z.string().trim().min(1).max(200),
  note: z.string().trim().max(300).optional(),
  description: z.string().trim().max(600).optional(),
  ingredients: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  instructions: z.array(z.string().trim().min(1).max(600)).max(30).optional(),
  prepMinutes: z.number().int().min(1).max(1440).optional(),
  // https only: this becomes a link, so a javascript: or http: URL must never get through.
  recipeUrl: z.string().trim().max(500).refine((u) => URL.canParse(u) && new URL(u).protocol === 'https:', 'must be an https URL').optional(),
});
const responseSchema = z.object({
  days: z.array(z.object({ date: z.string().regex(DATE), meals: z.array(mealSchema).max(20) })).max(MAX_SPAN_DAYS),
});

const slotRank = (s: Slot) => SLOTS.indexOf(s);

export interface MealPlanRequest { apiHost: string; token: string; from: string; to: string }

export async function fetchMealPlan(fetchFn: typeof fetch, req: MealPlanRequest): Promise<MealPlanData> {
  const url = `https://${req.apiHost}/v1/meal-plan?${new URLSearchParams({ from: req.from, to: req.to })}`;
  const res = await fetchFn(url, { headers: { Authorization: `Bearer ${req.token}`, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`MealQ API ${res.status}`); // status only; the body is never logged or shown
  const parsed = responseSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) throw new Error('MealQ response did not match the contract (docs/mealq-api-contract.md)');

  // One entry per requested day, so the widget can show "nothing planned"; out-of-range days are ignored.
  const byDate = new Map<string, Meal[]>();
  for (const d of parsed.data.days) {
    if (d.date < req.from || d.date > req.to) continue;
    const meals = d.meals.map((m): Meal => ({ id: m.id, slot: m.slot, title: m.title, ...(m.note ? { note: m.note } : {}),
      ...(m.description ? { description: m.description } : {}),
      ...(m.instructions?.length ? { instructions: m.instructions } : {}),
      ...(m.ingredients?.length ? { ingredients: m.ingredients } : {}),
      ...(m.prepMinutes ? { prepMinutes: m.prepMinutes } : {}),
      ...(m.recipeUrl ? { recipeUrl: m.recipeUrl } : {}),
    }));
    byDate.set(d.date, [...(byDate.get(d.date) ?? []), ...meals]);
  }
  const days: MealDay[] = [];
  for (let key = req.from; key <= req.to; key = addDays(key, 1)) {
    const meals = (byDate.get(key) ?? []).sort((a, b) => slotRank(a.slot) - slotRank(b.slot));
    days.push({ date: key, meals });
  }
  return { from: req.from, to: req.to, days };
}

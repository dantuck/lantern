/** Meal slots and their labels. Kept free of zod so the calendar's browser code can import it. */
export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack', 'other'] as const;
export type Slot = (typeof SLOTS)[number];
export const SLOT_LABEL: Record<Slot, string> = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack', other: 'Other' };
/** One colour per slot, shared by the meal plan widget (uno.config.ts) and the calendar. */
export const SLOT_COLOR: Record<Slot, string> = { breakfast: '#e0a100', lunch: '#3f9d5a', dinner: 'var(--accent)', snack: '#7a6fd0', other: 'var(--muted)' };

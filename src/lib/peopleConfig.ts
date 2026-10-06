import { z } from 'zod';
import { FAMILY, type Person } from './people';

/** Warm, distinct colours handed out in order to people who don't pick their own. */
export const PALETTE = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#d6336c', '#0ca678', '#f08c00', '#4263eb'] as const;

export const personSchema = z.object({
  name: z.string().trim().min(1).max(30),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must look like #e8590c').optional(),
  match: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
});
export const peopleSchema = z.array(personSchema).max(12);

export const slug = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'person';

/** Validates the `people` setting from dashboard.config.ts. Throws a readable error on mistakes. */
export function parsePeople(raw: unknown): Person[] {
  const parsed = peopleSchema.safeParse(raw ?? []);
  if (!parsed.success) {
    throw new Error(`invalid "people" in dashboard.config: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  const seen = new Set<string>();
  return parsed.data.map((p, i) => {
    const id = slug(p.name);
    if (seen.has(id) || id === FAMILY.id) throw new Error(`invalid "people" in dashboard.config: "${p.name}" is used twice (or is reserved)`);
    seen.add(id);
    return { id, name: p.name, color: p.color ?? PALETTE[i % PALETTE.length]!, match: p.match?.length ? p.match : [p.name] };
  });
}

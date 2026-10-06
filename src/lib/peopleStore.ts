import { z } from 'zod';
import { audit, type User } from './auth/users';
import { configPeople } from './household';
import { personSchema, slug } from './peopleConfig';
import { FAMILY, type Person } from './people';

export const MAX_PEOPLE = 12;

interface Row { id: string; name: string; color: string; match: string }

const matchWords = (raw: string, fallback: string): string[] => {
  try {
    const v: unknown = JSON.parse(raw);
    if (Array.isArray(v)) { const w = v.filter((x): x is string => typeof x === 'string' && x !== ''); if (w.length) return w; }
  } catch { /* fall through to the name */ }
  return [fallback];
};
const toPerson = (r: Row): Person => ({ id: r.id, name: r.name, color: r.color, match: matchWords(r.match, r.name) });

/**
 * The household's people: the ones a manager added on the Admin page, or, while there are none, the `people` from
 * dashboard.config.ts. Fails open to the config if the table cannot be read (for example before the migration has run).
 */
export async function loadPeople(db: D1Database): Promise<Person[]> {
  try {
    const { results } = await db.prepare('SELECT id, name, color, match FROM people ORDER BY created_at, id').all<Row>();
    if (results.length > 0) return results.map(toPerson);
  } catch (e) {
    console.error('people: could not read people:', e instanceof Error ? e.message : 'unknown');
  }
  return configPeople;
}

const insert = (db: D1Database, p: Person, at: number) =>
  db.prepare('INSERT INTO people (id, name, color, match, created_at) VALUES (?, ?, ?, ?, ?)').bind(p.id, p.name, p.color, JSON.stringify(p.match), at);

/** The first edit moves the people from dashboard.config.ts into the database, so adding one never makes the others vanish. */
async function adopt(db: D1Database, now: number): Promise<void> {
  const { results } = await db.prepare('SELECT id FROM people LIMIT 1').all();
  if (results.length === 0 && configPeople.length > 0) await db.batch(configPeople.map((p, i) => insert(db, p, now + i)));
}

const input = personSchema.extend({ color: z.string().regex(/^#[0-9a-fA-F]{6}$/) });
export type PersonInput = z.input<typeof input>;
export type PersonResult = 'ok' | 'bad_request' | 'not_found' | 'duplicate' | 'limit';

/** Adds a person, or with `id` edits one. The id (a slug of the first name) never changes, so lists and points stay attached. */
export async function savePerson(db: D1Database, manager: User, raw: PersonInput, id?: string, now = Date.now()): Promise<PersonResult> {
  const parsed = input.safeParse(raw);
  if (!parsed.success) return 'bad_request';
  const { name, color } = parsed.data;
  const match = parsed.data.match?.length ? parsed.data.match : [name];
  await adopt(db, now);
  const current = await loadPeople(db);
  const clash = (p: Person) => p.name.toLowerCase() === name.toLowerCase();
  if (id !== undefined) {
    if (!current.some((p) => p.id === id)) return 'not_found';
    if (current.some((p) => p.id !== id && clash(p))) return 'duplicate';
    await db.prepare('UPDATE people SET name = ?, color = ?, match = ? WHERE id = ?').bind(name, color, JSON.stringify(match), id).run();
    await audit(db, manager.id, 'person.updated', { id }, now);
    return 'ok';
  }
  if (current.length >= MAX_PEOPLE) return 'limit';
  const newId = slug(name);
  if (newId === FAMILY.id || current.some((p) => p.id === newId || clash(p))) return 'duplicate';
  await insert(db, { id: newId, name, color, match }, now).run();
  await audit(db, manager.id, 'person.created', { id: newId }, now);
  return 'ok';
}

/**
 * Removes a person. Their chore lists stay and show under "Anyone". Refused for the last person while dashboard.config.ts
 * still lists people, because an empty table falls back to the config and they would reappear.
 */
export async function removePerson(db: D1Database, manager: User, id: string, now = Date.now()): Promise<'ok' | 'not_found' | 'last_person'> {
  await adopt(db, now);
  const current = await loadPeople(db);
  if (!current.some((p) => p.id === id)) return 'not_found';
  if (current.length === 1 && configPeople.length > 0) return 'last_person';
  await db.prepare('DELETE FROM people WHERE id = ?').bind(id).run();
  await audit(db, manager.id, 'person.removed', { id }, now);
  return 'ok';
}

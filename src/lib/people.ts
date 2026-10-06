// Browser-safe: the calendar view imports this, so it must stay free of zod and other server-side code (see peopleConfig.ts).
/** A household member with a colour. Calendar events, chores and filters all use this one list. */
export interface Person {
  id: string;
  name: string;
  /** CSS colour: a #rrggbb value, or a var() for the built-in "Family" entry. */
  color: string;
  /** Words that put an event on this person's calendar when they appear in its title (case-insensitive). */
  match: string[];
}

/** Events that name nobody. Only shown when people are configured. */
export const FAMILY: Person = { id: 'family', name: 'Family', color: 'var(--accent)', match: [] };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whole-word, case-insensitive match, so "Bob" finds "Bob’s practice" but not "Bobsled". */
function mentions(title: string, term: string): boolean {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(term)}(?![\\p{L}\\p{N}])`, 'iu').test(title);
}

/** The people an event belongs to, judged by its title. Empty when it names nobody. */
export const peopleOf = (title: string, people: readonly Person[]): Person[] =>
  people.filter((p) => p.match.some((term) => mentions(title, term)));

// A short fingerprint of the data a page was built from, so an open page can tell whether the server has anything new without
// comparing markup. A page passes it to <Base rev={...}> (see scripts/refresh.ts).
import { sha256Hex } from './auth/crypto';
import type { ChoreState } from './choreTypes';
import type { Person } from './people';

export async function revOf(data: unknown): Promise<string> {
  return (await sha256Hex(JSON.stringify(data))).slice(0, 12);
}

/** The chores pages' fingerprint. The state carries the server's clock (`now`) so devices can correct their own; it changes on every render and is left out. */
export const choreRev = (state: ChoreState, people: Person[]): Promise<string> => revOf([{ ...state, now: undefined }, people]);

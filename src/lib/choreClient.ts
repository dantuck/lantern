// Browser-safe: talks to /api/chores. Used by the chores board and the manager page.
import type { ChoreState } from './choreTypes';
import { applyDemo } from './choreDemo';

const MESSAGES: Record<string, string> = {
  limit: 'That is the most the dashboard keeps. Remove something first.',
  insufficient: 'Not enough points for that yet.',
  not_eligible: 'That reward is not available to them.',
  not_due: 'That is not on the schedule today.',
  not_found: 'That no longer exists. Reload the page.',
  forbidden: 'Only a manager can do that.',
};

export type Sent = { ok: true; state: ChoreState } | { ok: false; error: string };

/** Sends one action and returns the fresh state, or a message fit to show the person. */
export async function postChores(payload: Record<string, unknown>): Promise<Sent> {
  try {
    const res = await fetch('/api/chores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (res.ok) return { ok: true, state: (await res.json()) as ChoreState };
    const code = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? '';
    return { ok: false, error: MESSAGES[code] ?? 'That did not save. Try again.' };
  } catch {
    return { ok: false, error: 'Could not reach the dashboard. Check your connection.' };
  }
}

/** Runs an action against the server, or, in the demo, against a copy of the page's own state (nothing is saved). */
export async function runChores(state: ChoreState, payload: Record<string, unknown>, demo: boolean): Promise<Sent> {
  return demo ? { ok: true, state: applyDemo(state, payload) } : postChores(payload);
}

/** What an input's `change` event holds: its number (0 when empty or not a number), or its trimmed text. */
export const num = (e: Event): number => Number((e.currentTarget as HTMLInputElement).value) || 0;
export const text = (e: Event): string => (e.currentTarget as HTMLInputElement).value.trim();

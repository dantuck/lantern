import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from './d1shim';
import { resolveLoginUser } from '../src/lib/auth/users';
import { INBOX_MAX, addInbox, listInbox, markSeen, seenAt, unreadCount } from '../src/lib/inbox';
import { notifyManagers } from '../src/lib/managerNotify';
import { requiredRole } from '../src/lib/http';

const T0 = 1_700_000_000_000;
let db: D1Database;
const entry = (headline: string) => ({ kind: 'rewards' as const, headline, detail: 'x', path: '/inbox' });

beforeEach(() => { db = createTestDb(); });

describe('manager inbox', () => {
  it('lists newest first and counts what a manager has not opened', async () => {
    const m = (await resolveLoginUser(db, 'mom@example.com', { bootstrapEmail: 'mom@example.com', now: T0 }))!;
    await addInbox(db, entry('first'), T0 + 1);
    await addInbox(db, entry('second'), T0 + 2);
    expect((await listInbox(db)).map((e) => e.headline)).toEqual(['second', 'first']);
    expect(await unreadCount(db, m.id)).toBe(2);
    await markSeen(db, m.id, T0 + 2);
    expect(await unreadCount(db, m.id)).toBe(0);
    await addInbox(db, entry('third'), T0 + 3);
    expect(await unreadCount(db, m.id)).toBe(1);
    await markSeen(db, m.id, T0 + 1); // an older time never moves "seen" backwards
    expect(await seenAt(db, m.id)).toBe(T0 + 2);
  });

  it('forgets old entries and caps the feed', async () => {
    await addInbox(db, entry('old'), T0);
    await addInbox(db, entry('new'), T0 + 15 * 24 * 60 * 60 * 1000);
    expect((await listInbox(db)).map((e) => e.headline)).toEqual(['new']);
    for (let i = 0; i < INBOX_MAX + 5; i++) await addInbox(db, entry(`n${i}`), T0 + 16 * 24 * 60 * 60 * 1000 + i);
    expect(await listInbox(db)).toHaveLength(INBOX_MAX);
  });

  it('records activity with no email or push set up at all', async () => {
    await notifyManagers(db, { mailer: null, origin: null, keys: null }, entry('Sam asked for a reward'));
    expect((await listInbox(db)).map((e) => e.headline)).toEqual(['Sam asked for a reward']);
  });

  it('is a manager page', () => {
    expect(requiredRole('/inbox')).toBe('manager');
  });
});

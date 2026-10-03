import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from './d1shim';
import { createInvite, resolveLoginUser, updateUser, listUsers, revokeInvite, listPendingInvites } from '../src/lib/auth/users';
import { consumeLoginToken, issueLoginToken } from '../src/lib/auth/loginTokens';
import { createSession, validateSession, revokeSession, revokeAllForUser, listSessions } from '../src/lib/auth/sessions';
import { DAY, INVITE_TTL, LOGIN_TOKEN_TTL, SESSION_ABSOLUTE_TTL, SESSION_IDLE_TTL } from '../src/lib/auth/policy';

let db: D1Database;
const T0 = 1_700_000_000_000;
const BOOT = { bootstrapEmail: 'mom@example.com', now: T0 };

beforeEach(() => { db = createTestDb(); });

async function manager() {
  const u = await resolveLoginUser(db, 'Mom@Example.com', BOOT);
  if (!u) throw new Error('bootstrap failed');
  return u;
}

describe('user resolution', () => {
  it('bootstraps the first manager only for the configured email, only once', async () => {
    expect(await resolveLoginUser(db, 'stranger@example.com', BOOT)).toBeNull();
    const m = await manager();
    expect(m.role).toBe('manager');
    expect((await listUsers(db)).length).toBe(1);
    // Table non-empty now: bootstrap email cannot mint a second user row, and unknown emails stay rejected.
    expect(await resolveLoginUser(db, 'stranger@example.com', BOOT)).toBeNull();
  });
  it('creates a member from a valid invite and consumes it', async () => {
    const m = await manager();
    expect(await createInvite(db, m, 'Kid@example.com', 'member', T0)).toEqual({ ok: true, email: 'kid@example.com' });
    const kid = await resolveLoginUser(db, 'kid@example.com', { now: T0 + 1000 });
    expect(kid?.role).toBe('member');
    expect(await listPendingInvites(db, T0 + 1000)).toHaveLength(0);
  });
  it('rejects expired and revoked invites', async () => {
    const m = await manager();
    await createInvite(db, m, 'late@example.com', 'member', T0);
    expect(await resolveLoginUser(db, 'late@example.com', { now: T0 + INVITE_TTL + 1 })).toBeNull();
    await createInvite(db, m, 'gone@example.com', 'member', T0);
    const [inv] = (await listPendingInvites(db, T0)).filter((i) => i.email === 'gone@example.com');
    await revokeInvite(db, m, inv!.id, T0 + 5);
    expect(await resolveLoginUser(db, 'gone@example.com', { now: T0 + 10 })).toBeNull();
  });
  it('only managers can invite', async () => {
    const m = await manager();
    await createInvite(db, m, 'kid@example.com', 'member', T0);
    const kid = (await resolveLoginUser(db, 'kid@example.com', { now: T0 }))!;
    expect(await createInvite(db, kid, 'friend@example.com')).toEqual({ ok: false, error: 'forbidden' });
  });
  it('protects the last manager and revokes sessions of disabled users', async () => {
    const m = await manager();
    expect(await updateUser(db, m, m.id, { role: 'member' }, T0)).toEqual({ ok: false, error: 'last_manager' });
    expect(await updateUser(db, m, m.id, { disabled: true }, T0)).toEqual({ ok: false, error: 'last_manager' });
    await createInvite(db, m, 'kid@example.com', 'member', T0);
    const kid = (await resolveLoginUser(db, 'kid@example.com', { now: T0 }))!;
    const { id } = await createSession(db, kid.id, 'x', T0);
    expect(await updateUser(db, m, kid.id, { disabled: true }, T0 + 1)).toEqual({ ok: true });
    expect(await validateSession(db, id, T0 + 2)).toBeNull();
  });
});

describe('login tokens', () => {
  it('is single use', async () => {
    const m = await manager();
    const { token, nonce } = await issueLoginToken(db, m.id, T0);
    expect(await consumeLoginToken(db, token, nonce, T0 + 1000)).toBe(m.id);
    expect(await consumeLoginToken(db, token, nonce, T0 + 2000)).toBeNull();
  });
  it('expires after 10 minutes', async () => {
    const m = await manager();
    const { token, nonce } = await issueLoginToken(db, m.id, T0);
    expect(await consumeLoginToken(db, token, nonce, T0 + LOGIN_TOKEN_TTL)).toBeNull();
  });
  it('fails on another browser (wrong nonce) without burning the token', async () => {
    const m = await manager();
    const { token, nonce } = await issueLoginToken(db, m.id, T0);
    expect(await consumeLoginToken(db, token, 'f'.repeat(64), T0 + 1000)).toBeNull();
    expect(await consumeLoginToken(db, token, nonce, T0 + 2000)).toBe(m.id);
  });
  it('fails for disabled users and unknown tokens', async () => {
    const m = await manager();
    await createInvite(db, m, 'kid@example.com', 'member', T0);
    const kid = (await resolveLoginUser(db, 'kid@example.com', { now: T0 }))!;
    const { token, nonce } = await issueLoginToken(db, kid.id, T0);
    await updateUser(db, m, kid.id, { disabled: true }, T0 + 1);
    expect(await consumeLoginToken(db, token, nonce, T0 + 2)).toBeNull();
    expect(await consumeLoginToken(db, 'nope', nonce, T0)).toBeNull();
  });
});

describe('sessions', () => {
  it('validates, and stores only a hash of the id', async () => {
    const m = await manager();
    const { id } = await createSession(db, m.id, 'Chrome on macOS', T0);
    const v = await validateSession(db, id, T0 + 1000);
    expect(v?.user.id).toBe(m.id);
    const row = await db.prepare('SELECT id_hash FROM sessions').first<{ id_hash: string }>();
    expect(row!.id_hash).not.toBe(id);
  });
  it('slides on activity but is capped at 90 days, then dies', async () => {
    const m = await manager();
    const { id } = await createSession(db, m.id, 'x', T0);
    let now = T0;
    for (let i = 0; i < 3; i++) { now += 25 * DAY; expect(await validateSession(db, id, now)).not.toBeNull(); }
    // Activity kept sliding to day 75; the absolute cap still kills it at day 90.
    expect(await validateSession(db, id, T0 + SESSION_ABSOLUTE_TTL)).toBeNull();
  });
  it('expires when idle for 30 days', async () => {
    const m = await manager();
    const { id } = await createSession(db, m.id, 'x', T0);
    expect(await validateSession(db, id, T0 + SESSION_IDLE_TTL)).toBeNull();
  });
  it('lets members revoke only their own devices; managers anyone', async () => {
    const m = await manager();
    await createInvite(db, m, 'kid@example.com', 'member', T0);
    const kid = (await resolveLoginUser(db, 'kid@example.com', { now: T0 }))!;
    const mine = await createSession(db, m.id, 'm', T0);
    const kids = await createSession(db, kid.id, 'k', T0);
    const [mHash] = (await listSessions(db, m.id, T0)).map((s) => s.id_hash);
    const [kHash] = (await listSessions(db, kid.id, T0)).map((s) => s.id_hash);
    expect(await revokeSession(db, kid, mHash!, T0 + 1)).toBe(false);
    expect(await validateSession(db, mine.id, T0 + 2)).not.toBeNull();
    expect(await revokeSession(db, m, kHash!, T0 + 3)).toBe(true);
    expect(await validateSession(db, kids.id, T0 + 4)).toBeNull();
  });
  it('revokeAllForUser keeps the current device when asked', async () => {
    const m = await manager();
    const a = await createSession(db, m.id, 'a', T0);
    const b = await createSession(db, m.id, 'b', T0);
    const keep = (await validateSession(db, a.id, T0 + 1))!.session.idHash;
    await revokeAllForUser(db, m.id, keep, T0 + 2);
    expect(await validateSession(db, a.id, T0 + 3)).not.toBeNull();
    expect(await validateSession(db, b.id, T0 + 3)).toBeNull();
  });
});

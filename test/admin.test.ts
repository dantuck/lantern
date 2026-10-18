import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from './d1shim';
import { audit, createInvite, resolveLoginUser } from '../src/lib/auth/users';
import { createSession, revokeSession } from '../src/lib/auth/sessions';
import { listAllSessions, listAudit } from '../src/lib/auth/admin';
import { SESSION_IDLE_TTL } from '../src/lib/auth/policy';
import { inviteEmail } from '../src/lib/mailer';
import { canonicalPath, requiredRole } from '../src/lib/http';

const T0 = 1_700_000_000_000;
let db: D1Database;
beforeEach(() => { db = createTestDb(); });

describe('admin queries', () => {
  it('lists audit newest-first with actor email', async () => {
    const m = (await resolveLoginUser(db, 'mom@example.com', { bootstrapEmail: 'mom@example.com', now: T0 }))!;
    await createInvite(db, m, 'kid@example.com', 'member', T0 + 10);
    await audit(db, null, 'system.test', { a: 1 }, T0 + 20);
    const log = await listAudit(db, 10);
    expect(log.map((e) => e.event)).toEqual(['system.test', 'invite.created', 'user.bootstrapped']);
    expect(log[0]!.actorEmail).toBeNull();
    expect(log[1]!.actorEmail).toBe('mom@example.com');
    expect(log[0]!.detail).toBe('{"a":1}');
    expect(await listAudit(db, 1)).toHaveLength(1);
  });

  it('lists only live sessions of active users', async () => {
    const m = (await resolveLoginUser(db, 'mom@example.com', { bootstrapEmail: 'mom@example.com', now: T0 }))!;
    const live = await createSession(db, m.id, 'live', T0);
    const dead = await createSession(db, m.id, 'revoked', T0);
    await createSession(db, m.id, 'expired', T0 - SESSION_IDLE_TTL - 1);
    const all = await listAllSessions(db, T0 + 1);
    expect(all.map((d) => d.deviceLabel).sort()).toEqual(['live', 'revoked']);
    const row = all.find((d) => d.deviceLabel === 'revoked')!;
    await revokeSession(db, m, row.idHash, T0 + 2);
    expect((await listAllSessions(db, T0 + 3)).map((d) => d.deviceLabel)).toEqual(['live']);
    void live; void dead;
  });
});

describe('role guard and invite mail', () => {
  it('guards /admin and its children only', () => {
    expect(requiredRole('/admin')).toBe('manager');
    expect(requiredRole('/admin/action')).toBe('manager');
    expect(requiredRole('/administrator')).toBeNull();
    expect(requiredRole('/devices')).toBeNull();
    // The router decodes the path, so the middleware gates on the canonical form.
    for (const p of ['/%61dmin', '/admin/%61ction', '/chores/%6danage', '/%2561dmin']) expect(requiredRole(canonicalPath(p)), p).toBe('manager');
    expect(canonicalPath('/devices')).toBe('/devices');
    expect(canonicalPath('/%E0%A4%A')).toBe('/%E0%A4%A'); // undecodable: kept as is
  });
  it('invite mail has no token and escapes the inviter', () => {
    const m = inviteEmail('<b>x</b>@example.com', 'https://fam.example/login');
    expect(m.text).not.toContain('token');
    expect(m.html).not.toContain('<b>');
  });
  it('a member invite carries the join link in both parts and still escapes the inviter', () => {
    const join = 'https://fam.example/auth/invite#token=abc';
    const m = inviteEmail('<b>x</b>@example.com', 'https://fam.example/login', join);
    expect(m.text).toContain(join);
    expect(m.html).toContain(join);
    expect(m.text).toContain('https://fam.example/login');
    expect(m.html).not.toContain('<b>');
  });
});

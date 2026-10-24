import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from './d1shim';
import { createInvite, resolveLoginUser, updateUser, type User } from '../src/lib/auth/users';
import { createSession, revokeAllForUser, validateSession } from '../src/lib/auth/sessions';
import { approveElevation, endElevation, findRequest, pendingRequest, requestElevation } from '../src/lib/auth/elevation';
import { ELEVATION_REQUEST_TTL, MINUTE } from '../src/lib/auth/policy';
import { isAdmin, isManager, managerActor } from '../src/lib/http';
import { listAudit } from '../src/lib/auth/admin';

const T0 = 1_700_000_000_000;
let db: D1Database;
let mom: User;
let kid: User;
let tablet: { id: string };
let tabletHash: string;

beforeEach(async () => {
  db = createTestDb();
  mom = (await resolveLoginUser(db, 'mom@example.com', { bootstrapEmail: 'mom@example.com', now: T0 }))!;
  await createInvite(db, mom, 'kid@example.com', 'member', T0);
  kid = (await resolveLoginUser(db, 'kid@example.com', { now: T0 }))!;
  tablet = await createSession(db, kid.id, 'Safari on iOS', T0);
  tabletHash = (await validateSession(db, tablet.id, T0))!.session.idHash;
});

const ask = async (now = T0) => (await requestElevation(db, kid, tabletHash, now))!;

describe('elevating a member device', () => {
  it('starts out locked', async () => {
    const v = (await validateSession(db, tablet.id, T0))!;
    expect(v.elevation).toBeNull();
    expect(isManager(v)).toBe(false);
  });

  it('a manager approves the code and the device becomes a manager device, for a while', async () => {
    const { code } = await ask();
    expect(code).toMatch(/^\d{6}$/);
    expect(await findRequest(db, code, T0 + 1)).toEqual({ deviceLabel: 'Safari on iOS', email: 'kid@example.com' });
    expect(await approveElevation(db, mom, code, 10, T0 + 1000)).toMatchObject({ email: 'kid@example.com' });

    const v = (await validateSession(db, tablet.id, T0 + 2000))!;
    expect(v.user.id).toBe(kid.id); // still the member
    expect(v.elevation?.by.id).toBe(mom.id);
    const locals = { user: v.user, elevation: v.elevation };
    expect(isManager(locals)).toBe(true);
    expect(isAdmin(locals)).toBe(false); // admin pages stay closed
    expect(managerActor(locals)?.id).toBe(mom.id);

    expect((await validateSession(db, tablet.id, T0 + 1000 + 10 * MINUTE))!.elevation).toBeNull();
  });

  it('a code works once, and a pending request is reused until it lapses', async () => {
    const a = await ask();
    expect(await ask(T0 + 5)).toEqual(a);
    expect(await approveElevation(db, mom, a.code, 10, T0 + 10)).not.toBeNull();
    expect(await approveElevation(db, mom, a.code, 10, T0 + 11)).toBeNull();
    const stale = await requestElevation(db, kid, (await createSessionHash('old', T0)), T0);
    expect(await approveElevation(db, mom, stale!.code, 10, T0 + ELEVATION_REQUEST_TTL + 1)).toBeNull();
    expect(await pendingRequest(db, tabletHash, T0 + ELEVATION_REQUEST_TTL + 1)).toBeNull();
  });

  it('only a manager can approve, only for an allowed duration, and a manager device never asks', async () => {
    const { code } = await ask();
    expect(await approveElevation(db, kid, code, 10, T0 + 1)).toBeNull();
    expect(await approveElevation(db, mom, code, 600, T0 + 1)).toBeNull();
    expect(await approveElevation(db, mom, '12', 10, T0 + 1)).toBeNull();
    expect(await requestElevation(db, mom, 'whatever', T0)).toBeNull();
    expect((await validateSession(db, tablet.id, T0 + 2))!.elevation).toBeNull();
  });

  it('ends when locked, signed out, or when the approving manager stops being a manager', async () => {
    const lockedAt = async () => { const { code } = await ask(T0); await approveElevation(db, mom, code, 60, T0 + 1); };

    await lockedAt();
    await endElevation(db, kid, tabletHash, T0 + 5);
    expect((await validateSession(db, tablet.id, T0 + 6))!.elevation).toBeNull();

    await lockedAt();
    const dad = (await createInvite(db, mom, 'dad@example.com', 'manager', T0), (await resolveLoginUser(db, 'dad@example.com', { now: T0 }))!);
    expect((await validateSession(db, tablet.id, T0 + 7))!.elevation?.by.id).toBe(mom.id);
    await updateUser(db, dad, mom.id, { role: 'member' }, T0 + 8);
    expect((await validateSession(db, tablet.id, T0 + 9))!.elevation).toBeNull();
    await updateUser(db, dad, mom.id, { role: 'manager' }, T0 + 10);

    await revokeAllForUser(db, kid.id, undefined, T0 + 11);
    expect(await validateSession(db, tablet.id, T0 + 12)).toBeNull();
  });

  it('a manager session is never itself reported as elevated, and the approval is audited', async () => {
    const { code } = await ask();
    await approveElevation(db, mom, code, 30, T0 + 1);
    const log = await listAudit(db, 5);
    expect(log[0]).toMatchObject({ event: 'elevation.approved', actorEmail: 'mom@example.com' });
    expect(JSON.parse(log[0]!.detail!)).toMatchObject({ minutes: 30, device: 'Safari on iOS' });
    const m = await createSession(db, mom.id, 'mom phone', T0);
    expect((await validateSession(db, m.id, T0 + 2))!.elevation).toBeNull();
  });
});

async function createSessionHash(label: string, now: number) {
  const s = await createSession(db, kid.id, label, now);
  return (await validateSession(db, s.id, now))!.session.idHash;
}

import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from './d1shim';
import { resolveLoginUser, updateUser, type User } from '../src/lib/auth/users';
import { notifyManagers, notifyPrefsFor, setNotify, type Activity, type Channels } from '../src/lib/managerNotify';
import { activityEmail, type Mail, type Mailer } from '../src/lib/mailer';
import { managerSubscribed, removeManagerSubscription, saveManagerSubscription, sendManagerTest, type PushKeys } from '../src/lib/push';
import { b64uEncode } from '../src/lib/base64url';

const T0 = 1_700_000_000_000;
let db: D1Database;
const sent: Mail[] = [];
const mailer: Mailer = { send: async (m) => { sent.push(m); } };
const act = (kind: 'rewards' | 'timers'): Activity => ({ kind, headline: 'Sam asked for a reward', detail: 'x', path: '/chores/manage' });
const ENDPOINT = (n: number) => `https://fcm.googleapis.com/fcm/send/dev${n}`;

beforeEach(() => { db = createTestDb(); sent.length = 0; });

async function managers(): Promise<{ a: User; b: User }> {
  const a = (await resolveLoginUser(db, 'mom@example.com', { bootstrapEmail: 'mom@example.com', now: T0 }))!;
  await db.prepare("INSERT INTO invites (id, email, role, invited_by, expires_at) VALUES ('i1', 'dad@example.com', 'manager', ?, ?)").bind(a.id, T0 + 1e9).run();
  const b = (await resolveLoginUser(db, 'dad@example.com', { bootstrapEmail: undefined, now: T0 + 1 }))!;
  return { a, b };
}

/** A real browser-shaped subscription, since the Worker encrypts to it. */
async function device(n: number) {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { endpoint: ENDPOINT(n), p256dh: b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), auth: b64uEncode(crypto.getRandomValues(new Uint8Array(16))) };
}
async function vapid(): Promise<PushKeys> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return { publicKey: b64uEncode(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))), privateKey: (await crypto.subtle.exportKey('jwk', pair.privateKey)).d!, subject: 'https://fam.example' };
}
const pushes: string[] = [];
const fakeSend = (async (url: string) => { pushes.push(url); return new Response(null, { status: url.endsWith('gone') ? 410 : 201 }); }) as unknown as typeof fetch;

describe('manager notification settings', () => {
  it('start with everything off, and are kept per manager', async () => {
    const { a, b } = await managers();
    expect(Object.values(await notifyPrefsFor(db, a.id))).toEqual([false, false, false, false]);
    await setNotify(db, a.id, 'timers', 'push', true);
    await setNotify(db, a.id, 'rewards', 'email', true);
    await setNotify(db, a.id, 'rewards', 'email', false);
    expect(await notifyPrefsFor(db, a.id)).toEqual({ rewards_email: false, rewards_push: false, timers_email: false, timers_push: true });
    expect(await notifyPrefsFor(db, b.id)).toMatchObject({ timers_push: false });
  });
});

describe('manager activity email', () => {
  const via = (): Channels => ({ mailer, origin: 'https://fam.example', keys: null });
  it('sends nothing until a manager opts in', async () => {
    await managers();
    expect(await notifyManagers(db, via(), act('rewards'))).toBe(0);
  });
  it('goes only to managers who chose that kind by email, never the actor, and links to the site', async () => {
    const { a, b } = await managers();
    await setNotify(db, a.id, 'rewards', 'email', true);
    await setNotify(db, b.id, 'timers', 'email', true);
    await setNotify(db, b.id, 'rewards', 'push', true); // a different channel: no email
    expect(await notifyManagers(db, via(), act('rewards'))).toBe(1);
    expect(sent.map((m) => m.to)).toEqual(['mom@example.com']);
    expect(sent[0]!.text).toContain('https://fam.example/chores/manage');
    expect(await notifyManagers(db, via(), act('rewards'), a.id)).toBe(0);
  });
  it('skips a manager demoted to member, and survives a failing or missing mailer', async () => {
    const { a, b } = await managers();
    await setNotify(db, b.id, 'rewards', 'email', true);
    await updateUser(db, a, b.id, { role: 'member' });
    expect(await notifyManagers(db, via(), act('rewards'))).toBe(0);
    await setNotify(db, a.id, 'rewards', 'email', true);
    expect(await notifyManagers(db, { ...via(), mailer: null }, act('rewards'))).toBe(0);
    expect(await notifyManagers(db, { ...via(), mailer: { send: async () => { throw new Error('down'); } } }, act('rewards'))).toBe(0);
  });
  it('escapes the text in the email', () => {
    const m = activityEmail('<b>Sam</b>', '<i>x</i>', 'https://fam.example/');
    expect(m.html).not.toContain('<b>');
    expect(m.html).not.toContain('<i>');
  });
});

describe('manager push notifications', () => {
  it('store a device per manager, refuse bad input, and can be removed', async () => {
    const { a, b } = await managers();
    const d = await device(1);
    expect(await saveManagerSubscription(db, a.id, d, T0)).toBe('ok');
    expect(await saveManagerSubscription(db, a.id, d, T0 + 1)).toBe('ok'); // again: no duplicate
    expect(await saveManagerSubscription(db, a.id, { ...d, endpoint: 'https://evil.example/x' })).toBe('bad_request');
    expect(await managerSubscribed(db, d.endpoint, a.id)).toBe(true);
    expect(await managerSubscribed(db, d.endpoint, b.id)).toBe(false);
    await removeManagerSubscription(db, d.endpoint, a.id);
    expect(await managerSubscribed(db, d.endpoint, a.id)).toBe(false);
  });
  it('go to the devices of managers who chose push for that kind, and not to the actor', async () => {
    const { a, b } = await managers();
    const keys = await vapid();
    await saveManagerSubscription(db, a.id, await device(1));
    await saveManagerSubscription(db, a.id, await device(2));
    await saveManagerSubscription(db, b.id, await device(3));
    await setNotify(db, a.id, 'timers', 'push', true);
    await setNotify(db, b.id, 'rewards', 'push', true); // not timers
    pushes.length = 0;
    expect(await notifyManagers(db, { mailer: null, origin: null, keys }, act('timers'), undefined, fakeSend)).toBe(2);
    expect(pushes.sort()).toEqual([ENDPOINT(1), ENDPOINT(2)]);
    pushes.length = 0;
    expect(await notifyManagers(db, { mailer: null, origin: null, keys }, act('timers'), a.id, fakeSend)).toBe(0);
    expect(pushes).toEqual([]);
  });
  it('are skipped without keys, and a gone device is forgotten', async () => {
    const { a } = await managers();
    const keys = await vapid();
    const gone = { ...(await device(4)), endpoint: 'https://fcm.googleapis.com/fcm/send/gone' };
    await saveManagerSubscription(db, a.id, gone);
    await setNotify(db, a.id, 'timers', 'push', true);
    expect(await notifyManagers(db, { mailer: null, origin: null, keys: null }, act('timers'), undefined, fakeSend)).toBe(0);
    expect(await managerSubscribed(db, gone.endpoint, a.id)).toBe(true);
    await notifyManagers(db, { mailer: null, origin: null, keys }, act('timers'), undefined, fakeSend);
    expect(await managerSubscribed(db, gone.endpoint, a.id)).toBe(false);
  });
});

describe('manager test notification', () => {
  it('goes only to a device the manager allowed, and a gone device is forgotten', async () => {
    const { a, b } = await managers();
    const keys = await vapid();
    const mine = await device(5);
    await saveManagerSubscription(db, a.id, mine);
    pushes.length = 0;
    expect(await sendManagerTest(db, keys, mine.endpoint, a.id, fakeSend)).toBe(201);
    expect(pushes).toEqual([mine.endpoint]);
    expect(await sendManagerTest(db, keys, mine.endpoint, b.id, fakeSend)).toBeNull(); // someone else's device
    expect(pushes).toHaveLength(1);
    const gone = { ...(await device(6)), endpoint: 'https://fcm.googleapis.com/fcm/send/gone' };
    await saveManagerSubscription(db, a.id, gone);
    expect(await sendManagerTest(db, keys, gone.endpoint, a.id, fakeSend)).toBe(410);
    expect(await managerSubscribed(db, gone.endpoint, a.id)).toBe(false);
  });
});

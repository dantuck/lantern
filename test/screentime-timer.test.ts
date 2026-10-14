import { beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from './d1shim';
import { choreState } from '../src/lib/chores';
import { adjustMinutes, setAllowance } from '../src/lib/rewards';
import { purgeTimers, setSound, startTimer, stopTimer, timersNow } from '../src/lib/timers';
import { b64uDecode, b64uEncode } from '../src/lib/base64url';
import { allowedEndpoint, deliverDue, encryptPayload, pushKeys, removeSubscription, saveSubscription, sendPush, subscribedPeople, type PushKeys } from '../src/lib/push';
import { formatCountdown, timeLeftMs, timerRunning } from '../src/lib/choreTypes';

const T = 1_700_000_000_000;
const MIN = 60_000;
const WED = '2026-10-07';
const manager = { id: 'u1', email: 'm@example.com', role: 'manager', createdAt: 0, disabledAt: null } as const;

let db: D1Database;
beforeEach(async () => {
  db = createTestDb();
  await db.prepare("INSERT INTO users (id, email, role, created_at) VALUES ('u1', 'm@example.com', 'manager', 0)").run();
});
const state = (now = T) => choreState(db, WED, true, now);

describe('starting a timer', () => {
  it('spends the minutes and counts down from now, on the server clock', async () => {
    await adjustMinutes(db, manager, 'agnes', 30, '', T);
    expect(await startTimer(db, 'agnes', 20, WED, T)).toBe('ok');
    const s = await state(T + 5_000);
    expect(s.minutes.agnes).toBe(10);
    expect(s.now).toBe(T + 5_000);
    expect(s.timers.agnes).toEqual({ startedAt: T, endsAt: T + 20 * MIN, minutes: 20 });
  });

  it('refuses, and starts nothing, when there is not enough time', async () => {
    await adjustMinutes(db, manager, 'agnes', 10, '', T);
    expect(await startTimer(db, 'agnes', 15, WED, T)).toBe('insufficient');
    expect((await state()).timers).toEqual({});
    expect((await state()).minutes.agnes).toBe(10);
  });

  it('adds to a timer that is still running instead of starting a second one', async () => {
    await adjustMinutes(db, manager, 'agnes', 60, '', T);
    await startTimer(db, 'agnes', 15, WED, T);
    await startTimer(db, 'agnes', 10, WED, T + 5 * MIN);
    const t = (await state(T + 5 * MIN)).timers.agnes!;
    expect(t).toEqual({ startedAt: T, endsAt: T + 25 * MIN, minutes: 25 });
  });

  it('replaces a finished timer nobody cleared', async () => {
    await adjustMinutes(db, manager, 'agnes', 60, '', T);
    await startTimer(db, 'agnes', 5, WED, T);
    await startTimer(db, 'agnes', 10, WED, T + 30 * MIN);
    expect((await state(T + 30 * MIN)).timers.agnes).toEqual({ startedAt: T + 30 * MIN, endsAt: T + 40 * MIN, minutes: 10 });
  });

  it('gives each person their own timer', async () => {
    await adjustMinutes(db, manager, 'agnes', 30, '', T);
    await adjustMinutes(db, manager, 'margo', 30, '', T);
    await startTimer(db, 'agnes', 10, WED, T);
    await startTimer(db, 'margo', 20, WED, T);
    const { timers } = await timersNow(db, T);
    expect(Object.keys(timers).sort()).toEqual(['agnes', 'margo']);
    await stopTimer(db, 'agnes', T);
    expect(Object.keys((await timersNow(db, T)).timers)).toEqual(['margo']);
  });
});

describe('stopping a timer', () => {
  it('hands back the whole minutes not yet used, to the bank first', async () => {
    await adjustMinutes(db, manager, 'agnes', 30, '', T);
    await setAllowance(db, manager, 'agnes', 20, null, T);
    await startTimer(db, 'agnes', 40, WED, T); // 20 from the allowance, 20 from the bank
    expect((await state()).minutes.agnes).toBe(10);
    expect(await stopTimer(db, 'agnes', T + 10 * MIN + 30_000)).toBe(29); // 29 whole minutes were left
    const s = await state(T + 11 * MIN);
    expect(s.minutes.agnes).toBe(30); // all 20 spent from the bank came back (10 + 20)
    expect(s.allowance.agnes).toMatchObject({ used: 11 }); // then 9 of the allowance
    expect(s.timers).toEqual({});
  });

  it('gives nothing back for a timer that has finished, and only refunds once', async () => {
    await adjustMinutes(db, manager, 'agnes', 30, '', T);
    await startTimer(db, 'agnes', 15, WED, T);
    expect(await stopTimer(db, 'agnes', T + 20 * MIN)).toBe(0);
    expect((await state()).minutes.agnes).toBe(15);

    await startTimer(db, 'agnes', 10, WED, T + 21 * MIN);
    expect(await stopTimer(db, 'agnes', T + 21 * MIN)).toBe(10);
    expect(await stopTimer(db, 'agnes', T + 21 * MIN)).toBe(0); // a second tap changes nothing
    expect((await state()).minutes.agnes).toBe(15);
  });

  it('keeps a refund of the allowance on the day it was spent', async () => {
    await setAllowance(db, manager, 'agnes', 30, null, T);
    await startTimer(db, 'agnes', 30, WED, T);
    expect((await state()).allowance.agnes!.used).toBe(30);
    await stopTimer(db, 'agnes', T);
    expect((await state()).allowance.agnes!.used).toBe(0);
  });

  it('does nothing when there is no timer', async () => {
    expect(await stopTimer(db, 'agnes', T)).toBe(0);
  });

  it('remembers where extra minutes came from so stopping gives all of them back', async () => {
    await adjustMinutes(db, manager, 'agnes', 40, '', T);
    await startTimer(db, 'agnes', 10, WED, T);
    await startTimer(db, 'agnes', 10, WED, T + MIN);
    expect(await stopTimer(db, 'agnes', T + 2 * MIN)).toBe(18);
    expect((await state()).minutes.agnes).toBe(38);
  });
});

describe('sounds and cleanup', () => {
  it('saves a sound for a person and refuses one that does not exist', async () => {
    expect(await setSound(db, 'agnes', 'bubbles')).toBe('ok');
    expect(await setSound(db, 'agnes', 'airhorn')).toBe('bad_request');
    expect((await state()).sounds).toEqual({ agnes: 'bubbles' });
    await setSound(db, 'agnes', 'bell');
    expect((await state()).sounds).toEqual({ agnes: 'bell' });
  });

  it('drops timers that finished long ago and keeps recent ones', async () => {
    await adjustMinutes(db, manager, 'agnes', 30, '', T);
    await adjustMinutes(db, manager, 'margo', 30, '', T);
    await startTimer(db, 'agnes', 5, WED, T);
    await startTimer(db, 'margo', 5, WED, T + 25 * 60 * MIN);
    await purgeTimers(db, T + 26 * 60 * MIN);
    expect(Object.keys((await timersNow(db, T)).timers)).toEqual(['margo']);
  });
});

describe('countdown helpers', () => {
  it('formats and rounds up so 0:00 only shows when time is truly up', () => {
    expect(formatCountdown(12 * MIN + 5_000)).toBe('12:05');
    expect(formatCountdown(400)).toBe('0:01');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(3_725_000)).toBe('1:02:05');
  });
  it('knows whether a timer is running', () => {
    const t = { startedAt: 0, endsAt: 100, minutes: 1 };
    expect(timeLeftMs(t, 40)).toBe(60);
    expect(timeLeftMs(t, 500)).toBe(0);
    expect(timerRunning(t, 99)).toBe(true);
    expect(timerRunning(t, 100)).toBe(false);
    expect(timerRunning(undefined, 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// Push alerts

/** A browser's side of a push subscription, so the tests can read what the Worker sends. */
async function makeBrowser() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const p256dh = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { pair, auth, p256dh, sub: { p256dh: b64uEncode(p256dh), auth: b64uEncode(auth) } };
}

/** Decrypts an aes128gcm push body the way a browser does (RFC 8291), to prove the Worker's encryption is readable. */
async function decrypt(browser: Awaited<ReturnType<typeof makeBrowser>>, body: Uint8Array): Promise<string> {
  const salt = body.slice(0, 16);
  const idLen = body[20]!;
  const asPublic = body.slice(21, 21 + idLen);
  const record = body.slice(21 + idLen);
  const hk = async (s: Uint8Array, ikm: Uint8Array, info: Uint8Array, n: number) =>
    new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: s as BufferSource, info: info as BufferSource }, await crypto.subtle.importKey('raw', ikm as BufferSource, 'HKDF', false, ['deriveBits']), n * 8));
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, browser.pair.privateKey, 256));
  const te = new TextEncoder();
  const ikm = await hk(browser.auth, shared, new Uint8Array([...te.encode('WebPush: info\0'), ...browser.p256dh, ...asPublic]), 32);
  const cek = await hk(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hk(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), record));
  expect(plain[plain.length - 1]).toBe(2); // the padding delimiter of the last record
  return new TextDecoder().decode(plain.slice(0, -1));
}

async function makeKeys(): Promise<{ keys: PushKeys; verify: (jwt: string) => Promise<boolean> }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const keys: PushKeys = { publicKey: b64uEncode(pub), privateKey: jwk.d!, subject: 'https://fam.example' };
  const verify = async (jwt: string) => {
    const [h, b, sig] = jwt.split('.');
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, b64uDecode(sig!), new TextEncoder().encode(`${h}.${b}`));
  };
  return { keys, verify };
}

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/abc123';

describe('push endpoints', () => {
  it('accepts only https addresses on the known push services', () => {
    for (const ok of [ENDPOINT, 'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/Qx', 'https://wns2-par02p.notify.windows.com/w/?token=x']) expect(allowedEndpoint(ok), ok).toBe(true);
    for (const bad of ['http://fcm.googleapis.com/x', 'https://evil.example/fcm.googleapis.com', 'https://fcm.googleapis.com.evil.example/x', 'https://push.apple.com.evil.example/', 'https://user:pw@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x', 'https://127.0.0.1/', 'not a url', '']) {
      expect(allowedEndpoint(bad), bad).toBe(false);
    }
  });
  it('is off unless both keys are set', () => {
    expect(pushKeys({ APP_ORIGIN: 'https://fam.example' })).toBeNull();
    expect(pushKeys({ APP_ORIGIN: 'https://fam.example', VAPID_PUBLIC_KEY: 'a' })).toBeNull();
    expect(pushKeys({ APP_ORIGIN: 'https://fam.example', VAPID_PUBLIC_KEY: 'a', VAPID_PRIVATE_KEY: 'b' })).toMatchObject({ publicKey: 'a', privateKey: 'b', subject: 'https://fam.example' });
  });
});

describe('push messages', () => {
  it('are encrypted so the browser can read them and nobody else can', async () => {
    const browser = await makeBrowser();
    const text = JSON.stringify({ title: "Time's up, Agnes!", body: 'Screen time is finished.' });
    const body = await encryptPayload(browser.sub, new TextEncoder().encode(text));
    expect(new TextDecoder('latin1').decode(body)).not.toContain('Agnes');
    expect(await decrypt(browser, body)).toBe(text);
    // Two messages never share a salt or key.
    expect(b64uEncode((await encryptPayload(browser.sub, new TextEncoder().encode(text))).slice(0, 16))).not.toBe(b64uEncode(body.slice(0, 16)));
  });

  it('go out with a signed VAPID token for the push service, and nothing in the clear', async () => {
    const browser = await makeBrowser();
    const { keys, verify } = await makeKeys();
    let seen: { url: string; init: RequestInit } | undefined;
    const fake = (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response(null, { status: 201 }); }) as unknown as typeof fetch;
    const status = await sendPush(keys, { endpoint: ENDPOINT, ...browser.sub }, { title: 'Hi', body: 'There', url: '/chores/agnes', tag: 'timer-agnes' }, fake, T);
    expect(status).toBe(201);
    const h = seen!.init.headers as Record<string, string>;
    expect(seen!.url).toBe(ENDPOINT);
    expect(seen!.init.redirect).toBe('manual');
    expect(h['Content-Encoding']).toBe('aes128gcm');
    const m = /^vapid t=([^,]+), k=(.+)$/.exec(h.Authorization!)!;
    expect(m[2]).toBe(keys.publicKey);
    expect(await verify(m[1]!)).toBe(true);
    const claims = JSON.parse(new TextDecoder().decode(b64uDecode(m[1]!.split('.')[1]!))) as { aud: string; exp: number; sub: string };
    expect(claims).toEqual({ aud: 'https://fcm.googleapis.com', exp: Math.floor(T / 1000) + 12 * 3600, sub: 'https://fam.example' });
    expect(JSON.parse(await decrypt(browser, seen!.init.body as Uint8Array))).toMatchObject({ title: 'Hi', url: '/chores/agnes' });
  });

  it('are never sent to an address off the allowlist', async () => {
    const browser = await makeBrowser();
    const { keys } = await makeKeys();
    const fake = (async () => { throw new Error('should not be called'); }) as unknown as typeof fetch;
    await expect(sendPush(keys, { endpoint: 'https://evil.example/x', ...browser.sub }, { title: '', body: '', url: '/', tag: '' }, fake)).rejects.toThrow('not allowed');
  });
});

describe('subscriptions', () => {
  it('are stored per device and person, and refuse bad input', async () => {
    const b = await makeBrowser();
    expect(await saveSubscription(db, 'agnes', { endpoint: ENDPOINT, ...b.sub }, T)).toBe('ok');
    expect(await saveSubscription(db, 'agnes', { endpoint: ENDPOINT, ...b.sub }, T + 1)).toBe('ok'); // again: no duplicate
    expect(await saveSubscription(db, 'margo', { endpoint: ENDPOINT, ...b.sub }, T)).toBe('ok');
    expect((await subscribedPeople(db, ENDPOINT)).sort()).toEqual(['agnes', 'margo']);
    expect(await saveSubscription(db, 'agnes', { endpoint: 'https://evil.example/x', ...b.sub })).toBe('bad_request');
    expect(await saveSubscription(db, 'agnes', { endpoint: ENDPOINT + '2', p256dh: 'AAAA', auth: b.sub.auth })).toBe('bad_request');
    await removeSubscription(db, ENDPOINT, 'agnes');
    expect(await subscribedPeople(db, ENDPOINT)).toEqual(['margo']);
    await removeSubscription(db, ENDPOINT);
    expect(await subscribedPeople(db, ENDPOINT)).toEqual([]);
  });
});

describe('the time-is-up alert', () => {
  async function setup() {
    const browser = await makeBrowser();
    const { keys } = await makeKeys();
    await db.prepare("INSERT INTO people (id, name, color, match, created_at) VALUES ('agnes', 'Agnes', '#e8590c', '[\"Agnes\"]', 0)").run();
    await saveSubscription(db, 'agnes', { endpoint: ENDPOINT, ...browser.sub }, T);
    await adjustMinutes(db, manager, 'agnes', 60, '', T);
    const sent: { url: string; body: Uint8Array }[] = [];
    let status = 201;
    const fake = (async (url: string, init: RequestInit) => { sent.push({ url, body: init.body as Uint8Array }); return new Response(null, { status }); }) as unknown as typeof fetch;
    return { browser, keys, sent, fake, setStatus: (s: number) => (status = s) };
  }

  it('is sent once when a timer finishes, to the devices following that person', async () => {
    const { browser, keys, sent, fake } = await setup();
    await startTimer(db, 'agnes', 10, WED, T);
    expect(await deliverDue(db, keys, T + 5 * MIN, fake)).toBe(0); // not finished yet
    expect(sent).toHaveLength(0);
    expect(await deliverDue(db, keys, T + 10 * MIN + 20_000, fake)).toBe(1);
    expect(JSON.parse(await decrypt(browser, sent[0]!.body))).toEqual({ title: "Time's up, Agnes!", body: 'Screen time is finished.', url: '/chores/agnes', tag: 'timer-agnes' });
    expect(await deliverDue(db, keys, T + 11 * MIN, fake)).toBe(0); // the next minute's run does not send it again
    expect(sent).toHaveLength(1);
  });

  it('is not sent for a timer that was stopped first', async () => {
    const { keys, sent, fake } = await setup();
    await startTimer(db, 'agnes', 10, WED, T);
    await stopTimer(db, 'agnes', T + MIN);
    await deliverDue(db, keys, T + 11 * MIN, fake);
    expect(sent).toHaveLength(0);
  });

  it('goes out again for time added after it was sent', async () => {
    const { keys, sent, fake } = await setup();
    await startTimer(db, 'agnes', 5, WED, T);
    await deliverDue(db, keys, T + 5 * MIN, fake);
    await startTimer(db, 'agnes', 5, WED, T + 6 * MIN); // the first one had finished, so this is a fresh timer
    await deliverDue(db, keys, T + 11 * MIN, fake);
    expect(sent).toHaveLength(2);
  });

  it('is skipped, not sent hours late, when the schedule was down', async () => {
    const { keys, sent, fake } = await setup();
    await startTimer(db, 'agnes', 5, WED, T);
    expect(await deliverDue(db, keys, T + 3 * 60 * MIN, fake)).toBe(0);
    expect(sent).toHaveLength(0);
    expect(await deliverDue(db, keys, T + 3 * 60 * MIN + MIN, fake)).toBe(0); // and it is not retried
  });

  it('forgets a device the push service says is gone, and keeps one that merely failed', async () => {
    const { keys, fake, setStatus } = await setup();
    await startTimer(db, 'agnes', 5, WED, T);
    setStatus(500);
    await deliverDue(db, keys, T + 5 * MIN, fake);
    expect(await subscribedPeople(db, ENDPOINT)).toEqual(['agnes']);
    await startTimer(db, 'agnes', 5, WED, T + 6 * MIN);
    setStatus(410);
    await deliverDue(db, keys, T + 11 * MIN, fake);
    expect(await subscribedPeople(db, ENDPOINT)).toEqual([]);
  });
});

describe('documentation', () => {
  it('lists every push service the Worker may contact in SECURITY.md', async () => {
    const { readFileSync } = await import('node:fs');
    const { PUSH_HOSTS } = await import('../src/lib/push');
    const doc = readFileSync('SECURITY.md', 'utf8');
    for (const h of PUSH_HOSTS) expect(doc, `${h} missing from SECURITY.md`).toContain(h.replace(/^\./, ''));
  });
});

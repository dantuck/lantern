// Web Push for the optional "time is up" alert, done with the Web Crypto API so there is no dependency: VAPID (RFC 8292) to prove who is
// sending, and aes128gcm (RFC 8291) to encrypt the message so the push service (Apple, Google, Mozilla) only ever carries ciphertext.
// Off unless the host sets VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY (see docs/setup-guide.md).
import { b64uDecode, b64uEncode } from './base64url';
import { loadPeople } from './peopleStore';

/**
 * The only push services this Worker will send to. A subscription's address comes from the browser, so it is checked against
 * this list rather than trusted. A name starting with a dot matches that domain and anything under it.
 */
export const PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', '.push.apple.com', '.notify.windows.com'] as const;

export interface PushKeys { publicKey: string; privateKey: string; subject: string }
export interface PushSubscription { endpoint: string; p256dh: string; auth: string }
export interface PushMessage { title: string; body: string; url: string; tag: string }

const enc = new TextEncoder();
/** Bytes backed by a plain ArrayBuffer, which is what Web Crypto accepts. */
type Bytes = Uint8Array<ArrayBuffer>;

/** The VAPID keys from the Worker's settings, or null when alerts are not set up. */
export function pushKeys(e: { VAPID_PUBLIC_KEY?: string; VAPID_PRIVATE_KEY?: string; APP_ORIGIN: string }): PushKeys | null {
  if (!e.VAPID_PUBLIC_KEY || !e.VAPID_PRIVATE_KEY) return null;
  return { publicKey: e.VAPID_PUBLIC_KEY.trim(), privateKey: e.VAPID_PRIVATE_KEY.trim(), subject: e.APP_ORIGIN };
}

/** Whether `endpoint` is an https address on one of the known push services. */
export function allowedEndpoint(endpoint: string): boolean {
  let u: URL;
  try { u = new URL(endpoint); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => (h.startsWith('.') ? host.endsWith(h) : host === h));
}

/** A signed VAPID token for the push service at `endpoint`, good for 12 hours. */
async function vapidJwt(keys: PushKeys, endpoint: string, nowSec: number): Promise<string> {
  const pub = b64uDecode(keys.publicKey); // 0x04 || x || y
  const key = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: b64uEncode(pub.slice(1, 33)), y: b64uEncode(pub.slice(33, 65)), d: keys.privateKey }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const head = b64uEncode(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64uEncode(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: nowSec + 12 * 3600, sub: keys.subject })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`)); // raw r||s, as a JWT wants
  return `${head}.${body}.${b64uEncode(sig)}`;
}

const concat = (...parts: Bytes[]): Bytes => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};

async function hkdf(salt: Bytes, ikm: Bytes, info: Bytes, bytes: number): Promise<Bytes> {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** Encrypts `payload` for one subscription (RFC 8291, a single aes128gcm record). */
export async function encryptPayload(sub: Pick<PushSubscription, 'p256dh' | 'auth'>, payload: Bytes, salt: Bytes = crypto.getRandomValues(new Uint8Array(16))): Promise<Bytes> {
  const uaPublic = b64uDecode(sub.p256dh);
  const authSecret = b64uDecode(sub.auth);
  const ephemeral = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', ephemeral.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, ephemeral.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic), 32);
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const record = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(payload, new Uint8Array([2]))); // 0x02 ends the last record
  const size = new Uint8Array(4);
  new DataView(size.buffer).setUint32(0, 4096);
  return concat(salt, size, new Uint8Array([asPublic.length]), asPublic, new Uint8Array(record));
}

/** Sends one message. Returns the push service's status: 201 is accepted, 404 or 410 means the subscription is gone for good. */
export async function sendPush(keys: PushKeys, sub: PushSubscription, msg: PushMessage, send: typeof fetch = fetch, nowMs = Date.now()): Promise<number> {
  if (!allowedEndpoint(sub.endpoint)) throw new Error('push endpoint not allowed');
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(msg)));
  const token = await vapidJwt(keys, sub.endpoint, Math.floor(nowMs / 1000));
  const res = await send(sub.endpoint, {
    method: 'POST',
    headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '600', Urgency: 'high', Authorization: `vapid t=${token}, k=${keys.publicKey}` },
    body,
    redirect: 'manual', // a push service answers directly; never follow it somewhere else
  });
  return res.status;
}

/** How late an alert may still go out. Past this (the schedule was down) it is skipped rather than arriving confusingly late. */
const STALE_MS = 15 * 60_000;
const MAX_SUBSCRIPTIONS = 100;

/**
 * Sends the "time is up" alert for every timer that has finished and not yet been announced. Run once a minute by the cron trigger.
 * Each timer is claimed first, in one step, so two overlapping runs cannot send the same alert twice.
 */
export async function deliverDue(db: D1Database, keys: PushKeys, now = Date.now(), send: typeof fetch = fetch): Promise<number> {
  const due = await db.prepare('SELECT person, ends_at FROM screentime_timers WHERE ends_at <= ? AND notified_at IS NULL').bind(now).all<{ person: string; ends_at: number }>();
  if (due.results.length === 0) return 0;
  const names = new Map((await loadPeople(db)).map((p) => [p.id, p.name]));
  let sent = 0;
  for (const t of due.results) {
    const claim = await db.prepare('UPDATE screentime_timers SET notified_at = ? WHERE person = ? AND ends_at = ? AND notified_at IS NULL').bind(now, t.person, t.ends_at).run();
    if ((claim.meta.changes ?? 0) === 0 || now - t.ends_at > STALE_MS) continue;
    const subs = await db.prepare('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE person = ?').bind(t.person).all<PushSubscription>();
    const name = names.get(t.person) ?? 'Someone';
    const msg: PushMessage = { title: `Time's up, ${name}!`, body: 'Screen time is finished.', url: `/chores/${encodeURIComponent(t.person)}`, tag: `timer-${t.person}` };
    await Promise.all(subs.results.map(async (sub) => {
      let status = 0;
      try { status = await sendPush(keys, sub, msg, send, now); } catch { /* one bad subscription must not stop the rest */ }
      if (status === 404 || status === 410) await removeSubscription(db, sub.endpoint);
      else if (status >= 200 && status < 300) sent++;
    }));
  }
  return sent;
}

/** Stores a device's subscription for a person. A device can follow several people. */
export async function saveSubscription(db: D1Database, person: string, sub: PushSubscription, now = Date.now()): Promise<'ok' | 'bad_request' | 'limit'> {
  if (!allowedEndpoint(sub.endpoint) || sub.endpoint.length > 1024) return 'bad_request';
  try {
    if (b64uDecode(sub.p256dh).length !== 65 || b64uDecode(sub.auth).length < 16) return 'bad_request';
  } catch { return 'bad_request'; }
  const count = await db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_SUBSCRIPTIONS) return 'limit';
  await db
    .prepare('INSERT INTO push_subscriptions (endpoint, person, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (endpoint, person) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth')
    .bind(sub.endpoint, person, sub.p256dh, sub.auth, now)
    .run();
  return 'ok';
}

/** Stops alerts for a device, for one person or (with no person) for all of them. */
export async function removeSubscription(db: D1Database, endpoint: string, person?: string): Promise<void> {
  await db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?1 AND (?2 IS NULL OR person = ?2)').bind(endpoint, person ?? null).run();
}

/** The people a device already gets alerts for. */
export async function subscribedPeople(db: D1Database, endpoint: string): Promise<string[]> {
  const rows = await db.prepare('SELECT person FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).all<{ person: string }>();
  return rows.results.map((r) => r.person);
}

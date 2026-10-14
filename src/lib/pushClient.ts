// Browser-safe. Signs this device up for (or out of) the optional "time is up" alerts. Everything goes to this site's own /api/push;
// the browser itself talks to its push service, which the page's Content Security Policy does not govern.

import { b64uDecode, b64uEncode } from './base64url';

export type PushSupport =
  /** Alerts are not set up on this Worker (no VAPID keys). The controls stay hidden. */
  | 'off'
  /** This browser cannot do push at all. */
  | 'unsupported'
  /** iPhone and iPad only allow push for an app added to the Home Screen. */
  | 'needs-install'
  | 'ready';

const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const installed = () => matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const capable = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function post(payload: Record<string, unknown>): Promise<Response | null> {
  try {
    return await fetch('/api/push', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch {
    return null;
  }
}

/** The key browsers subscribe with, or null when the Worker has alerts switched off. */
let knownKey: string | null = null;
async function serverKey(): Promise<string | null> {
  if (knownKey) return knownKey;
  try {
    const res = await fetch('/api/push', { cache: 'no-store' });
    const data = (await res.json()) as { enabled?: boolean; publicKey?: string };
    return (knownKey = res.ok && data.enabled && data.publicKey ? data.publicKey : null);
  } catch {
    return null;
  }
}

export async function pushSupport(): Promise<PushSupport> {
  if ((await serverKey()) === null) return 'off';
  if (ios() && !installed()) return 'needs-install';
  return capable() ? 'ready' : 'unsupported';
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!capable()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** The people this device gets alerts for, according to the server (empty when it cannot be reached). */
async function peopleFor(res: Response | null): Promise<string[]> {
  return res?.ok ? ((await res.json()) as { people?: string[] }).people ?? [] : [];
}

/** Whether this device already gets alerts for `person`. */
export async function isSubscribed(person: string): Promise<boolean> {
  const sub = await currentSubscription();
  if (!sub || Notification.permission !== 'granted') return false;
  return (await peopleFor(await post({ action: 'status', endpoint: sub.endpoint }))).includes(person);
}

/** Asks permission (this must run from a tap) and signs this device up for alerts about `person`. */
export async function enablePush(person: string): Promise<'ok' | 'denied' | 'error'> {
  try {
    const key = await serverKey();
    if (!key) return 'error';
    if ((await Notification.requestPermission()) !== 'granted') return 'denied';
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uDecode(key) }));
    const res = await post({ action: 'subscribe', person, subscription: { endpoint: sub.endpoint, keys: { p256dh: b64uEncode(sub.getKey('p256dh') ?? new ArrayBuffer(0)), auth: b64uEncode(sub.getKey('auth') ?? new ArrayBuffer(0)) } } });
    return res?.ok ? 'ok' : 'error';
  } catch {
    return 'error';
  }
}

/** Stops alerts about `person` on this device. When it was the last one, the browser's subscription is dropped too. */
export async function disablePush(person: string): Promise<boolean> {
  try {
    const sub = await currentSubscription();
    if (!sub) return true;
    const res = await post({ action: 'unsubscribe', endpoint: sub.endpoint, person });
    if (!res?.ok) return false;
    if ((await peopleFor(res)).length === 0) await sub.unsubscribe();
    return true;
  } catch {
    return false;
  }
}

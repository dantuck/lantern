// Tells opted-in managers when a reward is requested or a screen time timer is started, extended or stopped, by email, by push
// notification, or both, as each manager chose. Sending is best effort: it runs after the response, and a failure is logged and
// never reaches the person who tapped.
import { addInbox } from './inbox';
import { activityEmail, type Mailer } from './mailer';
import { removeManagerSubscription, sendPush, type PushKeys, type PushSubscription } from './push';

export const KINDS = ['rewards', 'timers'] as const;
export const CHANNELS = ['email', 'push'] as const;
export type NotifyKind = (typeof KINDS)[number];
export type Channel = (typeof CHANNELS)[number];
/** One flag per kind and channel, named like `rewards_email`. */
export type NotifyPrefs = Record<`${NotifyKind}_${Channel}`, boolean>;

const COLUMNS = KINDS.flatMap((k) => CHANNELS.map((c) => `${k}_${c}` as const));
export const isKind = (v: string): v is NotifyKind => (KINDS as readonly string[]).includes(v);
export const isChannel = (v: string): v is Channel => (CHANNELS as readonly string[]).includes(v);

export const NO_PREFS: NotifyPrefs = { rewards_email: false, rewards_push: false, timers_email: false, timers_push: false };

/** A manager's choices. A manager who never chose has no row, which means everything off. */
export async function notifyPrefsFor(db: D1Database, userId: string): Promise<NotifyPrefs> {
  const row = await db.prepare(`SELECT ${COLUMNS.join(', ')} FROM manager_notify WHERE user_id = ?`).bind(userId).first<Record<string, number>>();
  return row ? (Object.fromEntries(COLUMNS.map((c) => [c, row[c] === 1])) as NotifyPrefs) : { ...NO_PREFS };
}

/** Turns one kind of notification on or off, for one channel, for a manager. */
export async function setNotify(db: D1Database, userId: string, kind: NotifyKind, channel: Channel, on: boolean): Promise<void> {
  const col = `${kind}_${channel}`; // built from two fixed lists, never from request text
  await db
    .prepare(`INSERT INTO manager_notify (user_id, ${col}) VALUES (?1, ?2) ON CONFLICT (user_id) DO UPDATE SET ${col} = ?2`)
    .bind(userId, on ? 1 : 0)
    .run();
}

/** Active managers who asked for `kind` over `channel`, minus `exceptId` (whoever did the thing needs no message about it). */
export async function recipients(db: D1Database, kind: NotifyKind, channel: Channel, exceptId?: string): Promise<{ id: string; email: string }[]> {
  const col = `${kind}_${channel}`;
  const rows = await db
    .prepare(`SELECT u.id, u.email FROM users u JOIN manager_notify n ON n.user_id = u.id WHERE u.role = 'manager' AND u.disabled_at IS NULL AND n.${col} = 1 AND u.id != ?`)
    .bind(exceptId ?? '')
    .all<{ id: string; email: string }>();
  return rows.results;
}

export interface Activity { kind: NotifyKind; headline: string; detail: string; /** A path on this site, such as `/chores/manage`. */ path: string }
/** What can be sent with: either may be missing, which just skips that channel. */
export interface Channels { mailer: Mailer | null; origin: string | null; keys: PushKeys | null }

/** Puts `activity` in the managers' inbox, then sends it to every manager who wants it, on the channels they chose. Resolves once every send has settled; it never rejects. The return value counts only emails and pushes sent. */
export async function notifyManagers(db: D1Database, via: Channels, activity: Activity, exceptId?: string, send: typeof fetch = fetch): Promise<number> {
  let sent = 0;
  try {
    // The inbox is the record; a failure there must not stop the alerts, and it runs alongside them.
    const jobs: Promise<void>[] = [addInbox(db, activity).catch((e) => console.error('inbox add failed', String(e)))];
    if (via.mailer && via.origin) {
      const mailer = via.mailer;
      const mail = activityEmail(activity.headline, activity.detail, `${via.origin}${activity.path}`);
      for (const r of await recipients(db, activity.kind, 'email', exceptId)) {
        jobs.push(mailer.send({ to: r.email, ...mail }).then(() => { sent++; }, (e) => console.error('activity mail failed', String(e))));
      }
    }
    if (via.keys) {
      const keys = via.keys;
      const msg = { title: activity.headline, body: activity.detail, url: activity.path, tag: `${activity.kind}:${activity.path}` };
      for (const r of await recipients(db, activity.kind, 'push', exceptId)) {
        const subs = await db.prepare('SELECT endpoint, p256dh, auth FROM manager_push WHERE user_id = ?').bind(r.id).all<PushSubscription>();
        for (const sub of subs.results) {
          jobs.push((async () => {
            let status = 0;
            try { status = await sendPush(keys, sub, msg, send); } catch { /* one bad device must not stop the rest */ }
            if (status === 404 || status === 410) await removeManagerSubscription(db, sub.endpoint, r.id);
            else if (status >= 200 && status < 300) sent++;
          })());
        }
      }
    }
    await Promise.all(jobs);
  } catch (e) {
    console.error('activity notify failed', String(e));
  }
  return sent;
}

import { isSound, type Sound, type Timer } from './choreTypes';
import { spendMinutes } from './rewards';

const MINUTE = 60_000;
/** Finished timers nobody cleared are dropped after this. */
const KEEP_FINISHED_MS = 24 * 60 * MINUTE;

interface TimerRow { person: string; started_at: number; ends_at: number; minutes: number; from_bank: number; from_allowance: number; day: string }

/**
 * Spends `minutes` of screen time and starts a countdown for it. If the person already has a timer still running, the minutes are
 * added to it instead, so tapping "Use 15" twice gives 30. A finished timer nobody cleared is replaced.
 */
export async function startTimer(db: D1Database, person: string, minutes: number, day: string, now = Date.now()): Promise<'ok' | 'insufficient'> {
  const spent = await spendMinutes(db, person, minutes, day, now);
  if (!spent) return 'insufficient';
  const running = await db.prepare('SELECT ends_at, minutes, from_bank, from_allowance, day FROM screentime_timers WHERE person = ? AND ends_at > ?').bind(person, now).first<TimerRow>();
  if (running) {
    // The allowance part belongs to one household day; if the timer runs past midnight the old day's part can no longer be given back.
    const sameDay = running.day === day;
    await db
      .prepare('UPDATE screentime_timers SET ends_at = ?, minutes = ?, from_bank = ?, from_allowance = ?, day = ?, notified_at = NULL WHERE person = ?')
      .bind(running.ends_at + minutes * MINUTE, running.minutes + minutes, running.from_bank + spent.fromBank, (sameDay ? running.from_allowance : 0) + spent.fromAllowance, day, person)
      .run();
    return 'ok';
  }
  await db
    .prepare('INSERT OR REPLACE INTO screentime_timers (person, started_at, ends_at, minutes, from_bank, from_allowance, day, notified_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)')
    .bind(person, now, now + minutes * MINUTE, minutes, spent.fromBank, spent.fromAllowance, day)
    .run();
  return 'ok';
}

/**
 * Stops a person's timer. Whole minutes that had not run yet are given back, to the bank first (it keeps) and then to the day's
 * allowance (it does not). Clearing a timer that already finished gives back nothing. Safe to repeat: the row is deleted in one step,
 * so only the first call can refund. Returns the minutes handed back.
 */
export async function stopTimer(db: D1Database, person: string, now = Date.now()): Promise<number> {
  const t = await db
    .prepare('DELETE FROM screentime_timers WHERE person = ? RETURNING person, started_at, ends_at, minutes, from_bank, from_allowance, day')
    .bind(person)
    .first<TimerRow>();
  if (!t) return 0;
  const unused = Math.min(t.minutes, Math.floor(Math.max(0, t.ends_at - now) / MINUTE));
  const toBank = Math.min(unused, t.from_bank);
  const toAllowance = Math.min(unused - toBank, t.from_allowance);
  if (toBank + toAllowance === 0) return 0;
  // A "use" entry with the opposite sign: the bank is still the sum of `delta`, and the day's allowance used is the sum of `allowance_used`.
  await db
    .prepare("INSERT INTO screentime_ledger (id, person, delta, kind, ref, note, at, day, allowance_used) VALUES (?, ?, ?, 'use', NULL, 'Stopped early', ?, ?, ?)")
    .bind(crypto.randomUUID(), person, toBank, now, t.day, -toAllowance)
    .run();
  return toBank + toAllowance;
}

/** Just the countdowns, for the cheap check devices make every few seconds. */
export async function timersNow(db: D1Database, now = Date.now()): Promise<{ now: number; timers: Record<string, Timer> }> {
  const rows = await db.prepare('SELECT person, started_at AS startedAt, ends_at AS endsAt, minutes FROM screentime_timers').all<Timer & { person: string }>();
  const timers: Record<string, Timer> = {};
  for (const t of rows.results) timers[t.person] = { startedAt: t.startedAt, endsAt: t.endsAt, minutes: t.minutes };
  return { now, timers };
}

/** Remembers the sound a person's devices play when time is up. */
export async function setSound(db: D1Database, person: string, sound: Sound | string): Promise<'ok' | 'bad_request'> {
  if (!isSound(sound)) return 'bad_request';
  await db.prepare('INSERT INTO screentime_sound (person, sound) VALUES (?, ?) ON CONFLICT (person) DO UPDATE SET sound = excluded.sound').bind(person, sound).run();
  return 'ok';
}

/** Drops finished timers nobody cleared. Part of the opportunistic cleanup. */
export async function purgeTimers(db: D1Database, now = Date.now()): Promise<void> {
  await db.prepare('DELETE FROM screentime_timers WHERE ends_at < ?').bind(now - KEEP_FINISHED_MS).run();
}

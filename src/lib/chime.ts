// Browser-safe. The sounds a device plays when screen time is up, made with the Web Audio API so there are no audio files to ship
// (and nothing for the page's Content Security Policy to allow). Browsers only let a page make sound after a tap, so `unlockAudio`
// is called from taps (starting a timer, the sound menu) and the alarm can then ring later without anyone touching the screen.
import type { Sound } from './choreTypes';

type Note = { at: number; hz: number; len: number; gain?: number; wave?: OscillatorType };

/** Each sound as a short score: when each note starts and how long it rings, in seconds. */
const SCORES: Record<Sound, Note[]> = {
  chime: [{ at: 0, hz: 880, len: 1.1 }, { at: 0.25, hz: 1319, len: 1.1 }, { at: 0.5, hz: 1760, len: 1.4 }],
  bell: [{ at: 0, hz: 523, len: 1.8, gain: 0.5 }, { at: 0, hz: 1046, len: 1.4, gain: 0.25 }, { at: 0.9, hz: 523, len: 1.8, gain: 0.5 }, { at: 0.9, hz: 1046, len: 1.4, gain: 0.25 }],
  bubbles: [0, 0.12, 0.24, 0.36, 0.48].map((at, i) => ({ at, hz: 500 + i * 180, len: 0.18, gain: 0.4 })),
  fanfare: [{ at: 0, hz: 523, len: 0.18 }, { at: 0.18, hz: 523, len: 0.18 }, { at: 0.36, hz: 523, len: 0.18 }, { at: 0.54, hz: 659, len: 0.5 }, { at: 1.08, hz: 784, len: 0.9 }].map((n): Note => ({ gain: 0.18, wave: 'square', ...n })),
  gentle: [{ at: 0, hz: 392, len: 1.6, gain: 0.35 }, { at: 0.5, hz: 494, len: 1.6, gain: 0.35 }, { at: 1, hz: 587, len: 2, gain: 0.35 }],
};

/** How long a sound lasts, in milliseconds. */
export const soundLengthMs = (sound: Sound): number => Math.max(...SCORES[sound].map((n) => n.at + n.len)) * 1000;

type Ctor = typeof AudioContext;
let ctx: AudioContext | undefined;

function context(): AudioContext | undefined {
  if (ctx) return ctx;
  const C: Ctor | undefined = typeof window === 'undefined' ? undefined : window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!C) return undefined;
  try { ctx = new C(); } catch { /* no audio on this device */ }
  return ctx;
}

/** Call from a tap or key press. Wakes the audio engine so a later `playSound` is allowed to be heard. */
export function unlockAudio(): void {
  const c = context();
  if (c && c.state !== 'running') void c.resume().catch(() => {});
}

/** Calls `fn` whenever the device's permission to play sound changes (for example once a tap unlocks it). Returns a way to stop. */
export function onAudioChange(fn: () => void): () => void {
  const c = context();
  c?.addEventListener('statechange', fn);
  return () => c?.removeEventListener('statechange', fn);
}

/** Whether this device is currently allowed to play sound (true once a tap has unlocked it). */
export const audioReady = (): boolean => ctx?.state === 'running';

/** Plays a sound now. Does nothing, quietly, if the device has not been unlocked or has no audio. */
export function playSound(sound: Sound): void {
  const c = context();
  if (!c) return;
  if (c.state !== 'running') { void c.resume().catch(() => {}); return; } // not unlocked by a tap yet: stay quiet
  const start = c.currentTime + 0.02;
  for (const n of SCORES[sound]) {
    const osc = c.createOscillator();
    const amp = c.createGain();
    osc.type = n.wave ?? 'sine';
    osc.frequency.value = n.hz;
    const peak = n.gain ?? 0.3;
    const t = start + n.at;
    // A quick rise and a long fade, so it rings like a chime instead of clicking on and off.
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + 0.02);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + n.len);
    osc.connect(amp).connect(c.destination);
    osc.start(t);
    osc.stop(t + n.len + 0.05);
  }
}

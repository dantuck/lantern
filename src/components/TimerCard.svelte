<script lang="ts">
  import { hold } from '../lib/holdRefresh.svelte';
  import { untrack } from 'svelte';
  import { formatCountdown, timeLeftMs, type Sound, type Timer } from '../lib/choreTypes';
  import { audioReady, onAudioChange, playSound, soundLengthMs, unlockAudio } from '../lib/chime';

  // The countdown for one person: big numbers while it runs, then a "time's up" panel that rings this device (unless it is muted) until
  // someone clears it. The timer itself lives on the server (see timers.ts); this only shows it and plays the sound.
  let { name, timer, now, sound, canAddMore, busy, stop, addMore, muted = $bindable(false) }: {
    name: string;
    timer: Timer | undefined;
    now: number;
    sound: Sound;
    /** Whether there is screen time left to add 5 more minutes. */
    canAddMore: boolean;
    busy: boolean;
    stop: () => Promise<boolean>;
    addMore: (minutes: number) => Promise<boolean>;
    muted?: boolean;
  } = $props();

  const left = $derived(timer ? timeLeftMs(timer, now) : 0);
  const done = $derived(timer !== undefined && left <= 0);
  const running = $derived(timer !== undefined && !done);
  const spanMs = $derived(timer ? timer.endsAt - timer.startedAt : 1);
  const pct = $derived(timer ? Math.min(100, Math.max(0, (left / Math.max(1, spanMs)) * 100)) : 0);
  const unused = $derived(Math.floor(left / 60_000)); // whole minutes handed back by stopping now
  /** Said aloud to screen readers only at a few moments, not every second. */
  const spoken = $derived(running ? (left > 60_000 ? `${Math.ceil(left / 60_000)} minutes left` : left > 10_000 ? 'Under a minute left' : 'Nearly done') : '');

  // Ring when the timer finishes: a few rounds, a pause between each, and not at all if the page was opened long after it ended.
  const ringKey = $derived(timer && done ? timer.endsAt : null);
  $effect(() => {
    const key = ringKey;
    if (key === null || muted) return;
    if (untrack(() => now) - key > 2 * 60_000) return;
    const release = hold(); // a page refresh would cut the alarm off, so it waits until the last round has played
    let rounds = 0;
    const ring = () => {
      playSound(sound);
      navigator.vibrate?.([200, 100, 200]);
      if (++rounds >= 4) { clearInterval(id); release(); }
    };
    const id = setInterval(ring, Math.max(12_000, soundLengthMs(sound) + 3000));
    ring();
    return () => { clearInterval(id); release(); };
  });

  // Keep the screen on while counting, so a tablet that would have gone to sleep is still awake to ring.
  $effect(() => {
    if (!running) return;
    let lock: WakeLockSentinel | null = null;
    const take = async () => { try { lock = (await navigator.wakeLock?.request('screen')) ?? null; } catch { /* refused: the screen may sleep */ } };
    const back = () => { if (document.visibilityState === 'visible') void take(); };
    void take();
    document.addEventListener('visibilitychange', back);
    return () => { document.removeEventListener('visibilitychange', back); void lock?.release().catch(() => {}); };
  });

  // The browser only lets a page make sound after a tap, so any tap on this page wakes the audio engine for later.
  let ready = $state(audioReady());
  $effect(() => {
    if (!timer) return;
    const sync = () => (ready = audioReady());
    const wake = () => { unlockAudio(); sync(); };
    addEventListener('pointerdown', wake);
    addEventListener('keydown', wake);
    const stopWatching = onAudioChange(sync);
    sync();
    return () => { removeEventListener('pointerdown', wake); removeEventListener('keydown', wake); stopWatching(); };
  });

  function toggleMute() {
    muted = !muted;
    unlockAudio();
    if (!muted) playSound(sound);
  }
</script>

{#if timer}
  <section class="timer-card {done ? 'is-done' : ''}" aria-label={`${name}'s screen time timer`}>
    <div class="flex items-center gap-3">
      <span class="text-[1.6rem]" aria-hidden="true">{done ? '⏰' : '⏳'}</span>
      <div class="min-w-0 flex-1">
        {#if done}
          <p class="m-0 text-[1.35rem] font-bold" role="status">Time's up, {name}!</p>
          <p class="note m-0">Your {timer.minutes} minutes of screen time are finished.</p>
        {:else}
          <p class="m-0 text-[3rem] leading-none font-bold tabular-nums tracking-[-.03em] max-[34rem]:text-[2.4rem]" aria-hidden="true">{formatCountdown(left)}</p>
          <p class="note m-0 mt-1">of {timer.minutes} minutes</p>
          <p class="sr-only" role="status">{spoken}</p>
        {/if}
      </div>
      <button type="button" class="ghost small w-auto m-0 text-[1.2rem]" aria-pressed={muted} aria-label={muted ? 'Sound is off on this device. Turn it on' : 'Sound is on. Turn it off on this device'} title={muted ? 'Sound is off on this device' : 'Sound is on for this device'} onclick={toggleMute}><span aria-hidden="true">{muted ? '🔕' : '🔔'}</span></button>
    </div>
    {#if running}
      <div class="track h-[.7rem] mt-3" role="presentation"><span class="fill bg-[var(--c)]" style:width={`${pct}%`}></span></div>
      {#if !ready && !muted}<p class="note m-0 mt-2">Tap anywhere on this page once so this device can ring when time is up.</p>{/if}
    {/if}
    <div class="flex flex-wrap items-center gap-2 mt-3">
      <button type="button" class="w-auto m-0 {done ? '' : 'ghost'}" disabled={busy} onclick={stop}>{done ? 'All done' : unused > 0 ? `Stop and keep ${unused} min` : 'Stop'}</button>
      {#if canAddMore}<button type="button" class="ghost w-auto m-0" disabled={busy} onclick={() => addMore(5)}>+5 min</button>{/if}
    </div>
  </section>
{/if}

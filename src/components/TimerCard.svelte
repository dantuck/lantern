<script lang="ts">
  import FeatherIcon from './FeatherIcon.svelte';
  import { hold } from '../lib/holdRefresh.svelte';
  import { untrack } from 'svelte';
  import { formatCountdown, timeLeftMs, urgency, type Sound, type Timer } from '../lib/choreTypes';
  import { keepAwake } from '../lib/keepAwake';
  import { audioReady, onAudioChange, playSound, soundLengthMs, unlockAudio } from '../lib/chime';

  // The countdown for one person: big numbers while it runs, then a "time's up" panel that rings this device (unless it is muted) until
  // someone clears it. The timer itself lives on the server (see timers.ts); this only shows it and plays the sound.
  let { name, timer, now, sound, available, busy, stop, addMore, muted = $bindable(false) }: {
    name: string;
    timer: Timer | undefined;
    now: number;
    sound: Sound;
    /** Minutes of screen time the child has to spend: it decides whether +5 is offered and what is left after. */
    available: number;
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
  const stage = $derived(running ? urgency(left, spanMs) : null);
  const stageClass = $derived(stage ? `cd-${stage}` : '');
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

  // The timer takes over the whole screen so it can be read from across the room. "Minimise" tucks it back into the card; a new timer,
  // or the time running out, brings it back.
  let minimized = $state(false);
  const restore = $derived(timer ? `${timer.startedAt}:${done}` : ''); // a new timer, or time running out
  $effect(() => { if (restore) { minimized = false; askedAt = null; } });

  // Keep the screen on while counting, so a tablet that would have gone to sleep is still awake to ring. Assumed fine until it says otherwise.
  let awake = $state(true);
  $effect(() => {
    if (!running) return;
    const stop = keepAwake((held) => (awake = held));
    return () => { stop(); awake = true; };
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

  // +5 min spends saved-up screen time, so it asks first. The question goes away by itself if nobody answers, by the ticking clock.
  const canAddMore = $derived(available >= 5);
  const after = $derived(available - 5 > 0 ? `You'll still have ${available - 5} min left after.` : "That's the last of your time!");
  let askedAt = $state<number | null>(null);
  const adding = $derived(askedAt !== null && now - askedAt < 8000);
  const askMore = () => { askedAt = now; };
  const dismissMore = () => { askedAt = null; };
  async function confirmMore() { dismissMore(); await addMore(5); }

  let dlg = $state<HTMLDialogElement>();
  $effect(() => {
    dlg?.showModal(); // removing the dialog from the page later closes it without an event
    dlg?.focus(); // not the first button
  });

  const muteLabel = $derived(muted ? 'Sound is off on this device. Turn it on' : 'Sound is on. Turn it off on this device');
  function toggleMute() {
    muted = !muted;
    unlockAudio();
    if (!muted) playSound(sound);
  }
</script>

{#snippet sleepNote(cls: string)}
  <p class="note m-0 {cls}">This screen may go to sleep before time is up. Tap anywhere to try again, or set Auto-Lock to Never in Settings.</p>
{/snippet}

{#snippet muteButton(cls: string, labelled: boolean)}
  <button type="button" class={cls} aria-pressed={muted} aria-label={muteLabel} onclick={toggleMute}><FeatherIcon name={muted ? 'bell-off' : 'bell'} />{#if labelled} <span class="text-[.95rem]">{muted ? 'Sound off' : 'Sound on'}</span>{/if}</button>
{/snippet}

<!-- Stop and +5, and the +5 question in the same place, so the layout does not move when it appears. -->
{#snippet controls(full: boolean)}
  {@const plain = full ? 'glass' : 'ghost w-auto m-0'}
  {@const strong = full ? 'glass glass-primary' : 'w-auto m-0'}
  <div class="timer-controls">
    <div class="tc-pane is-row" class:off={adding} inert={adding}>
      <button type="button" class={done ? strong : plain} disabled={busy} onclick={stop}>{done ? 'All done' : unused > 0 ? `Stop and keep ${unused} min` : 'Stop'}</button>
      {#if canAddMore}<button type="button" class={plain} disabled={busy} onclick={askMore}>+5 min</button>{/if}
    </div>
    <div class="tc-pane" class:off={!adding} inert={!adding} role="group" aria-label="Want 5 more minutes?">
      <p class="m-0 font-bold {full ? 'text-[1.6rem]' : ''}">Want 5 more minutes?</p>
      <p class="note m-0 {full ? 'text-[1.1rem]' : ''}">{after}</p>
      <div class="flex flex-wrap items-center justify-center gap-3">
        <button type="button" class={plain} onclick={dismissMore}>Not yet</button>
        <button type="button" class={strong} disabled={busy} onclick={confirmMore}>Yes, 5 more!</button>
      </div>
    </div>
  </div>
{/snippet}

{#if timer && !minimized}
  <dialog class="timer-full {done ? 'is-done' : ''}" tabindex="-1" bind:this={dlg} aria-label={`${name}'s screen time timer`} onclose={() => (minimized = true)}>
    <div class="flex justify-between gap-2">
      <button type="button" class="glass" onclick={() => (minimized = true)}>Minimise</button>
      {@render muteButton('glass', true)}
    </div>
    <div class="grid place-items-center gap-3 text-center {stageClass}">
      {#if done}
        <span class="text-[4rem]" aria-hidden="true"><FeatherIcon name="bell" /></span>
        <p class="m-0 text-[clamp(2rem,8vw,4rem)] font-bold" role="status">Time's up, {name}!</p>
        <p class="note m-0 text-[1.2rem]">Your {timer.minutes} minutes of screen time are finished.</p>
      {:else}
        <p class="cd-num m-0 text-[clamp(5rem,26vw,16rem)] leading-none font-bold tabular-nums tracking-[-.03em]" aria-hidden="true">{formatCountdown(left)}</p>
        <p class="note m-0 text-[1.2rem]">{name}'s {timer.minutes} minutes of screen time</p>
        <p class="sr-only" role="status">{spoken}</p>
        <div class="track h-[1rem] w-[min(32rem,80vw)]" role="presentation"><span class="fill cd-bar" style:width={`${pct}%`}></span></div>
        {#if !ready && !muted}<p class="note m-0">Tap anywhere once so this device can ring when time is up.</p>{/if}
        {#if !awake}{@render sleepNote('')}{/if}
      {/if}
    </div>
    {@render controls(true)}
  </dialog>
{:else if timer}
  <section class="timer-card {done ? 'is-done' : ''} {stageClass}" aria-label={`${name}'s screen time timer`}>
    <div class="flex items-center gap-3">
      <span class="text-[1.6rem]" aria-hidden="true"><FeatherIcon name={done ? 'bell' : 'clock'} /></span>
      <div class="min-w-0 flex-1">
        {#if done}
          <p class="m-0 text-[1.35rem] font-bold" role="status">Time's up, {name}!</p>
          <p class="note m-0">Your {timer.minutes} minutes of screen time are finished.</p>
        {:else}
          <p class="cd-num m-0 text-[3rem] leading-none font-bold tabular-nums tracking-[-.03em] max-[34rem]:text-[2.4rem]" aria-hidden="true">{formatCountdown(left)}</p>
          <p class="note m-0 mt-1">of {timer.minutes} minutes</p>
          <p class="sr-only" role="status">{spoken}</p>
        {/if}
      </div>
      <button type="button" class="ghost small w-auto m-0" onclick={() => (minimized = false)}>Full screen</button>
      {@render muteButton('ghost small w-auto m-0 text-[1.2rem]', false)}
    </div>
    {#if running}
      <div class="track h-[.7rem] mt-3" role="presentation"><span class="fill cd-bar" style:width={`${pct}%`}></span></div>
      {#if !ready && !muted}<p class="note m-0 mt-2">Tap anywhere on this page once so this device can ring when time is up.</p>{/if}
      {#if !awake}{@render sleepNote('mt-2')}{/if}
    {/if}
    <div class="mt-3">{@render controls(false)}</div>
  </section>
{/if}

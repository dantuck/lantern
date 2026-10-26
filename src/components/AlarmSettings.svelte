<script lang="ts">
  import { onMount } from 'svelte';
  import FeatherIcon from './FeatherIcon.svelte';
  import Switch from './Switch.svelte';
  import { SOUNDS, SOUND_LABEL, type Sound } from '../lib/choreTypes';
  import { playSound, unlockAudio } from '../lib/chime';
  import { disablePush, enablePush, isSubscribed, pushSupport, type PushSupport } from '../lib/pushClient';

  // Where a person picks the sound their screen time timer rings with, whether this device rings, and (when the household has switched
  // them on) alerts that arrive even if this page is closed.
  let { who, name, sound, busy, setSound, muted = $bindable(false), demo = false }: {
    who: string;
    name: string;
    sound: Sound;
    busy: boolean;
    setSound: (s: Sound) => Promise<boolean>;
    muted?: boolean;
    demo?: boolean;
  } = $props();

  async function choose(s: Sound) {
    unlockAudio(); // this tap is what lets the device play sound later
    playSound(s);
    if (s !== sound) await setSound(s);
  }

  // Closed until someone opens it, so a quick tap on the page cannot change the sound by accident.
  let open = $state(false);

  let support = $state<PushSupport>('off');
  let subscribed = $state(false);
  let working = $state(false);
  let note = $state('');
  onMount(async () => {
    if (demo) return;
    support = await pushSupport();
    if (support === 'ready') subscribed = await isSubscribed(who);
  });
  async function togglePush() {
    working = true; note = '';
    if (subscribed) {
      if (await disablePush(who)) subscribed = false; else note = 'That did not work. Try again.';
    } else {
      const r = await enablePush(who);
      if (r === 'ok') subscribed = true;
      else note = r === 'denied' ? 'Notifications are blocked for this site. Allow them in the browser or device settings, then try again.' : 'That did not work. Try again.';
    }
    working = false;
  }
</script>

<section class="card" aria-labelledby="alarm-h">
  <h2 class="card-h m-0" id="alarm-h">
    <button type="button" class="ghost flex w-full items-center justify-between gap-3 m-0 min-h-12 text-left [&&]:font-[inherit]" aria-expanded={open} aria-controls="alarm-body" onclick={() => (open = !open)}>
      <span class="flex items-center gap-2"><FeatherIcon name="bell" /> Timer sound <span class="note">{SOUND_LABEL[sound]}{muted ? ', off here' : ''}</span></span>
      <span class="text-accent text-[.9rem] font-semibold">{open ? 'Done' : 'Change'}</span>
    </button>
  </h2>
  {#if open}
  <div id="alarm-body" class="mt-3">
  <p class="note mt-0">Tap a sound to hear it and pick it for {name}'s timer.</p>
  <div class="flex flex-wrap gap-2" role="group" aria-label="Sound for time's up">
    {#each SOUNDS as s (s)}
      <button type="button" class="ghost flex-[1_1_7rem] [&&]:w-auto [&&]:m-0 [&&]:min-h-11 [&[aria-pressed=true]]:bg-accent-soft [&[aria-pressed=true]]:text-accent [&[aria-pressed=true]]:border-accent" aria-pressed={s === sound} disabled={busy} onclick={() => choose(s)}><span aria-hidden="true">{s === sound ? '✓' : '▶'}</span> {SOUND_LABEL[s]}</button>
    {/each}
  </div>
  <div class="flex items-center justify-between gap-3 mt-3 pointer-coarse:min-h-11">
    <span id="ring-l" class="text-[.95rem] font-medium text-fg">Ring on this device</span>
    <Switch checked={!muted} labelledby="ring-l" onchange={(on) => { muted = !on; if (on) unlockAudio(); }} />
  </div>
  <p class="note mt-1">Plays only while this page is open. An iPad's side switch or mute also silences it.</p>

  {#if support === 'ready' || support === 'needs-install'}
    <h3 class="mt-4 mb-1 mx-0 text-[1rem]">Alerts when the page is closed</h3>
  {/if}
  {#if support === 'ready'}
    <button type="button" class="ghost small w-auto m-0" disabled={working} aria-pressed={subscribed} onclick={togglePush}>{subscribed ? 'Alerts are on. Turn off' : 'Alert this device when time is up'}</button>
    {#if note}<p class="note mt-2" role="alert">{note}</p>{/if}
  {:else if support === 'needs-install'}
    <p class="note m-0">On an iPhone or iPad, tap Share, then Add to Home Screen, and open Lantern from there. Then this button appears.</p>
  {/if}
  </div>
  {/if}
</section>

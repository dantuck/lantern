<script lang="ts">
  import { onMount } from 'svelte';
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
  <h2 class="card-h" id="alarm-h">Timer sound</h2>
  <p class="note mt-0">What {name}'s timer plays when time is up. Tap one to hear it.</p>
  <div class="flex flex-wrap gap-2" role="group" aria-label="Sound for time's up">
    {#each SOUNDS as s (s)}
      <button type="button" class="ghost small w-auto m-0 [&[aria-pressed=true]]:bg-card [&[aria-pressed=true]]:text-accent [&[aria-pressed=true]]:border-[1.5px] [&[aria-pressed=true]]:border-accent" aria-pressed={s === sound} disabled={busy} onclick={() => choose(s)}><span aria-hidden="true">▶</span> {SOUND_LABEL[s]}</button>
    {/each}
  </div>
  <label class="flex items-center gap-2 mt-4 text-[.95rem] font-medium text-fg"><input class="w-auto m-0" type="checkbox" checked={!muted} onchange={(e) => { muted = !e.currentTarget.checked; if (!muted) unlockAudio(); }} /> Ring on this device</label>
  <p class="note mt-1">Sound plays only while this page is open. On an iPad, the side switch or Control Centre mute also silences it.</p>

  {#if support === 'ready' || support === 'needs-install'}
    <h3 class="mt-4 mb-1 mx-0 text-[1rem]">Alerts when the page is closed</h3>
  {/if}
  {#if support === 'ready'}
    <button type="button" class="ghost small w-auto m-0" disabled={working} aria-pressed={subscribed} onclick={togglePush}>{subscribed ? 'Alerts are on. Turn off' : 'Alert this device when time is up'}</button>
    {#if note}<p class="note mt-2" role="alert">{note}</p>{/if}
  {:else if support === 'needs-install'}
    <p class="note m-0">On an iPhone or iPad, tap Share, then Add to Home Screen, and open Lantern from there. Then this button appears.</p>
  {/if}
</section>

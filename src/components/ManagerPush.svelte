<script lang="ts">
  import { onMount } from 'svelte';
  import { disableManagerPush, enableManagerPush, isManagerSubscribed, pushSupport, testManagerPush, type PushSupport } from '../lib/pushClient';

  // Lets a manager allow push notifications on the device they are using. Which things they are notified about is chosen separately.
  let support = $state<PushSupport>('off');
  let on = $state(false);
  let working = $state(false);
  let note = $state('');
  onMount(async () => {
    support = await pushSupport();
    if (support === 'ready') on = await isManagerSubscribed();
  });
  async function test() {
    working = true; note = '';
    const r = await testManagerPush();
    note = r === 'sent' ? 'Test sent. If nothing shows up in a few seconds, check this app\'s notification and battery settings in Android (Settings, Apps, Lantern).'
      : r === 'limit' ? 'That is a lot of tests. Wait a few minutes and try again.' : 'The test could not be sent. Turn notifications off and on for this device, then try again.';
    working = false;
  }
  async function toggle() {
    working = true; note = '';
    if (on) {
      if (await disableManagerPush()) on = false; else note = 'That did not work. Try again.';
    } else {
      const r = await enableManagerPush();
      if (r === 'ok') on = true;
      else note = r === 'denied' ? 'Notifications are blocked for this site. Allow them in the browser or device settings, then try again.' : 'That did not work. Try again.';
    }
    working = false;
  }
</script>

{#if support === 'ready'}
  <button type="button" class="ghost small w-auto m-0" disabled={working} aria-pressed={on} onclick={toggle}>{on ? 'This device gets notifications. Turn off' : 'Allow notifications on this device'}</button>
  {#if on}<button type="button" class="ghost small w-auto m-0" disabled={working} onclick={test}>Send a test notification</button>{/if}
  {#if note}<p class="note mt-2" role="alert">{note}</p>{/if}
{:else if support === 'needs-install'}
  <p class="note m-0">On an iPhone or iPad, tap Share, then Add to Home Screen, and open Lantern from there. Then you can allow notifications.</p>
{:else if support === 'unsupported'}
  <p class="note m-0">This browser cannot receive push notifications.</p>
{/if}

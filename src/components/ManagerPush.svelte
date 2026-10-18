<script lang="ts">
  import { onMount } from 'svelte';
  import { disableManagerPush, enableManagerPush, isManagerSubscribed, pushSupport, type PushSupport } from '../lib/pushClient';

  // Lets a manager allow push notifications on the device they are using. Which things they are notified about is chosen separately.
  let support = $state<PushSupport>('off');
  let on = $state(false);
  let working = $state(false);
  let note = $state('');
  onMount(async () => {
    support = await pushSupport();
    if (support === 'ready') on = await isManagerSubscribed();
  });
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
  {#if note}<p class="note mt-2" role="alert">{note}</p>{/if}
{:else if support === 'needs-install'}
  <p class="note m-0">On an iPhone or iPad, tap Share, then Add to Home Screen, and open Lantern from there. Then you can allow notifications.</p>
{:else if support === 'unsupported'}
  <p class="note m-0">This browser cannot receive push notifications.</p>
{/if}

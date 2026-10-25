<script lang="ts">
  import FeatherIcon from './FeatherIcon.svelte';
  import type { Reward } from '../lib/choreTypes';

  /**
   * The rewards a person can get, each with its price. `free` is what they can spend now and `owned` what they have less requests
   * waiting, so a reward they could afford but for a lock says so. A reward with screen time is spent at once, so it asks twice:
   * the first tap turns the button into "Spend?", which fades back after a few seconds.
   */
  let { rewards, free, owned, holding, busy, get, size = 'text-[1.1rem]' }: {
    rewards: Reward[]; free: number; owned: number; holding: string; busy: boolean; get: (reward: Reward) => void; size?: string;
  } = $props();

  let armed = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const disarm = () => { armed = null; clearTimeout(timer); };
  $effect(() => disarm);
  function tap(r: Reward) {
    if (r.minutes === 0 || armed === r.id) { disarm(); get(r); return; }
    armed = r.id;
    clearTimeout(timer);
    timer = setTimeout(disarm, 4000);
  }
</script>

<ul class="plain-list">
  {#each rewards as r (r.id)}
    {@const short = r.cost - free}
    <li class="list-row">
      <span class="min-w-0 flex-1 [overflow-wrap:anywhere] {size} font-medium">{r.name}{#if r.minutes > 0}<span class="block"><span class="pill mt-1"><FeatherIcon name="clock" /> +{r.minutes} min<span class="sr-only"> of screen time</span></span></span>{/if}
        {#if short > 0 && holding !== '' && r.cost <= owned}<span class="note block"><FeatherIcon name="lock" /> Finish {holding} to spend your points</span>
        {:else if short > 0}<span class="note block">{short} more {short === 1 ? 'point' : 'points'} to go</span>{/if}
      </span>
      <button type="button" class="w-auto m-0 {armed === r.id ? 'danger' : ''}" disabled={busy || short > 0} onclick={() => tap(r)} onblur={() => armed === r.id && disarm()}>
        {#if armed === r.id}Spend {r.cost}?<span class="sr-only"> points on {r.name}. Tap again to confirm</span>
        {:else}<FeatherIcon name="star" /> {r.cost}<span class="sr-only"> points, {r.minutes > 0 ? 'get' : 'ask for'} {r.name}</span>{/if}
      </button>
    </li>
  {:else}
    <li class="note list-row">No rewards to ask for yet.</li>
  {/each}
</ul>

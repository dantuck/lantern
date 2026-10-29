<script lang="ts">
  import FeatherIcon from './FeatherIcon.svelte';
  import { MAX_QUANTITY, type Reward } from '../lib/choreTypes';

  /**
   * The rewards a person can get, each with its price. `free` is what they can spend now and `owned` what they have less requests
   * waiting, so a reward they could afford but for a lock says so. A reward with screen time is spent at once, so it asks twice:
   * the first tap turns the button into "Spend?", which fades back after a few seconds. Screen time can be taken several times over
   * ("2 points for 5 minutes" times 10 is 20 points for 50 minutes), with a Max button for everything they can afford.
   */
  let { rewards, free, owned, holding, busy, get, room = Infinity, size = 'text-[1.1rem]' }: {
    rewards: Reward[]; free: number; room?: number; owned: number; holding: string; busy: boolean; get: (reward: Reward, quantity: number) => void; size?: string;
  } = $props();

  let armed = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let qty = $state<Record<string, number>>({});
  const most = (r: Reward) => Math.max(1, Math.min(MAX_QUANTITY, Math.floor(free / r.cost), r.minutes > 0 ? Math.floor(room / r.minutes) : 1));
  const capped = (r: Reward) => r.minutes > 0 && room < r.minutes; // today's limit on bought screen time is used up
  const times = (r: Reward) => Math.min(qty[r.id] ?? 1, most(r)); // what they can afford can shrink after a spend
  const setTimes = (r: Reward, n: number) => { qty[r.id] = Math.max(1, Math.min(most(r), n)); disarm(); };
  const disarm = () => { armed = null; clearTimeout(timer); };
  $effect(() => disarm);
  function tap(r: Reward) {
    if (r.minutes === 0 || armed === r.id) { const n = times(r); disarm(); qty[r.id] = 1; get(r, n); return; }
    armed = r.id;
    clearTimeout(timer);
    timer = setTimeout(disarm, 4000);
  }
</script>

<ul class="plain-list">
  {#each rewards as r (r.id)}
    {@const short = r.cost - free}
    {@const max = most(r)}
    {@const atLimit = capped(r)}
    {@const n = Math.min(qty[r.id] ?? 1, max)}
    {@const stepper = r.minutes > 0 && max > 1 && short <= 0 && !atLimit}
    <li class="list-row flex-wrap">
      <span class="min-w-0 flex-1 [overflow-wrap:anywhere] {size} font-medium">{r.name}{#if r.description}<span class="note block font-normal">{r.description}</span>{/if}{#if r.minutes > 0 && !stepper}<span class="block"><span class="pill mt-1"><FeatherIcon name="clock" /> +{r.minutes * n} min<span class="sr-only"> of screen time</span></span></span>{/if}
        {#if short > 0 && holding !== '' && r.cost <= owned}<span class="note block"><FeatherIcon name="lock" /> Finish {holding} to spend your points</span>
        {:else if short > 0}<span class="note block">{short} more {short === 1 ? 'point' : 'points'} to go</span>
        {:else if atLimit}<span class="note block"><FeatherIcon name="clock" /> That is all the screen time you can get today</span>{/if}
      </span>
      <button type="button" class="w-auto m-0 {armed === r.id ? 'danger' : ''}" disabled={busy || short > 0 || atLimit} onclick={() => tap(r)} onblur={() => armed === r.id && disarm()}>
        {#if armed === r.id}Spend {r.cost * n}?<span class="sr-only"> points on {r.name}. Tap again to confirm</span>
        {:else}<FeatherIcon name="star" /> {r.cost * n}<span class="sr-only"> points, {r.minutes > 0 ? 'get' : 'ask for'} {r.name}</span>{/if}
      </button>
      {#if stepper}
        <span class="basis-full flex flex-wrap items-center gap-2 -mt-1 pb-1" role="group" aria-label={`How much ${r.name} do you want?`}>
          <button type="button" class="stepper-btn [&&]:size-11 [&&]:min-h-11 [&&]:w-11 rounded-full text-[1.4rem]" disabled={busy || n <= 1} aria-label="Less" onclick={() => setTimes(r, n - 1)}>&minus;</button>
          <span class="min-w-[4.5rem] text-center text-[1.25rem] font-bold tabular-nums whitespace-nowrap"><FeatherIcon name="clock" /> {r.minutes * n} min</span>
          <button type="button" class="stepper-btn [&&]:size-11 [&&]:min-h-11 [&&]:w-11 rounded-full text-[1.4rem]" disabled={busy || n >= max} aria-label="More" onclick={() => setTimes(r, n + 1)}>+</button>
          <button type="button" class="stepper-btn [&&]:min-h-11 [&&]:px-4 rounded-full text-[.95rem] font-semibold whitespace-nowrap" disabled={busy || n >= max} onclick={() => setTimes(r, max)}>All I can</button>
        </span>
      {/if}
    </li>
  {:else}
    <li class="note list-row">No rewards to ask for yet.</li>
  {/each}
</ul>

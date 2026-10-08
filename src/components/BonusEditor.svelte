<script lang="ts">
  import Stepper from './Stepper.svelte';
  import { PERIODS, PERIOD_LABEL, type Period } from '../lib/choreTypes';

  /** The all-done bonus for each time of day: what a person earns for finishing every chore in that part of the day. */
  let { person, name, bonuses, send, class: cls = '' }: {
    person: string; name: string; bonuses: Record<Period, number>; send: (payload: Record<string, unknown>) => Promise<boolean>; class?: string;
  } = $props();
</script>

<div class="grid gap-x-8 gap-y-2 text-[.9rem] min-[30rem]:grid-cols-2 {cls}" role="group" aria-label={`All-done bonus for ${name}`}>
  <span class="font-semibold min-[30rem]:col-span-2">All-done bonus</span>
  {#each PERIODS as p (p)}
    <div class="flex items-center justify-between gap-3 m-0 font-medium"><span>{PERIOD_LABEL[p]}</span><Stepper class="w-40" value={bonuses[p]} min={0} max={1000} label={`${PERIOD_LABEL[p]} all-done bonus for ${name}`} onchange={(n) => send({ action: 'bonus_set', person, period: p, bonus: n })} /></div>
  {/each}
</div>

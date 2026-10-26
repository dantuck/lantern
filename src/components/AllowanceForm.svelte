<script lang="ts">
  import Stepper from './Stepper.svelte';
  import type { Allowance, BuyCap } from '../lib/choreTypes';

  /** One person's daily screen time: minutes a day, optionally different on weekends. Zero removes it. */
  let { person, allowance, buyCap, busy, send }: { person: string; allowance: Allowance | undefined; buyCap: BuyCap | undefined; busy: boolean; send: (payload: Record<string, unknown>) => Promise<boolean> } = $props();

  let daily = $state(0);
  let weekend = $state(0);
  let split = $state(false); // weekends get their own allowance
  $effect(() => { daily = allowance?.weekday ?? 0; split = allowance?.weekend != null; weekend = allowance?.weekend ?? allowance?.weekday ?? 0; }); // follows what was saved
  let cap = $state(0);
  $effect(() => { cap = buyCap?.limit ?? 0; });
  async function saveCap(e: SubmitEvent) {
    e.preventDefault();
    await send({ action: 'buy_cap_set', person, minutes: Number(cap) || 0 });
  }
  async function save(e: SubmitEvent) {
    e.preventDefault();
    await send({ action: 'allowance_set', person, weekday: Number(daily) || 0, weekend: split ? Number(weekend) || 0 : null });
  }
</script>

<form class="flex flex-wrap items-end gap-x-[.9rem] gap-y-[.6rem]" onsubmit={save}>
  <div class="grid gap-1">
    <span class="text-[.85rem] font-semibold text-muted">{split ? 'Weekdays' : 'Minutes a day'}</span>
    <Stepper class="w-[9.75rem]" bind:value={daily} min={0} max={1440} step={5} label={split ? 'Weekday minutes' : 'Minutes a day'} />
  </div>
  {#if split}
    <div class="grid gap-1">
      <span class="text-[.85rem] font-semibold text-muted">Weekends</span>
      <Stepper class="w-[9.75rem]" bind:value={weekend} min={0} max={1440} step={5} label="Weekend minutes" />
    </div>
  {/if}
  <button type="submit" class="small" disabled={busy}>Save</button>
  <label class="flex-[1_1_100%] flex items-center gap-2 text-[.9rem] font-medium text-fg"><input class="w-auto m-0" type="checkbox" bind:checked={split} onchange={() => { if (split) weekend = daily; }} /> Different on weekends</label>
</form>

<form class="flex flex-wrap items-end gap-x-[.9rem] gap-y-[.6rem] mt-3" onsubmit={saveCap}>
  <div class="grid gap-1">
    <span class="text-[.85rem] font-semibold text-muted">Most they can buy a day (0 for no limit)</span>
    <Stepper class="w-[9.75rem]" bind:value={cap} min={0} max={1440} step={5} label="Most minutes of screen time they can buy with points in a day" />
  </div>
  <button type="submit" class="small" disabled={busy}>Save</button>
  {#if buyCap}<span class="note flex-[1_1_100%] m-0">{buyCap.bought} of {buyCap.limit} minutes bought today.</span>{/if}
</form>

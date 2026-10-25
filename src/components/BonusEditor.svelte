<script lang="ts">
  import FeatherIcon from './FeatherIcon.svelte';
  import Stepper from './Stepper.svelte';
  import { PERIOD_LABEL, type Period } from '../lib/choreTypes';

  /** The all-done bonus for one time of day: what a person earns for finishing every chore in it. A pill until "Edit" is tapped. */
  let { person, name, period, bonus, busy = false, send, labels = PERIOD_LABEL }: {
    labels?: Record<Period, string>; person: string; name: string; period: Period; bonus: number; busy?: boolean; send: (payload: Record<string, unknown>) => Promise<boolean>;
  } = $props();

  let draft = $state<number | null>(null);
  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (draft !== null && (await send({ action: 'bonus_set', person, period, bonus: draft }))) draft = null;
  }
</script>

{#if draft !== null}
  <form class="flex flex-wrap items-end gap-2" onsubmit={save}>
    <Stepper caption="All-done bonus" class="w-40" bind:value={draft} min={0} max={1000} label={`${labels[period]} all-done bonus for ${name}`} />
    <button type="submit" class="small" disabled={busy}>Save</button>
    <button type="button" class="ghost small" onclick={() => (draft = null)}>Cancel</button>
  </form>
{:else}
  <span class="flex flex-wrap items-center gap-2">
    {#if bonus > 0}<span class="pill"><FeatherIcon name="star" /> +{bonus} when all done</span>{/if}
    <button type="button" class="ghost small" disabled={busy} aria-label={`${bonus > 0 ? 'Edit' : 'Add'} ${labels[period]} all-done bonus for ${name}`} onclick={() => (draft = bonus)}>{bonus > 0 ? 'Edit bonus' : '+ Bonus'}</button>
  </span>
{/if}

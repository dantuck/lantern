<script lang="ts">
  import { hasDay, toggleDay, WEEKDAY_SHORT } from '../lib/choreTypes';

  /** "Repeats" on chosen weekdays, or "Just once" on a date. `subject` names the chore for screen readers ("Days for Dishes"). */
  let { once = $bindable(), days = $bindable(), date = $bindable(), subject = '', class: cls = '' }: { once: boolean; days: number; date: string; subject?: string; class?: string } = $props();

  const of = (what: string) => (subject ? `${what} for ${subject}` : what);
  /** Flips one weekday. Picking every day is the same as "every day"; the last day cannot be turned off. */
  const flipDay = (weekday: number) => { const next = toggleDay(days, weekday); if (next !== 0) days = next; };
</script>

<div class="grid gap-2 {cls}" role="group" aria-label={of('Schedule')}>
  <div class="seg-group justify-self-start max-[40rem]:justify-self-stretch">
    <button type="button" class="seg-btn" aria-pressed={!once} onclick={() => (once = false)}>Repeats</button>
    <button type="button" class="seg-btn" aria-pressed={once} onclick={() => (once = true)}>Just once</button>
  </div>
  {#if once}
    <label class="cap-field">Date <input class="m-0" type="date" bind:value={date} required aria-label={of('Date')} /></label>
  {:else}
    <div class="grid grid-cols-7 gap-1" role="group" aria-label={of('Days')}>
      {#each WEEKDAY_SHORT as d, i (i)}
        {@const on = hasDay(days, i)}
        <button type="button" class="day-chip [&&&]:w-full [&&&]:px-0" aria-pressed={on} disabled={on && days === 1 << i} onclick={() => flipDay(i)}>{d}</button>
      {/each}
    </div>
  {/if}
</div>

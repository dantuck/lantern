<script lang="ts">
  import { hasDay, MAX_EVERY_WEEKS, toggleDay, weekStart, WEEKDAY_SHORT } from '../lib/choreTypes';
  import { addDays, dayLabel } from '../lib/dates';
  import Stepper from './Stepper.svelte';

  /** "Repeats" on chosen weekdays, or "Just once" on a date. `subject` names the chore for screen readers ("Days for Dishes"). */
  let { once = $bindable(), days = $bindable(), date = $bindable(), every = $bindable(1), from = $bindable(''), untilDone = $bindable(false), keptPoints = $bindable(0), earns = true, day, subject = '', class: cls = '' }: { earns?: boolean; once: boolean; days: number; date: string; every?: number; from?: string; untilDone?: boolean; keptPoints?: number; day: string; subject?: string; class?: string } = $props();

  // "Every other week" needs to know which weeks: this one or next, or (when editing) the rotation the chore already has.
  const thisWeek = $derived(weekStart(day));
  const nextWeek = $derived(addDays(thisWeek, 7));
  const kept = $derived(from && from !== thisWeek && from !== nextWeek ? from : null);
  const EVERY = Array.from({ length: MAX_EVERY_WEEKS }, (_, i) => i + 1);
  const everyLabel = (n: number) => (n === 1 ? 'Every week' : n === 2 ? 'Every other week' : `Every ${n} weeks`);

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
    <label class="cap-field">Repeat
      <select class="m-0" bind:value={every} aria-label={of('Weeks between repeats')}>{#each EVERY as n (n)}<option value={n}>{everyLabel(n)}</option>{/each}</select></label>
    {#if every > 1}
      <label class="cap-field">Starting
        <select class="m-0" bind:value={from} aria-label={of('Which weeks')}>
          <option value={thisWeek}>This week</option>
          <option value={nextWeek}>Next week</option>
          {#if kept}<option value={kept}>Keep its weeks (from {dayLabel(kept, day)})</option>{/if}
        </select></label>
    {/if}
    <label class="flex items-center gap-2"><input class="m-0 w-auto" type="checkbox" bind:checked={untilDone} aria-label={of('Repeat until finished')} />Repeat until finished</label>
    {#if untilDone}
      {#if earns}<Stepper caption="Then each remaining day" bind:value={keptPoints} min={0} max={100} label={of('Points for each remaining day after it is finished')} />{/if}
      <p class="note m-0 text-[.85rem]">It stays on the list until it is ticked{earns ? ', which pays its points. After that it leaves the list and pays the amount above automatically for each of its remaining days that week' : ', then leaves the list for the rest of that week'}.</p>
    {/if}
  {/if}
</div>

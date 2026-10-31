<script lang="ts">
  import { flipDay } from '../lib/choreTypes';
  import DayChips from './DayChips.svelte';
  import OptionalToggle from './OptionalToggle.svelte';
  import RepeatOptions from './RepeatOptions.svelte';

  /** "Repeats" on chosen weekdays, or "Just once" on a date. `subject` names the chore for screen readers ("Days for Dishes"). */
  let { once = $bindable(), days = $bindable(), date = $bindable(), every = $bindable(1), from = $bindable(''), untilDone = $bindable(false), keptPoints = $bindable(0), optional = $bindable(false), earns = true, day, subject = '', class: cls = '' }: { earns?: boolean; once: boolean; days: number; date: string; every?: number; from?: string; untilDone?: boolean; keptPoints?: number; optional?: boolean; day: string; subject?: string; class?: string } = $props();

  const of = (what: string) => (subject ? `${what} for ${subject}` : what);
</script>

<div class="grid gap-2 {cls}" role="group" aria-label={of('Schedule')}>
  <div class="seg-group justify-self-start max-[40rem]:justify-self-stretch">
    <button type="button" class="seg-btn" aria-pressed={!once} onclick={() => (once = false)}>Repeats</button>
    <button type="button" class="seg-btn" aria-pressed={once} onclick={() => (once = true)}>Just once</button>
  </div>
  {#if once}
    <label class="cap-field">Date <input class="m-0" type="date" bind:value={date} required aria-label={of('Date')} /></label>
  {:else}
    <DayChips {days} label={of('Days')} onflip={(w) => (days = flipDay(days, w))} />
    <RepeatOptions bind:every bind:from bind:untilDone bind:keptPoints {earns} {day} {subject} />
  {/if}
  <OptionalToggle bind:optional {subject} />
</div>

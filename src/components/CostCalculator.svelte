<script lang="ts">
  import FeatherIcon from './FeatherIcon.svelte';
  import Disclosure from './Disclosure.svelte';
  import Stepper from './Stepper.svelte';
  import { ptsLabel, suggestedCost, typicalDailyPoints, type Routine } from '../lib/choreTypes';
  import type { Person } from '../lib/people';

  /** Helps a manager price a reward: by how many days of chores it should take to earn, or, for screen time, by minutes per point. */
  let { routines, people, minutes, apply, open = false }: { routines: Routine[]; people: Person[]; minutes: number; apply: (cost: number) => void; open?: boolean } = $props();

  const earners = $derived(people.map((p) => ({ p, n: typicalDailyPoints(routines.find((r) => r.person === p.id)) })).filter((e) => e.n > 0));
  let who = $state(''); // a person id, or '' for the household's average
  const perDay = $derived(who ? earners.find((e) => e.p.id === who)?.n ?? 0 : earners.reduce((n, e) => n + e.n, 0) / (earners.length || 1));
  // svelte-ignore state_referenced_locally
  let byTime = $state(minutes > 0); // a reward with screen time is priced by the minute
  let days = $state(1);
  let minutesPerPoint = $state(2);
  const cost = $derived(byTime ? suggestedCost({ minutes, minutesPerPoint }) : suggestedCost({ perDay, days }));
</script>

<Disclosure summary="Help me pick a cost" {open}>
  <div class="grid gap-3 mt-2">
    <div class="seg-group justify-self-start max-[40rem]:justify-self-stretch" role="group" aria-label="Price by">
      <button type="button" class="seg-btn" aria-pressed={!byTime} onclick={() => (byTime = false)}>By effort</button>
      <button type="button" class="seg-btn" aria-pressed={byTime} onclick={() => (byTime = true)}>By screen time</button>
    </div>
    {#if byTime}
      {#if minutes <= 0}<p class="note m-0">Set the screen time above first.</p>{/if}
      <Stepper caption="Minutes for each point" bind:value={minutesPerPoint} min={1} max={60} label="Minutes of screen time for each point" />
    {:else if earners.length === 0}
      <p class="note m-0">Give someone chores with points first, then this can work out how long a reward takes to earn.</p>
    {:else}
      <label class="cap-field">Based on
        <select class="m-0" bind:value={who} aria-label="Whose points to go by">
          <option value="">Everyone on average</option>
          {#each earners as e (e.p.id)}<option value={e.p.id}>{e.p.name}</option>{/each}
        </select>
      </label>
      <p class="note m-0">They earn about {ptsLabel(Math.round(perDay))} on a typical day.</p>
      <Stepper caption="Days of chores to earn it" bind:value={days} min={1} max={60} label="Days of chores to earn it" />
    {/if}
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span><strong class="text-[1.1rem]"><FeatherIcon name="star" /> {ptsLabel(cost)}</strong>{#if !byTime && earners.length > 0}<span class="note"> · about {days} {days === 1 ? 'day' : 'days'} of chores</span>{/if}</span>
      <button type="button" class="small" disabled={byTime ? minutes <= 0 : earners.length === 0} onclick={() => apply(cost)}>Use this cost</button>
    </div>
  </div>
</Disclosure>

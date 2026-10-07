<script lang="ts">
  import Stepper from './Stepper.svelte';
  import { PERIODS, PERIOD_LABEL, WEEKDAYS_MASK, WEEKENDS_MASK, type Period } from '../lib/choreTypes';

  /** The form for one new chore: what it is, what it is worth, when in the day, and which days. */
  let { person, day, busy, send }: { person: string | null; day: string; busy: boolean; send: (payload: Record<string, unknown>) => Promise<boolean> } = $props();

  type When = 'every' | 'weekdays' | 'weekends' | 'once';
  let title = $state('');
  let points = $state(1);
  let period = $state<Period>('any');
  let when = $state<When>('every');
  // svelte-ignore state_referenced_locally
  let date = $state(day);

  const DAYS = { every: null, weekdays: WEEKDAYS_MASK, weekends: WEEKENDS_MASK }; // a null mask is every day

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const schedule = when === 'once' ? { days: null, onceDate: date } : { days: DAYS[when], onceDate: null };
    if (await send({ action: 'item_add', person, title: t, points: Number(points) || 0, period, ...schedule })) title = '';
  }
</script>

<form class="grid grid-cols-2 gap-2 my-3 p-3 rounded-[var(--radius-sm)] border border-dashed border-line min-[40rem]:flex min-[40rem]:flex-wrap min-[40rem]:items-end" onsubmit={submit}>
  <input class="m-0 col-span-2 min-[40rem]:flex-[1_1_14rem]" bind:value={title} maxlength="80" placeholder="Add a chore" aria-label="New chore" autocomplete="off" />
  <Stepper caption="Points" class="col-span-2 min-[40rem]:col-auto min-[40rem]:w-[9.75rem]" bind:value={points} min={0} max={100} label="Points" />
  <label class="cap-field">Time of day <select class="m-0 min-[40rem]:w-auto" bind:value={period} aria-label="Time of day">{#each PERIODS as p (p)}<option value={p}>{PERIOD_LABEL[p]}</option>{/each}</select></label>
  <label class="cap-field {when === 'once' ? '' : 'col-span-2'} min-[40rem]:col-auto">Repeats <select class="m-0 min-[40rem]:w-auto" bind:value={when} aria-label="Repeats">
    <option value="every">Every day</option><option value="weekdays">Weekdays</option><option value="weekends">Weekends</option><option value="once">Just once</option>
  </select></label>
  {#if when === 'once'}<label class="cap-field">Date <input class="m-0" type="date" bind:value={date} required aria-label="Date" /></label>{/if}
  <button class="small col-span-2 [&&&]:w-full min-[40rem]:col-auto min-[40rem]:[&&&]:w-auto" type="submit" disabled={busy || !title.trim()}>Add chore</button>
</form>

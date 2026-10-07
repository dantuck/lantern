<script lang="ts">
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

<form class="flex flex-wrap items-center gap-2 my-2" onsubmit={submit}>
  <input class="field flex-[1_1_12rem]" bind:value={title} maxlength="80" placeholder="Add a chore" aria-label="New chore" autocomplete="off" />
  <input class="m-0 flex-[0_0_5.5rem] w-[5.5rem]" type="number" min="0" max="100" bind:value={points} aria-label="Points" />
  <select class="field" bind:value={period} aria-label="Time of day">{#each PERIODS as p (p)}<option value={p}>{PERIOD_LABEL[p]}</option>{/each}</select>
  <select class="field" bind:value={when} aria-label="Repeats">
    <option value="every">Every day</option><option value="weekdays">Weekdays</option><option value="weekends">Weekends</option><option value="once">Just once</option>
  </select>
  {#if when === 'once'}<input class="field" type="date" bind:value={date} required aria-label="Date" />{/if}
  <button class="small" type="submit" disabled={busy || !title.trim()}>Add</button>
</form>

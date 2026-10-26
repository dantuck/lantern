<script lang="ts">
  import { EVERY_DAY, normalizeDays, PERIODS, weekStart, PERIOD_LABEL, type ChoreItem, type Period } from '../lib/choreTypes';
  import ConfirmButton from './ConfirmButton.svelte';
  import ScheduleFields from './ScheduleFields.svelte';
  import Stepper from './Stepper.svelte';

  /** The edit form for one chore (title, points, time of day, schedule). Nothing is saved until "Save"; the parent supplies the card around it. */
  let { c, day, busy, send, onremove, onclose, labels = PERIOD_LABEL, earns = true }: { earns?: boolean; c: ChoreItem; day: string; labels?: Record<Period, string>; busy: boolean; send: (payload: Record<string, unknown>) => Promise<boolean>; onremove: () => void; onclose: () => void } = $props();

  // A draft of the chore as it was when editing started; the card only ever edits one chore, so reading `c` once is right.
  // svelte-ignore state_referenced_locally
  let draft = $state({ title: c.title, points: c.points, period: c.period as Period, days: c.days ?? EVERY_DAY, once: c.onceDate !== null, date: c.onceDate ?? day, every: c.everyWeeks, from: c.weekAnchor ?? weekStart(day), untilDone: c.untilDone, kept: c.keptPoints });

  const schedule = $derived(draft.once ? { days: null, onceDate: draft.date } : { days: normalizeDays(draft.days), onceDate: null, everyWeeks: draft.every, weekAnchor: draft.every > 1 ? draft.from : null, untilDone: draft.untilDone, keptPoints: draft.kept });

  async function save(e: SubmitEvent) {
    e.preventDefault();
    const title = draft.title.trim();
    if (!title) return;
    if (await send({ action: 'item_update', id: c.id, title, points: draft.points, period: draft.period, ...schedule })) onclose();
  }
</script>

<form class="grid gap-3" onsubmit={save}>
  <input class="m-0" bind:value={draft.title} maxlength="80" required aria-label="Chore" autocomplete="off" />
  <div class="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-2">
    <Stepper caption="Points" class="w-[9.75rem]" bind:value={draft.points} min={0} max={100} label={`Points for ${c.title}`} />
    <label class="cap-field">Time of day
      <select class="m-0" bind:value={draft.period} aria-label={`Time of day for ${c.title}`}>
        {#each PERIODS as p (p)}<option value={p}>{labels[p]}</option>{/each}
      </select></label>
  </div>
  <ScheduleFields class="text-[.85rem]" subject={c.title} {day} bind:once={draft.once} bind:days={draft.days} bind:date={draft.date} bind:every={draft.every} bind:from={draft.from} bind:untilDone={draft.untilDone} bind:keptPoints={draft.kept} {earns} />
  <div class="flex flex-wrap items-center justify-between gap-2">
    <ConfirmButton ariaLabel={`Remove ${c.title}`} disabled={busy} onconfirm={onremove} />
    <span class="flex gap-2">
      <button type="button" class="ghost small" onclick={onclose}>Cancel</button>
      <button type="submit" class="small" disabled={busy || !draft.title.trim() || (draft.once && !draft.date)}>Save</button>
    </span>
  </div>
</form>

<script lang="ts">
  import { describeSchedule, EVERY_DAY, hasDay, normalizeDays, PERIODS, PERIOD_LABEL, toggleDay, WEEKDAY_SHORT, type ChoreItem } from '../lib/choreTypes';
  import ConfirmButton from './ConfirmButton.svelte';
  import Stepper from './Stepper.svelte';
  import { keep, text } from '../lib/choreClient';

  /** The edit rows for one chore (title, points, time of day, schedule, remove). The parent supplies the card around them. */
  let { c, day, busy, send, onremove }: { c: ChoreItem; day: string; busy: boolean; send: (payload: Record<string, unknown>) => Promise<boolean>; onremove?: () => void } = $props();

  /** Flips one weekday on a chore. Picking every day is the same as "every day"; the last day cannot be turned off. */
  const flipDay = (weekday: number) => {
    const next = toggleDay(c.days ?? EVERY_DAY, weekday);
    return next === 0 ? Promise.resolve(false) : send({ action: 'item_update', id: c.id, days: normalizeDays(next) });
  };
</script>

<div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
  <input class="m-0" value={c.title} data-v={c.title} maxlength="80" aria-label="Chore" onchange={(e) => keep(e, !!text(e) && send({ action: 'item_update', id: c.id, title: text(e) }))} />
  <ConfirmButton ariaLabel={`Remove ${c.title}`} disabled={busy} onconfirm={async () => { if (await send({ action: 'item_remove', id: c.id })) onremove?.(); }} />
</div>
<div class="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-2">
  <Stepper caption="Points" class="w-[9.75rem]" value={c.points} min={0} max={100} label={`Points for ${c.title}`} onchange={(n) => send({ action: 'item_update', id: c.id, points: n })} />
  <label class="cap-field">Time of day
    <select class="m-0" value={c.period} data-v={c.period} aria-label={`Time of day for ${c.title}`} onchange={(e) => keep(e, send({ action: 'item_update', id: c.id, period: e.currentTarget.value }))}>
      {#each PERIODS as p (p)}<option value={p}>{PERIOD_LABEL[p]}</option>{/each}
    </select></label>
</div>
<div class="grid gap-2 text-[.85rem]" role="group" aria-label={`Days for ${c.title}`}>
  {#if c.onceDate !== null}
    <div class="flex flex-wrap items-center gap-2">
      <span class="font-semibold">Once on</span>
      <input class="field flex-[1_1_9rem]" type="date" value={c.onceDate} data-v={c.onceDate} aria-label={`Date for ${c.title}`} onchange={(e) => keep(e, !!e.currentTarget.value && send({ action: 'item_update', id: c.id, onceDate: e.currentTarget.value }))} />
      <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'item_update', id: c.id, onceDate: null, days: null })}>Repeat instead</button>
    </div>
  {:else}
    <div class="grid grid-cols-7 gap-1">
      {#each WEEKDAY_SHORT as d, i (i)}
        {@const on = hasDay(c.days ?? EVERY_DAY, i)}
        <button type="button" class="day-chip [&&&]:w-full [&&&]:px-0" aria-pressed={on} disabled={busy || (on && (c.days ?? EVERY_DAY) === 1 << i)} onclick={() => flipDay(i)}>{d}</button>
      {/each}
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="muted">{describeSchedule(c)}</span>
      <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'item_update', id: c.id, onceDate: day })}>Just once</button>
    </div>
  {/if}
</div>

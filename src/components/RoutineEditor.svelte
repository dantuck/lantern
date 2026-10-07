<script lang="ts">
  import AddChore from './AddChore.svelte';
  import { describeSchedule, EVERY_DAY, hasDay, normalizeDays, PERIODS, PERIOD_LABEL, sections, toggleDay, WEEKDAY_SHORT, type ChoreItem, type Period } from '../lib/choreTypes';
  import ConfirmButton from './ConfirmButton.svelte';
  import Stepper from './Stepper.svelte';
  import { keep, text } from '../lib/choreClient';

  /** Everything a manager changes about one person's routine: the bonuses, each chore, and a form to add more. */
  let { person, name, items, bonuses, day, busy, send }: {
    person: string | null; name: string; items: ChoreItem[]; bonuses: Record<Period, number>; day: string; busy: boolean; send: (payload: Record<string, unknown>) => Promise<boolean>;
  } = $props();

  /** Flips one weekday on a chore. Picking every day is the same as "every day"; the last day cannot be turned off. */
  const flipDay = (c: ChoreItem, weekday: number) => {
    const next = toggleDay(c.days ?? EVERY_DAY, weekday);
    return next === 0 ? Promise.resolve(false) : send({ action: 'item_update', id: c.id, days: normalizeDays(next) });
  };
</script>

{#if person !== null}
  <div class="grid grid-cols-2 gap-x-3 gap-y-2 mt-[.8rem] text-[.9rem] min-[40rem]:flex min-[40rem]:flex-wrap min-[40rem]:items-center" role="group" aria-label={`All-done bonus for ${name}`}>
    <span class="when col-span-2 font-semibold">All-done bonus</span>
    {#each PERIODS as p (p)}
      <div class="flex items-center justify-between gap-3 m-0 font-medium col-span-2 min-[40rem]:col-span-1"><span>{PERIOD_LABEL[p]}</span><Stepper class="w-40" value={bonuses[p]} min={0} max={1000} label={`${PERIOD_LABEL[p]} all-done bonus for ${name}`} onchange={(n) => send({ action: 'bonus_set', person, period: p, bonus: n })} /></div>
    {/each}
  </div>
{/if}

{#each sections(items) as sec (sec.period)}
  <h4 class="mt-[1.1rem] mb-[.4rem] mx-0 text-[.95rem]">{PERIOD_LABEL[sec.period]}</h4>
  <ul class="list-none m-0 p-0">
    {#each sec.items as c (c.id)}
      <li class="edit-card">
        <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
          <input class="m-0" value={c.title} data-v={c.title} maxlength="80" aria-label="Chore" onchange={(e) => keep(e, !!text(e) && send({ action: 'item_update', id: c.id, title: text(e) }))} />
          <ConfirmButton ariaLabel={`Remove ${c.title}`} disabled={busy} onconfirm={() => send({ action: 'item_remove', id: c.id })} />
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
                <button type="button" class="day-chip [&&&]:w-full [&&&]:px-0" aria-pressed={on} disabled={busy || (on && (c.days ?? EVERY_DAY) === 1 << i)} onclick={() => flipDay(c, i)}>{d}</button>
              {/each}
            </div>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="muted">{describeSchedule(c)}</span>
              <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'item_update', id: c.id, onceDate: day })}>Just once</button>
            </div>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
{/each}

<AddChore {person} {day} {busy} {send} />

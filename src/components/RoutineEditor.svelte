<script lang="ts">
  import AddChore from './AddChore.svelte';
  import { describeSchedule, EVERY_DAY, hasDay, normalizeDays, PERIODS, PERIOD_LABEL, sections, toggleDay, WEEKDAY_SHORT, type ChoreItem, type Period } from '../lib/choreTypes';
  import { num, text } from '../lib/choreClient';

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
  <div class="flex flex-wrap items-center gap-x-[.9rem] gap-y-[.4rem] mt-[.8rem] text-[.9rem]" role="group" aria-label={`All-done bonus for ${name}`}>
    <span class="when">All-done bonus:</span>
    {#each PERIODS as p (p)}
      <label class="inline-flex items-center gap-[.35rem] font-medium">{PERIOD_LABEL[p]} <input class="flex-none w-[4.5rem] m-0" type="number" min="0" max="1000" value={bonuses[p]} onchange={(e) => send({ action: 'bonus_set', person, period: p, bonus: num(e) })} /></label>
    {/each}
  </div>
{/if}

{#each sections(items) as sec (sec.period)}
  <h4 class="mt-[1.1rem] mb-[.4rem] mx-0 text-[.95rem]">{PERIOD_LABEL[sec.period]}</h4>
  <ul class="list-none m-0 p-0">
    {#each sec.items as c (c.id)}
      <li class="row-item">
        <input class="fill-in" value={c.title} maxlength="80" aria-label="Chore" onchange={(e) => text(e) && send({ action: 'item_update', id: c.id, title: text(e) })} />
        <input class="num-in" type="number" min="0" max="100" value={c.points} aria-label={`Points for ${c.title}`} onchange={(e) => send({ action: 'item_update', id: c.id, points: num(e) })} />
        <select class="field" value={c.period} aria-label={`Time of day for ${c.title}`} onchange={(e) => send({ action: 'item_update', id: c.id, period: e.currentTarget.value })}>
          {#each PERIODS as p (p)}<option value={p}>{PERIOD_LABEL[p]}</option>{/each}
        </select>
        <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'item_remove', id: c.id })} aria-label={`Remove ${c.title}`}>Remove</button>
        <div class="flex-[1_1_100%] flex flex-wrap items-center gap-[.35rem] -mt-[.1rem] mb-[.6rem] text-[.85rem]" role="group" aria-label={`Days for ${c.title}`}>
          {#if c.onceDate !== null}
            <span class="font-semibold mr-[.15rem]">Once on</span>
            <input class="field" type="date" value={c.onceDate} aria-label={`Date for ${c.title}`} onchange={(e) => e.currentTarget.value && send({ action: 'item_update', id: c.id, onceDate: e.currentTarget.value })} />
            <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'item_update', id: c.id, onceDate: null, days: null })}>Repeat instead</button>
          {:else}
            <span class="font-semibold mr-[.15rem]">Days:</span>
            {#each WEEKDAY_SHORT as d, i (i)}
              {@const on = hasDay(c.days ?? EVERY_DAY, i)}
              <button type="button" class="day-chip" aria-pressed={on} disabled={busy || (on && (c.days ?? EVERY_DAY) === 1 << i)} onclick={() => flipDay(c, i)}>{d}</button>
            {/each}
            <span class="muted text-[.9rem] font-normal">{describeSchedule(c)}</span>
            <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'item_update', id: c.id, onceDate: day })}>Just once</button>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
{/each}

<AddChore {person} {day} {busy} {send} />

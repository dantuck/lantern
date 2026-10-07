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
  <div class="bonuses" role="group" aria-label={`All-done bonus for ${name}`}>
    <span class="when">All-done bonus:</span>
    {#each PERIODS as p (p)}
      <label>{PERIOD_LABEL[p]} <input class="pts" type="number" min="0" max="1000" value={bonuses[p]} onchange={(e) => send({ action: 'bonus_set', person, period: p, bonus: num(e) })} /></label>
    {/each}
  </div>
{/if}

{#each sections(items) as sec (sec.period)}
  <h4>{PERIOD_LABEL[sec.period]}</h4>
  <ul class="rows">
    {#each sec.items as c (c.id)}
      <li>
        <input class="grow" value={c.title} maxlength="80" aria-label="Chore" onchange={(e) => text(e) && send({ action: 'item_update', id: c.id, title: text(e) })} />
        <input class="pts" type="number" min="0" max="100" value={c.points} aria-label={`Points for ${c.title}`} onchange={(e) => send({ action: 'item_update', id: c.id, points: num(e) })} />
        <select value={c.period} aria-label={`Time of day for ${c.title}`} onchange={(e) => send({ action: 'item_update', id: c.id, period: e.currentTarget.value })}>
          {#each PERIODS as p (p)}<option value={p}>{PERIOD_LABEL[p]}</option>{/each}
        </select>
        <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'item_remove', id: c.id })} aria-label={`Remove ${c.title}`}>Remove</button>
        <div class="itemdays" role="group" aria-label={`Days for ${c.title}`}>
          {#if c.onceDate !== null}
            <span class="when">Once on</span>
            <input type="date" value={c.onceDate} aria-label={`Date for ${c.title}`} onchange={(e) => e.currentTarget.value && send({ action: 'item_update', id: c.id, onceDate: e.currentTarget.value })} />
            <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'item_update', id: c.id, onceDate: null, days: null })}>Repeat instead</button>
          {:else}
            <span class="when">Days:</span>
            {#each WEEKDAY_SHORT as d, i (i)}
              {@const on = hasDay(c.days ?? EVERY_DAY, i)}
              <button type="button" class="chip" aria-pressed={on} disabled={busy || (on && (c.days ?? EVERY_DAY) === 1 << i)} onclick={() => flipDay(c, i)}>{d}</button>
            {/each}
            <span class="muted">{describeSchedule(c)}</span>
            <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'item_update', id: c.id, onceDate: day })}>Just once</button>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
{/each}

<AddChore {person} {day} {busy} {send} />

<style>
  h4 { margin: 1.1rem 0 .4rem; font-size: .95rem; }
  .rows { list-style: none; margin: 0; padding: 0; }
  .rows li { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin-bottom: .5rem; }
  .rows input, .rows select { margin: 0; }
  .rows .grow { flex: 1 1 12rem; }
  .rows .pts { flex: 0 0 5.5rem; width: 5.5rem; }
  .rows select { width: auto; }
  .small { width: auto; margin: 0; padding: .3rem .8rem; font-size: .85rem; }
  .muted { font-size: .9rem; font-weight: 400; }
  .bonuses { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem .9rem; margin: .8rem 0 0; font-size: .9rem; }
  .bonuses label { display: inline-flex; align-items: center; gap: .35rem; font-weight: 500; }
  .bonuses .pts { flex: none; width: 4.5rem; margin: 0; }
  .itemdays { flex: 1 1 100%; display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; margin: -.1rem 0 .6rem; font-size: .85rem; }
  .itemdays input[type="date"] { width: auto; margin: 0; }
  .itemdays .when { font-weight: 600; margin-right: .15rem; }
  .itemdays .chip { width: auto; margin: 0; padding: .3rem .65rem; border-radius: 999px; background: transparent; color: inherit; border: 1.5px solid var(--border); box-shadow: none; font-size: .85rem; }
  .itemdays .chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
  .itemdays .chip:disabled:not([aria-pressed="true"]) { opacity: .35; text-decoration: line-through; }
  @media (pointer: coarse) { .small, .itemdays .chip { min-height: 2.75rem; } }
</style>

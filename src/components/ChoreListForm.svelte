<script lang="ts" module>
  import type { Period } from '../lib/choreTypes';
  export interface ListFields {
    name: string; person: string | null; period: Period; days: number; onceDate: string | null; bonus: number;
    /** Only when creating: the chores to start the list with. */
    items?: { title: string; points: number }[];
  }
</script>

<script lang="ts">
  import { EVERY_DAY, hasDay, PERIODS, PERIOD_LABEL, toggleDay, WEEKDAY_SHORT, WEEKDAYS_MASK, WEEKENDS_MASK, type ChoreList } from '../lib/choreTypes';
  import type { Person } from '../lib/people';

  let { list, people, day, busy, label, onsave }: {
    list?: ChoreList; people: Person[]; day: string; busy: boolean; label: string; onsave: (f: ListFields) => Promise<boolean>;
  } = $props();

  const uid = $props.id();

  let name = $state(list?.name ?? '');
  let person = $state(list?.person ?? '');
  let period = $state<Period>(list?.period ?? 'any');
  let days = $state(list?.days ?? EVERY_DAY);
  let once = $state(list?.onceDate != null);
  let onceDate = $state(list?.onceDate ?? day);
  let bonus = $state(list?.bonus ?? 0);
  let lines = $state('');
  let each = $state(1);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const fields: ListFields = { name: name.trim(), person: person || null, period, days: once ? EVERY_DAY : days, onceDate: once ? onceDate : null, bonus: Number(bonus) || 0 };
    if (!list) fields.items = lines.split('\n').map((t) => t.trim()).filter(Boolean).slice(0, 30).map((title) => ({ title: title.slice(0, 80), points: Number(each) || 0 }));
    if ((await onsave(fields)) && !list) { name = ''; lines = ''; }
  }
</script>

<form class="listform" onsubmit={submit}>
  <div class="fields">
    <div class="grow"><label for="{uid}-name">Name</label><input id="{uid}-name" bind:value={name} maxlength="60" required placeholder="Morning routine" autocomplete="off" /></div>
    <div><label for="{uid}-who">For</label>
      <select id="{uid}-who" bind:value={person}><option value="">Anyone (no points)</option>{#each people as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</select>
    </div>
    <div><label for="{uid}-period">Time of day</label>
      <select id="{uid}-period" bind:value={period}>{#each PERIODS as p (p)}<option value={p}>{PERIOD_LABEL[p]}</option>{/each}</select>
    </div>
    <div><label for="{uid}-bonus">All-done bonus</label><input id="{uid}-bonus" type="number" min="0" max="1000" bind:value={bonus} /></div>
  </div>

  <fieldset class="when">
    <legend>Repeats</legend>
    {#if !once}
      <div class="days" role="group" aria-label="Days of the week">
        {#each WEEKDAY_SHORT as d, i (i)}
          <button type="button" class="chip" aria-pressed={hasDay(days, i)} onclick={() => (days = toggleDay(days, i))}>{d}</button>
        {/each}
      </div>
      <div class="presets">
        <button type="button" class="ghost small" onclick={() => (days = EVERY_DAY)}>Every day</button>
        <button type="button" class="ghost small" onclick={() => (days = WEEKDAYS_MASK)}>Weekdays</button>
        <button type="button" class="ghost small" onclick={() => (days = WEEKENDS_MASK)}>Weekends</button>
      </div>
    {/if}
    <label class="check"><input type="checkbox" bind:checked={once} /> Just once, on <input type="date" bind:value={onceDate} disabled={!once} required={once} aria-label="Date" /></label>
    <p class="hint">The ticks reset every morning, so a routine starts fresh each day it is scheduled.</p>
  </fieldset>

  {#if !list}
    <div class="fields">
      <div class="grow"><label for="{uid}-lines">Chores, one per line</label><textarea id="{uid}-lines" bind:value={lines} rows="4" placeholder={'Brush teeth\nGet dressed\nPack school bag'}></textarea></div>
      <div><label for="{uid}-each">Points each</label><input id="{uid}-each" type="number" min="0" max="100" bind:value={each} /></div>
    </div>
  {/if}
  <button type="submit" disabled={busy || !name.trim() || (!once && days === 0)}>{label}</button>
</form>

<style>
  .fields { display: flex; flex-wrap: wrap; gap: .75rem; align-items: end; margin-bottom: .85rem; }
  .fields > div { flex: 0 1 11rem; }
  .fields > .grow { flex: 1 1 14rem; }
  .when { border: 1px solid var(--border); border-radius: var(--radius); padding: .6rem .85rem .85rem; margin: 0 0 .85rem; }
  .when legend { padding: 0 .35rem; font-weight: 600; font-size: .9rem; }
  .days, .presets { display: flex; flex-wrap: wrap; gap: .4rem; margin-bottom: .5rem; }
  .chip { width: auto; margin: 0; padding: .45rem .8rem; border-radius: 999px; background: transparent; color: inherit; border: 1.5px solid var(--border); box-shadow: none; font-size: .9rem; }
  .chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
  .small { width: auto; margin: 0; padding: .3rem .8rem; font-size: .85rem; }
  .check { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; font-weight: 500; }
  .check input[type="date"] { width: auto; margin: 0; }
  .check input[type="checkbox"] { width: auto; margin: 0; }
  .hint { margin: .5rem 0 0; font-size: .85rem; color: var(--muted); }
  textarea { width: 100%; }
  button[type="submit"] { width: auto; margin: 0; padding: .7rem 1.5rem; }
</style>

<script lang="ts">
  import { addDays, dayKey, formatDay, formatTime, keyOf, parseKey } from '../../lib/dates';
  import { groupByDay, monthGrid } from './agenda';
  import type { CalEvent } from './types';

  let { events, timeZone, locale, nowMs, windowEnd }: {
    events: CalEvent[]; timeZone: string; locale: string; nowMs: number; windowEnd: number;
  } = $props();

  const todayKey = dayKey(nowMs, timeZone);
  const lastKey = dayKey(windowEnd, timeZone);
  let year = $state(parseKey(todayKey).y);
  let month = $state(parseKey(todayKey).m);
  let selected = $state(todayKey);

  const grid = $derived(monthGrid(year, month));
  const days = $derived(groupByDay(events, timeZone, grid[0]!, 42));
  const byKey = $derived(new Map(days.map((d) => [d.key, d.events])));
  const selectedEvents = $derived(byKey.get(selected) ?? []);

  const firstOfMonth = $derived(keyOf(year, month, 1));
  const isCurrentMonth = $derived(firstOfMonth === `${todayKey.slice(0, 8)}01`);
  const atEnd = $derived(addDays(firstOfMonth, 32).slice(0, 8) + '01' > lastKey);

  const fmt = (opts: Intl.DateTimeFormatOptions, key: string) => formatDay(key, opts, locale);
  const weekdays = Array.from({ length: 7 }, (_, i) => fmt({ weekday: 'short' }, addDays('2023-01-01', i)));

  function go(delta: number) {
    const idx = year * 12 + (month - 1) + delta;
    year = Math.floor(idx / 12);
    month = (idx % 12) + 1;
    selected = isCurrentMonth ? todayKey : firstOfMonth;
  }
</script>

<div class="month">
  <header class="bar">
    <button type="button" class="ghost" onclick={() => go(-1)} disabled={isCurrentMonth} aria-label="Previous month">‹</button>
    <h2>{fmt({ month: 'long', year: 'numeric' }, firstOfMonth)}</h2>
    <button type="button" class="ghost" onclick={() => go(1)} disabled={atEnd} aria-label="Next month">›</button>
  </header>

  <div class="grid7 head" aria-hidden="true">{#each weekdays as w}<span>{w}</span>{/each}</div>
  <div class="grid7">
    {#each grid as key (key)}
      {@const evs = byKey.get(key) ?? []}
      <button
        type="button"
        class="cell"
        class:other={parseKey(key).m !== month}
        class:today={key === todayKey}
        class:selected={key === selected}
        aria-label={`${fmt({ weekday: 'long', month: 'long', day: 'numeric' }, key)}, ${evs.length} events`}
        aria-pressed={key === selected}
        onclick={() => (selected = key)}
      >
        <span class="num">{+key.slice(8, 10)}</span>
        {#each evs.slice(0, 2) as ev (ev.id)}<span class="chip">{ev.title}</span>{/each}
        {#if evs.length > 2}<span class="more">+{evs.length - 2}</span>{/if}
      </button>
    {/each}
  </div>

  <section class="detail" aria-live="polite">
    <h3>{fmt({ weekday: 'long', month: 'long', day: 'numeric' }, selected)}</h3>
    {#if selectedEvents.length === 0}
      <p class="muted">Nothing scheduled.</p>
    {:else}
      <ul>
        {#each selectedEvents as ev (ev.id + selected)}
          <li>
            <span class="when">{ev.allDay ? 'All day' : `${formatTime(ev.start, timeZone, locale)}–${formatTime(ev.end, timeZone, locale)}`}</span>
            <span class="what">{ev.title}{#if ev.location}{' '}<span class="muted">· {ev.location}</span>{/if}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: .75rem; }
  .bar h2 { margin: 0; font-size: 1.15rem; }
  .bar button { width: 2.25rem; padding: .25rem 0; margin: 0; font-size: 1.2rem; }
  .bar button:disabled { opacity: .35; cursor: default; }
  .grid7 { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
  .head span { text-align: center; font-size: .75rem; color: var(--muted); padding: .25rem 0; }
  .cell { display: flex; flex-direction: column; align-items: stretch; gap: 2px; min-height: 4.5rem; padding: .25rem; margin: 0;
    text-align: left; font-weight: 400; font-size: .75rem; border-radius: 6px; background: var(--card); color: var(--fg); border: 1px solid var(--border); overflow: hidden; }
  .cell.other { opacity: .45; }
  .cell.today .num { background: var(--accent); color: #fff; border-radius: 999px; padding: 0 .4rem; align-self: flex-start; }
  .cell.selected { outline: 2px solid var(--accent); outline-offset: -2px; }
  .num { font-weight: 600; font-size: .8rem; }
  .chip { background: color-mix(in srgb, var(--accent) 18%, transparent); border-radius: 3px; padding: 0 .25rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .more { color: var(--muted); }
  .detail { margin-top: 1.25rem; }
  .detail h3 { margin: 0 0 .5rem; font-size: 1rem; }
  .detail ul { list-style: none; margin: 0; padding: 0; }
  .detail li { display: flex; gap: .75rem; padding: .35rem 0; border-bottom: 1px solid var(--border); }
  .when { color: var(--muted); min-width: 8.5rem; font-variant-numeric: tabular-nums; }
  @media (max-width: 40rem) { .cell { min-height: 3.25rem; } .chip { display: none; } .more { display: none; } .when { min-width: 6.5rem; } }
</style>

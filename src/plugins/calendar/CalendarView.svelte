<script lang="ts">
  import { DAY_MS, addDays, dayKey, dayLabel, formatDay, formatTime, keyOf, parseKey, startOfDayMs } from '../../lib/dates';
  import { groupByDay, layoutDay, monthGrid, weekStartKey } from './agenda';
  import type { CalEvent } from './types';

  let { events, timeZone, locale, nowMs, windowStart, windowEnd }: {
    events: CalEvent[]; timeZone: string; locale: string; nowMs: number; windowStart: number; windowEnd: number;
  } = $props();

  type View = 'month' | 'week' | 'agenda';
  const VIEWS: { id: View; label: string }[] = [
    { id: 'month', label: 'Month' }, { id: 'week', label: 'Week' }, { id: 'agenda', label: 'Agenda' },
  ];
  const AGENDA_DAYS = 14;
  const VIEW_KEY = 'calendar-view';

  const todayKey = dayKey(nowMs, timeZone);
  const firstKey = dayKey(windowStart, timeZone);
  const lastKey = dayKey(windowEnd, timeZone);

  let view = $state<View>('month');
  let cursor = $state(todayKey); // the focused day: selected in month view, anchors every other view
  let now = $state(nowMs);

  // Remember the last view; phones start on the agenda, which reads best on a narrow screen.
  $effect(() => {
    try {
      const wanted = new URLSearchParams(location.search).get('view');
      const saved = localStorage.getItem(VIEW_KEY);
      if (VIEWS.some((v) => v.id === wanted)) view = wanted as View; // ?view=week is a shareable link
      else if (VIEWS.some((v) => v.id === saved)) view = saved as View;
      else if (matchMedia('(max-width: 40rem)').matches) view = 'agenda';
    } catch {}
    const t = setInterval(() => (now = Date.now()), 60_000);
    return () => clearInterval(t);
  });
  function setView(v: View) {
    view = v;
    try { localStorage.setItem(VIEW_KEY, v); } catch {}
  }

  const fmt = (opts: Intl.DateTimeFormatOptions, key: string) => formatDay(key, opts, locale);
  const weekdays = Array.from({ length: 7 }, (_, i) => fmt({ weekday: 'short' }, addDays('2023-01-01', i)));
  const hourLabel = (h: number) => new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone: 'UTC' }).format(Date.UTC(2023, 0, 1, h));

  const cur = $derived(parseKey(cursor));
  const firstOfMonth = $derived(keyOf(cur.y, cur.m, 1));

  /** The days a view covers, as [first day, count]. */
  function rangeFor(v: View, key: string): [string, number] {
    if (v === 'month') return [monthGrid(parseKey(key).y, parseKey(key).m)[0]!, 42];
    if (v === 'week') return [weekStartKey(key), 7];
    return [key, AGENDA_DAYS];
  }
  const range = $derived(rangeFor(view, cursor));
  const days = $derived(groupByDay(events, timeZone, range[0], range[1]));
  const byKey = $derived(new Map(days.map((d) => [d.key, d.events])));
  const agendaDays = $derived(days.filter((d) => d.events.length > 0));

  /** Where Previous/Next would land, or null when that is outside the days we have data for. */
  function step(delta: -1 | 1): string | null {
    let next: string;
    if (view === 'month') {
      const idx = cur.y * 12 + (cur.m - 1) + delta;
      next = keyOf(Math.floor(idx / 12), (idx % 12) + 1, 1);
      if (next.slice(0, 8) === todayKey.slice(0, 8)) next = todayKey;
      if (next.slice(0, 7) < firstKey.slice(0, 7) || next > lastKey) return null;
      return next;
    }
    next = addDays(cursor, delta * (view === 'week' ? 7 : AGENDA_DAYS));
    const [start, count] = rangeFor(view, next);
    if (addDays(start, count - 1) < firstKey || start > lastKey) return null;
    return next;
  }
  const prev = $derived(step(-1));
  const next = $derived(step(1));
  const go = (key: string | null) => key && (cursor = key);

  const title = $derived.by(() => {
    if (view === 'month') return fmt({ month: 'long', year: 'numeric' }, firstOfMonth);
    if (view === 'agenda') return 'Upcoming';
    const at = (key: string) => { const { y, m, d } = parseKey(key); return Date.UTC(y, m - 1, d); };
    const last = addDays(range[0], range[1] - 1);
    return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).formatRange(at(range[0]), at(last));
  });

  // --- Day detail panel (opens from a day in the month view, or a day/event in the week view) ---
  let dlg = $state<HTMLDialogElement>();
  const dayEvents = $derived(groupByDay(events, timeZone, cursor, 1)[0]!.events);
  const canPrevDay = $derived(addDays(cursor, -1) >= firstKey);
  const canNextDay = $derived(addDays(cursor, 1) <= lastKey);
  function openDay(key: string) {
    cursor = key;
    dlg?.showModal();
  }
  const dateTime = (ms: number) => new Intl.DateTimeFormat(locale, { timeZone, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(ms);
  function duration(ev: CalEvent): string {
    if (ev.allDay) return '';
    const mins = Math.round((ev.end - ev.start) / 60_000);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h >= 24) return `${Math.round(h / 24)} days`;
    return m ? `${h} hr ${m} min` : `${h} hr`;
  }
  /** First and last day an event covers, in the calendar's time zone. */
  const spanKeys = (ev: CalEvent): [string, string] =>
    ev.allDay ? [ev.startDate, ev.endDate] : [dayKey(ev.start, timeZone), dayKey(Math.max(ev.start, ev.end - 1), timeZone)];
  /** "Day 2 of 3" for events that span several days. */
  function position(ev: CalEvent, key: string): string {
    const [from, to] = spanKeys(ev);
    if (from === to) return '';
    const dayNumber = (k: string) => Math.round((Date.parse(`${k}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
    const n = dayNumber(to);
    const i = dayNumber(key);
    return `Day ${i} of ${n}`;
  }
  const detailWhen = (ev: CalEvent) => {
    if (ev.allDay) return 'All day';
    const [from, to] = spanKeys(ev);
    return from === to
      ? `${formatTime(ev.start, timeZone, locale)} – ${formatTime(ev.end, timeZone, locale)}`
      : `${dateTime(ev.start)} – ${dateTime(ev.end)}`;
  };

  const when = (ev: CalEvent) => (ev.allDay ? 'All day' : `${formatTime(ev.start, timeZone, locale)}–${formatTime(ev.end, timeZone, locale)}`);
  const placed = (key: string) => layoutDay(byKey.get(key) ?? [], startOfDayMs(key, timeZone), startOfDayMs(addDays(key, 1), timeZone));
  const allDayOf = (key: string) => (byKey.get(key) ?? []).filter((e) => e.allDay);
  const nowMinutes = $derived((now - startOfDayMs(todayKey, timeZone)) / 60_000);

  // Time grids open scrolled to "now" (today) or the morning.
  let scroller = $state<HTMLElement>();
  $effect(() => {
    if (!scroller || view !== 'week') return;
    const showsToday = range[0] <= todayKey && todayKey <= addDays(range[0], range[1] - 1);
    const minutes = showsToday ? Math.max(0, nowMinutes - 90) : 7 * 60;
    const rowPx = (scroller.querySelector<HTMLElement>('.body')?.offsetHeight ?? 0) / 24;
    scroller.scrollTop = (minutes / 60) * rowPx;
  });
  const hours = Array.from({ length: 24 }, (_, h) => h);
</script>

<div class="cal">
  <header class="toolbar">
    <div class="steps">
      <button type="button" class="ghost step" onclick={() => go(prev)} disabled={!prev} aria-label={`Previous ${view === 'agenda' ? 'days' : view}`}><svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg></button>
      <button type="button" class="ghost today" onclick={() => (cursor = todayKey)} disabled={cursor === todayKey && view !== 'month'}>Today</button>
      <button type="button" class="ghost step" onclick={() => go(next)} disabled={!next} aria-label={`Next ${view === 'agenda' ? 'days' : view}`}><svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg></button>
    </div>
    <h2 aria-live="polite">{title}</h2>
    <div class="seg" role="group" aria-label="Calendar view">
      {#each VIEWS as v (v.id)}
        <button type="button" aria-pressed={view === v.id} onclick={() => setView(v.id)}>{v.label}</button>
      {/each}
    </div>
  </header>

  {#if view === 'month'}
    <div class="grid7 head" aria-hidden="true">{#each weekdays as w}<span>{w}</span>{/each}</div>
    <div class="grid7">
      {#each days as { key, events: evs } (key)}
        <button
          type="button"
          class="cell"
          class:other={parseKey(key).m !== cur.m}
          class:today={key === todayKey}
          class:selected={key === cursor}
          aria-label={`${fmt({ weekday: 'long', month: 'long', day: 'numeric' }, key)}, ${evs.length} events`}
          aria-pressed={key === cursor}
          onclick={() => openDay(key)}
          aria-haspopup="dialog"
        >
          <span class="num">{+key.slice(8, 10)}</span>
          {#each evs.slice(0, 2) as ev (ev.id)}<span class="chip">{ev.title}</span>{/each}
          {#if evs.length > 2}<span class="more">+{evs.length - 2}</span>{/if}
          {#if evs.length > 0}<span class="dot" aria-hidden="true"></span>{/if}
        </button>
      {/each}
    </div>
  {:else if view === 'week'}
    <div class="tg" bind:this={scroller} style:--n={days.length}>
      <div class="tg-sticky">
        <div class="line">
          <span class="gutter"></span>
          {#each days as { key } (key)}
            <button type="button" class="colhead" class:today={key === todayKey} onclick={() => openDay(key)} aria-haspopup="dialog"
              aria-label={fmt({ weekday: 'long', month: 'long', day: 'numeric' }, key)}>
              <span class="dow">{fmt({ weekday: 'short' }, key)}</span>
              <span class="dnum">{+key.slice(8, 10)}</span>
            </button>
          {/each}
        </div>
        {#if days.some((d) => d.events.some((e) => e.allDay))}
          <div class="line allday">
            <span class="gutter">all-day</span>
            {#each days as { key } (key)}
              <div class="ad-cell">{#each allDayOf(key) as ev (ev.id)}<button type="button" class="chip" title={ev.title} onclick={() => openDay(key)} aria-haspopup="dialog">{ev.title}</button>{/each}</div>
            {/each}
          </div>
        {/if}
      </div>
      <div class="line body">
        <div class="gutter hours">{#each hours as h}<span style:top="calc(var(--hh) * {h})">{h === 0 ? '' : hourLabel(h)}</span>{/each}</div>
        {#each days as { key } (key)}
          <div class="daycol" class:today={key === todayKey}>
            {#each placed(key) as p (p.ev.id)}
              <button type="button" class="block" title={`${p.ev.title}, ${when(p.ev)}`} onclick={() => openDay(key)} aria-haspopup="dialog"
                style:top="calc(var(--hh) * {p.top / 60})" style:height="calc(var(--hh) * {p.height / 60} - 2px)"
                style:left="calc({p.col / p.cols} * 100% + 1px)" style:width="calc({1 / p.cols} * 100% - 2px)">
                <b>{p.ev.title}</b>
                <span>{formatTime(p.ev.start, timeZone, locale)}{#if p.ev.location}{' · '}{p.ev.location}{/if}</span>
              </button>
            {/each}
            {#if key === todayKey}<div class="nowline" style:top="calc(var(--hh) * {Math.min(1440, Math.max(0, nowMinutes)) / 60})"></div>{/if}
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <section class="agenda-view">
      {#if agendaDays.length === 0}
        <p class="muted">Nothing scheduled in these {AGENDA_DAYS} days.</p>
      {/if}
      {#each agendaDays as d (d.key)}
        <h3>{dayLabel(d.key, todayKey, locale)}</h3>
        <ul class="list">
          {#each d.events as ev (ev.id + d.key)}
            <li><span class="when">{ev.allDay ? 'All day' : `${formatTime(ev.start, timeZone, locale)}–${formatTime(ev.end, timeZone, locale)}`}</span><span class="what">{ev.title}{#if ev.location}{' '}<span class="muted">· {ev.location}</span>{/if}</span></li>
          {/each}
        </ul>
      {/each}
    </section>
  {/if}

  <dialog class="day" bind:this={dlg} aria-labelledby="day-title"
    onclick={(e) => e.target === dlg && dlg?.close()}>
    <header>
      <button type="button" class="ghost step" onclick={() => (cursor = addDays(cursor, -1))} disabled={!canPrevDay} aria-label="Previous day"><svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg></button>
      <div class="heading">
        <h3 id="day-title">{fmt({ weekday: 'long' }, cursor)}</h3>
        <p>{fmt({ month: 'long', day: 'numeric', year: 'numeric' }, cursor)}{#if cursor === todayKey}{' · Today'}{/if}</p>
      </div>
      <button type="button" class="ghost step" onclick={() => (cursor = addDays(cursor, 1))} disabled={!canNextDay} aria-label="Next day"><svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg></button>
      <button type="button" class="ghost step close" onclick={() => dlg?.close()} aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
    </header>
    {#if dayEvents.length === 0}
      <p class="empty">Nothing scheduled.</p>
    {:else}
      <ul class="evs">
        {#each dayEvents as ev (ev.id + cursor)}
          <li>
            <div class="meta">
              <span class="t">{detailWhen(ev)}</span>
              {#if duration(ev)}<span>{duration(ev)}</span>{/if}
              {#if position(ev, cursor)}<span class="pill">{position(ev, cursor)}</span>{/if}
            </div>
            <div class="title">{ev.title}</div>
            {#if ev.location}
              <div class="loc"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>{ev.location}</div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </dialog>
</div>

<style>
  .cal { --hh: 3rem; }

  /* Toolbar */
  .toolbar { display: flex; align-items: center; gap: .75rem 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
  .toolbar h2 { margin: 0; flex: 1 1 10rem; font-size: 1.2rem; letter-spacing: -.02em; text-align: center; }
  .steps { display: flex; gap: .35rem; align-items: center; }
  .steps button, .seg button { margin: 0; width: auto; }
  .steps .step { display: grid; place-items: center; width: 2.4rem; height: 2.4rem; padding: 0; border-radius: 999px; }
  .step svg { width: 1.15rem; height: 1.15rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .steps .today { padding: .45rem 1rem; border-radius: 999px; font-size: .9rem; }
  .steps button:disabled { opacity: .35; cursor: default; }
  .seg { display: inline-flex; padding: 3px; gap: 2px; background: var(--card-2); border: 1px solid var(--border); border-radius: 999px; }
  .seg button { padding: .4rem .9rem; font-size: .88rem; border-radius: 999px; background: transparent; color: var(--muted); border: 0; box-shadow: none; }
  .seg button:hover { color: var(--fg); filter: none; }
  .seg button[aria-pressed="true"] { background: var(--card); color: var(--accent); box-shadow: var(--shadow-sm); }
  @media (max-width: 40rem) {
    .toolbar { display: grid; grid-template-columns: 1fr auto; }
    .toolbar h2 { grid-column: 1 / -1; grid-row: 1; text-align: left; }
    .seg { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(3, 1fr); }
    .seg button { padding-inline: 0; }
    .steps { grid-column: 1 / -1; }
    .steps .today { flex: 1; }
  }

  /* Month */
  .grid7 { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
  .head span { text-align: center; font-size: .7rem; font-weight: 650; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); padding: .35rem 0; }
  .cell { display: flex; flex-direction: column; align-items: stretch; gap: 2px; min-height: 5.25rem; padding: .35rem; margin: 0;
    text-align: left; font-weight: 400; font-size: .75rem; border-radius: 10px; background: var(--card-2); color: var(--fg);
    border: 1px solid transparent; box-shadow: none; overflow: hidden; }
  .cell:hover { background: var(--accent-soft); filter: none; }
  .cell.other { opacity: .4; }
  .cell.today .num { background: var(--accent); color: var(--accent-fg); border-radius: 999px; min-width: 1.5rem; text-align: center; align-self: flex-start; }
  .cell.selected { border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring); }
  .num { font-weight: 600; font-size: .8rem; line-height: 1.5rem; padding: 0 .25rem; }
  .chip { background: var(--accent-soft); color: var(--accent); font-weight: 500; border-radius: 5px; padding: 0 .35rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .more { color: var(--muted); padding: 0 .25rem; }
  .dot { display: none; width: 6px; height: 6px; border-radius: 50%; background: var(--accent); }

  /* Shared event lists (month detail + agenda) */
  /* Day detail panel */
  .day { width: min(32rem, calc(100vw - 2rem)); max-height: min(40rem, 85dvh); overflow: auto; padding: 0; margin: auto;
    border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); color: var(--fg); box-shadow: var(--shadow-md), 0 24px 60px -20px rgb(0 0 0 / .45); }
  .day[open] { animation: expand .18s cubic-bezier(.2, .8, .2, 1); }
  .day::backdrop { background: rgb(20 15 10 / .45); -webkit-backdrop-filter: blur(3px); backdrop-filter: blur(3px); }
  .day[open]::backdrop { animation: fade .18s ease-out; }
  @keyframes expand { from { opacity: 0; transform: scale(.94) translateY(8px); } to { opacity: 1; transform: none; } }
  @keyframes fade { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .day[open], .day[open]::backdrop { animation: none; } }
  .day header { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: .5rem; padding: 1rem 1.1rem; background: var(--card); border-bottom: 1px solid var(--border); }
  .day header button { display: grid; place-items: center; flex: none; width: 2.4rem; height: 2.4rem; margin: 0; padding: 0; border-radius: 999px; }
  .day header button:disabled { opacity: .35; cursor: default; }
  .day .heading { flex: 1; min-width: 0; }
  .day h3 { margin: 0; font-size: 1.15rem; letter-spacing: -.02em; }
  .day .heading p { margin: 0; font-size: .88rem; }
  .day .close { margin-left: .25rem; }
  .empty { padding: 1.5rem 1.25rem; margin: 0; }
  .evs { list-style: none; margin: 0; padding: .5rem 1.25rem 1rem; }
  .evs li { padding: .85rem 0; border-top: 1px solid var(--border); }
  .evs li:first-child { border-top: 0; }
  .meta { display: flex; flex-wrap: wrap; gap: .25rem .6rem; align-items: center; font-size: .85rem; color: var(--muted); font-variant-numeric: tabular-nums; }
  .meta .t { color: var(--accent); font-weight: 600; }
  .pill { padding: .05rem .5rem; border-radius: 999px; background: var(--card-2); font-size: .75rem; }
  .title { margin-top: .15rem; font-size: 1.05rem; font-weight: 600; letter-spacing: -.01em; overflow-wrap: anywhere; }
  .loc { display: flex; align-items: center; gap: .35rem; margin-top: .2rem; font-size: .9rem; color: var(--muted); }
  .loc svg { width: .95rem; height: .95rem; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .list { list-style: none; margin: 0; padding: 0; }
  .list li { display: flex; gap: .85rem; padding: .6rem 0; border-top: 1px solid var(--border); }
  .list li:first-child { border-top: 0; }
  .when { color: var(--muted); min-width: 8.5rem; font-size: .9rem; font-variant-numeric: tabular-nums; }
  .what { font-weight: 500; min-width: 0; overflow-wrap: anywhere; }
  .what .muted { font-weight: 400; }
  .agenda-view h3 { margin: 1.25rem 0 .5rem; font-size: .72rem; font-weight: 650; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); }
  .agenda-view h3:first-child { margin-top: 0; }

  /* Week / day time grid */
  .tg { --gutter: 3.5rem; max-height: 38rem; overflow: auto; border: 1px solid var(--border); border-radius: 12px; background: var(--card); position: relative; }
  .line { min-width: 40rem; }
  .line { display: grid; grid-template-columns: var(--gutter) repeat(var(--n), minmax(0, 1fr)); }
  .tg-sticky { position: sticky; top: 0; z-index: 3; background: var(--card); border-bottom: 1px solid var(--border); }
  .gutter { font-size: .7rem; color: var(--muted); text-align: right; padding: .3rem .5rem 0 0; }
  .colhead { display: flex; flex-direction: column; align-items: center; width: auto; margin: 0; padding: .5rem 0; border: 0; border-left: 1px solid var(--border); border-radius: 0;
    background: transparent; color: var(--fg); box-shadow: none; font-weight: 400; }
  .colhead:hover { background: var(--card-2); filter: none; }
  .dow { font-size: .7rem; font-weight: 650; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  .dnum { font-size: 1.15rem; font-weight: 600; text-align: center; min-width: 2rem; line-height: 2rem; border-radius: 999px; }
  .colhead.today .dnum { background: var(--accent); color: var(--accent-fg); }
  .colhead.today .dow { color: var(--accent); }
  .allday { border-top: 1px solid var(--border); }
  .allday .gutter { align-self: center; padding: 0 .5rem 0 0; }
  .ad-cell .chip { width: 100%; margin: 0; border: 0; box-shadow: none; text-align: left; font-size: .75rem; line-height: 1.5; cursor: pointer; }
  .ad-cell .chip:hover { background: color-mix(in srgb, var(--accent) 22%, transparent); filter: none; }
  .ad-cell { display: grid; gap: 2px; padding: .25rem; border-left: 1px solid var(--border); align-content: start; min-width: 0; }
  .body { position: relative; grid-template-rows: calc(var(--hh) * 24); }
  .hours { position: relative; }
  .hours span { position: absolute; right: .5rem; transform: translateY(-50%); }
  .daycol { position: relative; border-left: 1px solid var(--border);
    background-image: linear-gradient(to bottom, var(--border) 1px, transparent 1px); background-size: 100% var(--hh); }
  .daycol.today { background-color: color-mix(in srgb, var(--accent) 5%, transparent); }
  .block { display: block; margin: 0; text-align: left; font-weight: 400; cursor: pointer; border-top: 0; border-right: 0; border-bottom: 0; box-shadow: none; position: absolute; box-sizing: border-box; overflow: hidden; padding: .15rem .4rem; border-radius: 8px; font-size: .75rem; line-height: 1.25;
    background: color-mix(in srgb, var(--accent) 16%, var(--card)); border-left: 3px solid var(--accent); color: var(--fg); min-height: 1.1rem; }
  .block:hover { background: color-mix(in srgb, var(--accent) 26%, var(--card)); filter: none; }
  .block b { display: block; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .block span { display: block; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nowline { position: absolute; left: 0; right: 0; height: 2px; background: var(--danger); z-index: 2; pointer-events: none; }
  .nowline::before { content: ''; position: absolute; left: -4px; top: -3px; width: 8px; height: 8px; border-radius: 50%; background: var(--danger); }

  @media (max-width: 40rem) {
    .cell { min-height: 3.25rem; align-items: center; } .cell .chip { display: none; } .more { display: none; } .dot { display: block; }
    .when { min-width: 6.5rem; } .grid7 { gap: 2px; }
    .tg { --gutter: 2.75rem; }
  }
</style>

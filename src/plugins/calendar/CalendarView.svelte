<script lang="ts">
  import { untrack } from 'svelte';
  import { DAY_MS, addDays, dayKey, dayLabel, formatDay, formatTime, keyOf, parseKey, startOfDayMs } from '../../lib/dates';
  import { bannerSpans, groupByDay, hourSpan as hourSpanOf, isBannerEvent, layoutDay, monthGrid, weekStartKey } from './agenda';
  import { FAMILY, peopleOf, type Person } from '../../lib/people';
  import { iconMarkup } from '../../lib/icons';
  import { describeWeather, type WeatherData } from './weatherView';
  import type { CalEvent } from './types';

  let { events, timeZone, locale, nowMs, windowStart, windowEnd, people = [], weather }: {
    events: CalEvent[]; timeZone: string; locale: string; nowMs: number; windowStart: number; windowEnd: number;
    people?: Person[]; weather?: WeatherData | undefined;
  } = $props();

  type View = 'month' | 'week' | 'day' | 'agenda';
  const VIEWS: { id: View; label: string }[] = [
    { id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }, { id: 'agenda', label: 'Agenda' },
  ];
  const AGENDA_DAYS = 14;
  const VIEW_KEY = 'calendar-view';

  // svelte-ignore state_referenced_locally
  const todayKey = dayKey(nowMs, timeZone);
  // svelte-ignore state_referenced_locally
  const firstKey = dayKey(windowStart, timeZone);
  // svelte-ignore state_referenced_locally
  const lastKey = dayKey(windowEnd, timeZone);

  let view = $state<View>('week');
  let cursor = $state(todayKey); // the focused day: selected in month view, anchors every other view
  // svelte-ignore state_referenced_locally
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
  /** "Oct 4 – 10" between two day keys (end inclusive). */
  const fmtRange = (a: string, b: string, opts: Intl.DateTimeFormatOptions) => {
    const at = (key: string) => { const { y, m, d } = parseKey(key); return Date.UTC(y, m - 1, d); };
    return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...opts }).formatRange(at(a), at(b));
  };
  const weekdays = Array.from({ length: 7 }, (_, i) => fmt({ weekday: 'short' }, addDays('2023-01-01', i)));
  const hourLabel = (h: number) => new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone: 'UTC' }).format(Date.UTC(2023, 0, 1, h));

  const cur = $derived(parseKey(cursor));
  const firstOfMonth = $derived(keyOf(cur.y, cur.m, 1));

  // --- People: each event takes the colour of whoever its title names; the chips filter the calendar ---
  const roster = $derived(people.length ? [...people, FAMILY] : []);
  const whoCache = new Map<string, Person[]>();
  function whoOf(ev: CalEvent): Person[] {
    if (!people.length) return [];
    let who = whoCache.get(ev.id);
    if (!who) { const named = peopleOf(ev.title, people); who = named.length ? named : [FAMILY]; whoCache.set(ev.id, who); }
    return who;
  }
  const colorOf = (ev: CalEvent) => whoOf(ev)[0]?.color;
  let only = $state<string[]>([]);
  const toggle = (id: string) => (only = only.includes(id) ? only.filter((x) => x !== id) : [...only, id]);
  const visible = $derived(only.length ? events.filter((ev) => whoOf(ev).some((p) => only.includes(p.id))) : events);
  const usesFamily = $derived(events.some((ev) => whoOf(ev).includes(FAMILY)));
  const chips = $derived(roster.filter((p) => p !== FAMILY || usesFamily));

  // --- Weather ---
  const wx = (key: string) => (weather?.days[key] ? { ...weather.days[key]!, ...describeWeather(weather.days[key]!.code) } : null);

  /** The days a view covers, as [first day, count]. */
  function rangeFor(v: View, key: string): [string, number] {
    if (v === 'month') return [monthGrid(parseKey(key).y, parseKey(key).m)[0]!, 42];
    if (v === 'week') return [weekStartKey(key), 7];
    if (v === 'day') return [key, 1];
    return [key, AGENDA_DAYS];
  }
  const range = $derived(rangeFor(view, cursor));
  const days = $derived(groupByDay(visible, timeZone, range[0], range[1]));
  const byKey = $derived(new Map(days.map((d) => [d.key, d.events])));
  /** Each day's events split once: banners (multi-day) and everything else. */
  const split = $derived(new Map(days.map((d) => [d.key, { banners: d.events.filter(isBanner), rest: d.events.filter((e) => !isBanner(e)) }])));
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
    next = addDays(cursor, delta * (view === 'week' ? 7 : view === 'day' ? 1 : AGENDA_DAYS));
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
    if (view === 'day') return fmt({ weekday: 'long', month: 'long', day: 'numeric' }, cursor);
    return fmtRange(range[0], addDays(range[0], range[1] - 1), { month: 'short', day: 'numeric', year: 'numeric' });
  });

  // --- Day detail panel (opens from a day in the month view, or a day/event in the week view) ---
  let dlg = $state<HTMLDialogElement>();
  const dayEvents = $derived(groupByDay(visible, timeZone, cursor, 1)[0]!.events);
  const canPrevDay = $derived(addDays(cursor, -1) >= firstKey);
  const canNextDay = $derived(addDays(cursor, 1) <= lastKey);
  function openDay(key: string) {
    cursor = key;
    dlg?.showModal();
  }
  const zoned = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { timeZone, hour: 'numeric', minute: '2-digit', ...opts });
  const dateTimeFmt = $derived(zoned({ month: 'short', day: 'numeric' }));
  const stampFmt = $derived(zoned({ weekday: 'short' }));
  const dateTime = (ms: number) => dateTimeFmt.format(ms);
  const stamp = (ms: number) => stampFmt.format(ms);
  function duration(ev: CalEvent): string {
    if (ev.allDay) return '';
    const mins = Math.round((ev.end - ev.start) / 60_000);
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60), m = mins % 60;
    if (h >= 24) return `${Math.round(h / 24)} days`;
    return m ? `${h} hr ${m} min` : `${h} hr`;
  }
  /** First and last day an event covers, in the calendar's time zone. */
  const spanCache = new Map<string, [string, string]>();
  const spanKeys = (ev: CalEvent): [string, string] => {
    let keys = spanCache.get(ev.id);
    if (!keys) {
      keys = ev.allDay ? [ev.startDate, ev.endDate] : [dayKey(ev.start, timeZone), dayKey(Math.max(ev.start, ev.end - 1), timeZone)];
      spanCache.set(ev.id, keys);
    }
    return keys;
  };
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
  // Time-grid columns: one per day in the week view, one per person (or just one) in the day view.
  interface Col { id: string; day: string; person?: Person }
  const cols = $derived<Col[]>(
    view === 'week' ? days.map((d) => ({ id: d.key, day: d.key }))
    : view === 'day'
      ? (people.length
          ? chips.filter((p) => !only.length || only.includes(p.id)).map((p) => ({ id: p.id, day: cursor, person: p }))
          : [{ id: cursor, day: cursor }])
      : [],
  );
  const eventsOf = (c: Col) => (byKey.get(c.day) ?? []).filter((ev) => !c.person || whoOf(ev).includes(c.person));
  const isBanner = (ev: CalEvent) => isBannerEvent(ev, timeZone);
  const placed = (c: Col) => layoutDay(eventsOf(c).filter((e) => !isBanner(e)), startOfDayMs(c.day, timeZone), startOfDayMs(addDays(c.day, 1), timeZone));
  const allPlaced = $derived(cols.flatMap(placed));
  const banners = $derived(view === 'week' || view === 'day'
    ? bannerSpans(cols.flatMap(eventsOf).filter(isBanner), cols.map((c) => c.day), spanKeys, view === 'day')
    : { spans: [], lanes: 0 });
  /** Banner text: the date range for an all-day event, else when it starts and ends (arrows where it carries on past this view). */
  const bannerText = (s: { ev: CalEvent; opensHere: boolean; closesHere: boolean }) =>
    s.ev.allDay ? dateRange(s.ev) : `${s.opensHere ? stamp(s.ev.start) : '←'} → ${s.closesHere ? stamp(s.ev.end) : '…'}`;
  /** "Jun 3 – 5" for an all-day event; the end date is inclusive. */
  const dateRange = (ev: CalEvent & { allDay: true }) => fmtRange(ev.startDate, ev.endDate, { month: 'short', day: 'numeric' });
  /** Agenda wording for a long event on one of its days. */
  function agendaWhen(ev: CalEvent, key: string): string {
    const [from, to] = spanKeys(ev);
    if (ev.allDay) return `All day · ${position(ev, key).toLowerCase()}`;
    return key === from ? `${formatTime(ev.start, timeZone, locale)} → ${stamp(ev.end)}` : key === to ? `Until ${formatTime(ev.end, timeZone, locale)}` : 'Continues';
  }
  const allDayOf = (c: Col) => eventsOf(c).filter((e) => e.allDay && !isBanner(e));
  const nowMinutes = $derived((now - startOfDayMs(todayKey, timeZone)) / 60_000);
  const initial = (p: Person) => [...p.name][0]!.toUpperCase();

  const showsToday = $derived(range[0] <= todayKey && todayKey <= addDays(range[0], range[1] - 1));

  // The grid shows waking hours (7 AM–9 PM), stretched only as far as an event needs, so it never wastes a screen on 3 AM.
  const hourSpan = $derived(hourSpanOf(allPlaced));
  const hours = $derived(Array.from({ length: hourSpan.count }, (_, i) => hourSpan.first + i));
  /** Grid offset of a minute-of-day, in hour rows. */
  const rows = (minutes: number) => (minutes - hourSpan.first * 60) / 60;
  const nowInGrid = $derived(showsToday && nowMinutes >= hourSpan.first * 60 && nowMinutes <= (hourSpan.first + hourSpan.count) * 60);

  // Time grids open scrolled so "now" (today) or the first event of the week is near the top.
  let scroller = $state<HTMLElement>();
  $effect(() => {
    if (!scroller || (view !== 'week' && view !== 'day')) return;
    let earliest = Infinity;
    for (const p of allPlaced) earliest = Math.min(earliest, p.top);
    // Not tracking `nowMinutes`: the minute tick must not yank the grid back while someone is scrolling.
    const minutes = showsToday ? untrack(() => nowMinutes) - 60 : Number.isFinite(earliest) ? earliest - 30 : 0;
    const rowPx = (scroller.querySelector<HTMLElement>('.body')?.offsetHeight ?? 0) / hourSpan.count;
    scroller.scrollTop = Math.max(0, rows(minutes)) * rowPx;
  });
</script>

{#snippet wxBadge(key: string)}
  {@const w = wx(key)}
  {#if w}
    <span class="wx" title={`${w.label}, high ${w.hi}°, low ${w.lo}°`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">{@html iconMarkup(w.icon)}</svg>
      <b>{w.hi}°</b><i>{w.lo}°</i>
      <span class="sr">{`${w.label}, high ${w.hi}°, low ${w.lo}°`}</span>
    </span>
  {/if}
{/snippet}

{#snippet dots(ev: CalEvent)}
  {#each whoOf(ev) as p (p.id)}<i class="dot-p" style:--c={p.color} title={p.name}></i>{/each}
{/snippet}

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
    {#if chips.length > 0}
      <div class="people" role="group" aria-label="Show whose events">
        {#each chips as p (p.id)}
          <button type="button" class="person" style:--c={p.color} title={p.name} aria-label={p.name} aria-pressed={only.includes(p.id)} class:dim={only.length > 0 && !only.includes(p.id)} onclick={() => toggle(p.id)}>
            <span class="avatar" aria-hidden="true">{initial(p)}</span>{#if only.includes(p.id)}<span class="pn">{p.name}</span>{/if}
          </button>
        {/each}
        {#if only.length > 0}<button type="button" class="person clear" onclick={() => (only = [])} aria-label="Show everyone" title="Show everyone">×</button>{/if}
      </div>
    {/if}
  </header>

  {#if view === 'month'}
    <div class="grid7 head" aria-hidden="true">{#each weekdays as w}<span>{w}</span>{/each}</div>
    <div class="grid7">
      {#each days as { key, events: evs } (key)}
        {@const { banners: multi, rest } = split.get(key)!}
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
          <span class="cell-top"><span class="num">{+key.slice(8, 10)}</span>{@render wxBadge(key)}</span>
          {#each multi as ev (ev.id)}
            {@const [from, to] = spanKeys(ev)}
            <span class="chip multi" class:mid={key !== from && key !== to} style:--c={colorOf(ev)}>{#if key === from}{ev.title}{:else if key === to}ends{ev.allDay ? '' : ` ${formatTime(ev.end, timeZone, locale)}`}{:else}<span class="sr">{ev.title}</span>{/if}</span>
          {/each}
          {#each rest.slice(0, 3) as ev (ev.id)}<span class="chip" style:--c={colorOf(ev)}>{ev.title}</span>{/each}
          {#if rest.length > 3}<span class="more">+{rest.length - 3} more</span>{/if}
          {#if evs.length > 0}<span class="dot-row" aria-hidden="true">{#each evs.slice(0, 4) as ev (ev.id)}<i class="dot-p" style:--c={colorOf(ev)}></i>{/each}</span>{/if}
        </button>
      {/each}
    </div>
  {:else if view === 'week' || view === 'day'}
    <div class="tg" bind:this={scroller} style:--n={cols.length}>
      <div class="tg-sticky">
        <div class="line">
          <span class="gutter"></span>
          {#each cols as c (c.id)}
            {#if view === 'week'}
              <button type="button" class="colhead" class:today={c.day === todayKey} onclick={() => openDay(c.day)} aria-haspopup="dialog"
                aria-label={fmt({ weekday: 'long', month: 'long', day: 'numeric' }, c.day)}>
                <span class="dow">{fmt({ weekday: 'short' }, c.day)}</span>
                <span class="dnum">{+c.day.slice(8, 10)}</span>
                {@render wxBadge(c.day)}
              </button>
            {:else}
              <div class="colhead person-head" style:--c={c.person?.color}>
                {#if c.person}<span class="avatar" aria-hidden="true">{initial(c.person)}</span><span class="pname">{c.person.name}</span>
                {:else}<span class="dow">{fmt({ weekday: 'short' }, c.day)}</span><span class="dnum" class:today-num={c.day === todayKey}>{+c.day.slice(8, 10)}</span>{/if}
                {#if c === cols[0]}{@render wxBadge(c.day)}{/if}
              </div>
            {/if}
          {/each}
        </div>
        {#if banners.spans.length > 0}
          <div class="line spans" style:--lanes={banners.lanes}>
            <span class="gutter">multi-day</span>
            {#each banners.spans as s (s.ev.id)}
              <button type="button" class="banner" class:open={!s.opensHere} class:close={!s.closesHere} style:--c={colorOf(s.ev)} title={`${s.ev.title}, ${bannerText(s)}`}
                style:grid-column="{s.from + 2} / {s.to + 3}" style:grid-row={s.lane + 1} onclick={() => openDay(cols[s.from]!.day)} aria-haspopup="dialog">
                <b>{s.ev.title}</b><span>{bannerText(s)}</span>
              </button>
            {/each}
          </div>
        {/if}
        {#if cols.some((c) => allDayOf(c).length > 0)}
          <div class="line allday">
            <span class="gutter">all-day</span>
            {#each cols as c (c.id)}
              <div class="ad-cell">{#each allDayOf(c) as ev (ev.id)}<button type="button" class="chip" style:--c={c.person?.color ?? colorOf(ev)} title={ev.title} onclick={() => openDay(c.day)} aria-haspopup="dialog">{ev.title}</button>{/each}</div>
            {/each}
          </div>
        {/if}
      </div>
      <div class="line body" style:--rows={hourSpan.count}>
        <div class="gutter hours">{#each hours as h, i (h)}<span class:first={i === 0} style:top="calc(var(--hh) * {i})">{hourLabel(h)}</span>{/each}</div>
        {#each cols as c (c.id)}
          <div class="daycol" class:today={c.day === todayKey}>
            {#each placed(c) as p (p.ev.id)}
              <button type="button" class="block" class:tiny={p.height < 50} title={`${p.ev.title}, ${when(p.ev)}`} onclick={() => openDay(c.day)} aria-haspopup="dialog"
                style:--c={c.person?.color ?? colorOf(p.ev)}
                style:top="calc(var(--hh) * {rows(p.top)})" style:height="calc(var(--hh) * {p.height / 60} - 2px)"
                style:left="calc({p.col / p.cols} * 100% + 1px)" style:width="calc({1 / p.cols} * 100% - 2px)">
                <b>{p.ev.title}</b>
                <span>{formatTime(p.ev.start, timeZone, locale)}{#if p.ev.location && !p.ev.title.includes(p.ev.location)}{' · '}{p.ev.location}{/if}</span>
              </button>
            {/each}
            {#if c.day === todayKey && nowInGrid}<div class="nowline" style:top="calc(var(--hh) * {rows(nowMinutes)})"></div>{/if}
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
        <h3>{dayLabel(d.key, todayKey, locale)} {@render wxBadge(d.key)}</h3>
        <ul class="list">
          {#each d.events as ev (ev.id + d.key)}
            <li style:--c={colorOf(ev)}>
              <span class="when">{ev.allDay ? 'All day' : isBanner(ev) ? agendaWhen(ev, d.key) : `${formatTime(ev.start, timeZone, locale)}–${formatTime(ev.end, timeZone, locale)}`}</span>
              <span class="what">{ev.title}{#if ev.location}{' '}<span class="muted">· {ev.location}</span>{/if}</span>
              {#if people.length}<span class="who-dots">{@render dots(ev)}</span>{/if}
            </li>
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
      {@render wxBadge(cursor)}
      <button type="button" class="ghost step" onclick={() => (cursor = addDays(cursor, 1))} disabled={!canNextDay} aria-label="Next day"><svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg></button>
      <button type="button" class="ghost step close" onclick={() => dlg?.close()} aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg></button>
    </header>
    {#if dayEvents.length === 0}
      <p class="empty">Nothing scheduled.</p>
    {:else}
      <ul class="evs">
        {#each dayEvents as ev (ev.id + cursor)}
          <li style:--c={colorOf(ev)}>
            <div class="meta">
              <span class="t">{detailWhen(ev)}</span>
              {#if duration(ev)}<span>{duration(ev)}</span>{/if}
              {#if position(ev, cursor)}<span class="pill">{position(ev, cursor)}</span>{/if}
              {#each people.length ? whoOf(ev) : [] as p (p.id)}<span class="pill who" style:--c={p.color}>{p.name}</span>{/each}
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
  .cal { --hh: 3.5rem; --c: var(--accent); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }

  /* Toolbar */
  .toolbar { display: flex; align-items: center; gap: .6rem .85rem; flex-wrap: wrap; margin-bottom: .75rem; }
  .toolbar h2 { order: -1; margin: 0; flex: 1 1 11rem; text-align: left; font-size: clamp(1.15rem, 1rem + .6vw, 1.45rem); white-space: nowrap; letter-spacing: -.02em; }
  .steps { display: flex; gap: .35rem; align-items: center; }
  .steps button, .seg button { margin: 0; width: auto; }
  .steps .step { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; padding: 0; border-radius: 999px; }
  .step svg { width: 1.15rem; height: 1.15rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .steps .today { padding: .45rem 1rem; border-radius: 999px; font-size: .9rem; }
  .steps button:disabled { opacity: .35; cursor: default; }
  .seg { display: inline-flex; padding: 3px; gap: 2px; background: var(--card-2); border: 1px solid var(--border); border-radius: 999px; }
  .seg button { padding: .4rem .85rem; font-size: .9rem; border-radius: 999px; background: transparent; color: var(--muted); border: 0; box-shadow: none; }
  .seg button:hover { color: var(--fg); filter: none; }
  .seg button[aria-pressed="true"] { background: var(--card); color: var(--accent); box-shadow: var(--shadow-sm); }
  @media (max-width: 40rem) {
    .toolbar { display: grid; grid-template-columns: 1fr auto; }
    .toolbar h2 { grid-column: 1 / -1; grid-row: 1; text-align: left; }
    .seg { grid-column: 1 / -1; display: grid; grid-template-columns: repeat(4, 1fr); }
    .seg button { padding-inline: 0; }
    .steps { grid-column: 1 / -1; }
    .people { grid-column: 1 / -1; margin-left: 0; }
    .steps .today { flex: 1; }
  }

  /* People */
  .people { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem; margin-left: auto; }
  .person { display: inline-flex; align-items: center; gap: .4rem; width: auto; margin: 0; padding: .15rem; border-radius: 999px; font-size: .85rem; font-weight: 600;
    color: var(--fg); background: color-mix(in srgb, var(--c) 14%, var(--card)); border: 2px solid transparent; box-shadow: none; }
  .person:hover { filter: none; background: color-mix(in srgb, var(--c) 24%, var(--card)); }
  .person[aria-pressed="true"] { border-color: var(--c); }
  .person.dim { opacity: .5; }
  .person[aria-pressed="true"] { padding-right: .7rem; }
  .person.clear { width: 1.9rem; height: 1.9rem; justify-content: center; padding: 0; font-size: 1.1rem; line-height: 1; background: transparent; color: var(--muted); border: 1px dashed var(--border); }
  .avatar { display: grid; place-items: center; flex: none; width: 1.6rem; height: 1.6rem; border-radius: 50%; background: var(--c); color: #fff; font-size: .78rem; font-weight: 700; }
  .dot-p { display: inline-block; width: .55rem; height: .55rem; border-radius: 50%; background: var(--c); }
  .wx { display: inline-flex; align-items: center; gap: .25rem; font-size: .8rem; color: var(--muted); font-variant-numeric: tabular-nums; font-weight: 500; }
  .wx svg { width: 1.1rem; height: 1.1rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .wx b { color: var(--fg); font-weight: 600; }
  .wx i { font-style: normal; opacity: .75; }

  /* Month */
  .grid7 { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
  .head span { text-align: center; font-size: .7rem; font-weight: 650; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); padding: .35rem 0; }
  .cell { display: flex; flex-direction: column; align-items: stretch; gap: 2px; min-height: 7.5rem; padding: .45rem; margin: 0;
    text-align: left; font-weight: 400; font-size: .8rem; border-radius: 14px; background: var(--card-2); color: var(--fg);
    border: 1px solid transparent; box-shadow: none; overflow: hidden; }
  .cell:hover { background: var(--accent-soft); filter: none; }
  .cell-top { display: flex; align-items: center; justify-content: space-between; gap: .25rem; }
  .cell.other { opacity: .4; }
  .cell.today .num { background: var(--accent); color: var(--accent-fg); border-radius: 999px; min-width: 1.7rem; text-align: center; }
  .cell.selected { border-color: var(--accent); box-shadow: 0 0 0 3px var(--ring); }
  .num { font-weight: 600; font-size: .95rem; line-height: 1.7rem; padding: 0 .3rem; }
  .chip { display: block; background: color-mix(in srgb, var(--c) 18%, var(--card)); color: color-mix(in srgb, var(--c) 72%, var(--fg)); font-weight: 600; border-radius: 7px; padding: .08rem .45rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .chip.multi { background: transparent; border: 1px dashed color-mix(in srgb, var(--c) 60%, transparent); }
  .chip.multi.mid { height: .3rem; padding: 0; border: 0; border-radius: 99px; background: color-mix(in srgb, var(--c) 45%, var(--card)); }
  .more { color: var(--muted); padding: 0 .25rem; }
  .dot-row { display: none; gap: 3px; justify-content: center; }

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
  .evs li { padding: .85rem 0 .85rem .9rem; border-top: 1px solid var(--border); border-left: 4px solid var(--c, var(--accent)); margin: .5rem 0; border-radius: 4px; background: color-mix(in srgb, var(--c, var(--accent)) 6%, transparent); }
  .evs li { border-top: 0; }
  .meta { display: flex; flex-wrap: wrap; gap: .25rem .6rem; align-items: center; font-size: .85rem; color: var(--muted); font-variant-numeric: tabular-nums; }
  .meta .t { color: var(--accent); font-weight: 600; }
  .pill.who { background: color-mix(in srgb, var(--c) 18%, var(--card)); color: color-mix(in srgb, var(--c) 72%, var(--fg)); font-weight: 600; }
  .pill { padding: .05rem .5rem; border-radius: 999px; background: var(--card-2); font-size: .75rem; }
  .title { margin-top: .15rem; font-size: 1.05rem; font-weight: 600; letter-spacing: -.01em; overflow-wrap: anywhere; }
  .loc { display: flex; align-items: center; gap: .35rem; margin-top: .2rem; font-size: .9rem; color: var(--muted); }
  .loc svg { width: .95rem; height: .95rem; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .list { list-style: none; margin: 0; padding: 0; }
  .list li { display: flex; gap: .85rem; align-items: baseline; padding: .7rem 0 .7rem .8rem; border-top: 1px solid var(--border); border-left: 4px solid var(--c, var(--accent)); }
  .who-dots { display: inline-flex; gap: 3px; margin-left: auto; }
  .list li:first-child { border-top: 0; }
  .when { color: var(--muted); min-width: 8.5rem; font-size: .9rem; font-variant-numeric: tabular-nums; }
  .what { font-weight: 500; min-width: 0; overflow-wrap: anywhere; }
  .what .muted { font-weight: 400; }
  .agenda-view h3 { display: flex; align-items: center; gap: .75rem; margin: 1.25rem 0 .5rem; font-size: .72rem; font-weight: 650; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); }
  .agenda-view h3:first-child { margin-top: 0; }

  /* Week / day time grid */
  .tg { --gutter: 3.25rem; container-type: inline-size; max-height: max(28rem, calc(100dvh - 11rem)); overflow: auto; border: 1px solid var(--border); border-radius: 16px; background: var(--card); position: relative; }
  .line { min-width: 32rem; }
  .person-head { flex-direction: row; justify-content: center; gap: .5rem; padding: .7rem .25rem; flex-wrap: wrap; }
  .person-head .pname { font-weight: 650; }
  .person-head .wx { flex-basis: 100%; justify-content: center; }
  .today-num { background: var(--accent); color: var(--accent-fg); }
  .line { display: grid; grid-template-columns: var(--gutter) repeat(var(--n), minmax(0, 1fr)); }
  .tg-sticky { position: sticky; top: 0; z-index: 3; background: var(--card); border-bottom: 1px solid var(--border); }
  .gutter { font-size: .7rem; color: var(--muted); text-align: right; padding: .3rem .5rem 0 0; }
  .colhead { display: flex; flex-direction: column; align-items: center; width: auto; margin: 0; padding: .5rem 0; border: 0; border-left: 1px solid var(--border); border-radius: 0;
    background: transparent; color: var(--fg); box-shadow: none; font-weight: 400; }
  .colhead:hover { background: var(--card-2); filter: none; }
  .dow { font-size: .7rem; font-weight: 650; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
  .dnum { font-size: 1.3rem; font-weight: 600; text-align: center; min-width: 2rem; line-height: 2rem; border-radius: 999px; }
  .colhead.today .dnum { background: var(--accent); color: var(--accent-fg); }
  .colhead.today .dow { color: var(--accent); }
  /* Long events: one slim banner across the days it covers, instead of a full-height block in each. */
  .spans { border-top: 1px solid var(--border); row-gap: 2px; padding-block: .25rem; }
  .spans .gutter { grid-column: 1; grid-row: 1 / span var(--lanes, 1); align-self: center; padding: 0 .5rem 0 0; }
  .banner { display: flex; align-items: baseline; gap: .5rem; min-width: 0; margin: 0 .25rem; padding: .15rem .55rem; font-size: .78rem; font-weight: 400; text-align: left; cursor: pointer; box-shadow: none; color: var(--fg);
    background: color-mix(in srgb, var(--c) 14%, var(--card)); border: 1px dashed color-mix(in srgb, var(--c) 65%, transparent); border-radius: 999px; }
  .banner:hover { background: color-mix(in srgb, var(--c) 26%, var(--card)); filter: none; }
  .banner.open { margin-left: 0; border-top-left-radius: 0; border-bottom-left-radius: 0; border-left: 0; }
  .banner.close { margin-right: 0; border-top-right-radius: 0; border-bottom-right-radius: 0; border-right: 0; }
  .banner b { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto; min-width: 4ch; }
  .banner span { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: none; font-size: .72rem; }
  .allday { border-top: 1px solid var(--border); }
  .allday .gutter { align-self: center; padding: 0 .5rem 0 0; }
  .ad-cell .chip { width: 100%; margin: 0; border: 0; box-shadow: none; text-align: left; font-size: .78rem; line-height: 1.3; padding: .15rem .4rem; cursor: pointer;
    white-space: normal; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; }
  .ad-cell .chip:hover { background: color-mix(in srgb, var(--c) 30%, var(--card)); filter: none; }
  .ad-cell { display: grid; gap: 2px; padding: .25rem; border-left: 1px solid var(--border); align-content: start; min-width: 0; }
  .body { position: relative; grid-template-rows: calc(var(--hh) * var(--rows, 24)); }
  .hours { position: relative; }
  .hours span { position: absolute; right: .5rem; transform: translateY(-50%); }
  .hours span.first { transform: none; margin-top: 2px; }
  .daycol { position: relative; border-left: 1px solid var(--border);
    background-image: linear-gradient(to bottom, var(--border) 1px, transparent 1px); background-size: 100% var(--hh); }
  .daycol.today { background-color: color-mix(in srgb, var(--accent) 5%, transparent); }
  .block { display: block; margin: 0; text-align: left; font-weight: 400; cursor: pointer; border-top: 0; border-right: 0; border-bottom: 0; box-shadow: none; position: absolute; box-sizing: border-box; overflow: hidden; padding: .2rem .5rem; border-radius: 10px; font-size: .8rem; line-height: 1.25;
    background: color-mix(in srgb, var(--c) 18%, var(--card)); border-left: 4px solid var(--c); color: var(--fg); min-height: 1.1rem; }
  .block:hover { background: color-mix(in srgb, var(--c) 30%, var(--card)); filter: none; }
  /* Titles wrap rather than truncate to a few letters; the time line gives way first when a block is short or narrow. */
  .block b { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; line-clamp: 4; overflow: hidden; font-weight: 600; overflow-wrap: anywhere; }
  .block.tiny { padding-block: .1rem; }
  .block.tiny b { -webkit-line-clamp: 1; line-clamp: 1; }
  .block.tiny span { display: none; }
  .block span { display: block; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nowline { position: absolute; left: 0; right: 0; height: 2px; background: var(--danger); z-index: 2; pointer-events: none; }
  .nowline::before { content: ''; position: absolute; left: -4px; top: -3px; width: 8px; height: 8px; border-radius: 50%; background: var(--danger); }

  /* Narrow week grids: drop the low temperature and tighten up so seven columns stay legible. */
  @container (max-width: 46rem) {
    .colhead .wx i, .colhead .wx svg { display: none; }
    .colhead .wx { font-size: .75rem; }
    .block { padding: .15rem .3rem .15rem .4rem; font-size: .75rem; border-left-width: 3px; border-radius: 8px; }
    .dnum { font-size: 1.15rem; }
  }

  @media (max-width: 40rem) {
    .cell { min-height: 3.75rem; align-items: center; } .cell .chip, .cell .wx { display: none; } .more { display: none; } .dot-row { display: flex; } .cell-top { justify-content: center; }
    .when { min-width: 6.5rem; } .grid7 { gap: 2px; }
    .tg { --gutter: 2.75rem; }
  }
</style>

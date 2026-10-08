<script lang="ts">
  import { untrack } from 'svelte';
  import { DAY_MS, addDays, dayKey, dayLabel, formatDay, formatTime, keyOf, parseKey, startOfDayMs } from '../../lib/dates';
  import { bannerSpans, groupByDay, hourSpan as hourSpanOf, isBannerEvent, layoutDay, monthGrid, weekStartKey } from './agenda';
  import { FAMILY, peopleOf, type Person } from '../../lib/people';
  import { iconMarkup } from '../../lib/icons';
  import { describeWeather, type WeatherData } from './weatherView';
  import type { CalEvent } from './types';
  import type { Meal, MealDay } from '../mealq/client';
  import { SLOTS, SLOT_COLOR, SLOT_LABEL, type Slot } from '../mealq/slots';

  let { events, timeZone, locale, nowMs, windowStart, windowEnd, people = [], weather, meals = [], mealSlots = ['dinner'] }: {
    events: CalEvent[]; timeZone: string; locale: string; nowMs: number; windowStart: number; windowEnd: number;
    people?: Person[]; weather?: WeatherData | undefined;
    /** MealQ days that have meals, and which slots show until someone changes the toggles. */
    meals?: MealDay[] | undefined; mealSlots?: Slot[] | undefined;
  } = $props();

  type View = 'month' | 'week' | 'day' | 'agenda';
  const VIEWS: { id: View; label: string }[] = [
    { id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month' }, { id: 'agenda', label: 'Agenda' },
  ];
  const AGENDA_DAYS = 14;
  const VIEW_KEY = 'calendar-view';
  const SLOTS_KEY = 'calendar-meal-slots';

  // svelte-ignore state_referenced_locally
  const todayKey = dayKey(nowMs, timeZone);
  // svelte-ignore state_referenced_locally
  const firstKey = dayKey(windowStart, timeZone);
  // svelte-ignore state_referenced_locally
  const lastKey = dayKey(windowEnd, timeZone);

  let view = $state<View>('week');
  let slotChoice = $state<Slot[] | null>(null); // the viewer's own toggles; null follows the `mealSlots` default
  const shownSlots = $derived(slotChoice ?? mealSlots);
  let cursor = $state(todayKey); // the focused day: selected in month view, anchors every other view
  // svelte-ignore state_referenced_locally
  let now = $state(nowMs);

  // Remember the last view; phones start on the agenda, which reads best on a narrow screen.
  $effect(() => {
    try {
      const wanted = new URLSearchParams(location.search).get('view');
      const saved = localStorage.getItem(VIEW_KEY);
      const slots = JSON.parse(localStorage.getItem(SLOTS_KEY) ?? 'null');
      if (Array.isArray(slots)) slotChoice = SLOTS.filter((x) => slots.includes(x));
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

  function toggleSlot(slot: Slot) {
    slotChoice = shownSlots.includes(slot) ? shownSlots.filter((x) => x !== slot) : [...shownSlots, slot];
    try { localStorage.setItem(SLOTS_KEY, JSON.stringify(slotChoice)); } catch {}
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
  // Subscribed feeds (e.g. a sports schedule) get a chip and colour of their own and skip the name matching.
  const feedPeople = $derived.by(() => {
    const seen = new Map<string, Person>();
    for (const ev of events) if (ev.source && !seen.has(ev.source.name)) seen.set(ev.source.name, { id: `feed:${ev.source.name}`, name: ev.source.name, color: ev.source.color, match: [] });
    return seen;
  });
  const roster = $derived(people.length || feedPeople.size ? [...people, ...(people.length ? [FAMILY] : []), ...feedPeople.values()] : []);
  const whoCache = new Map<string, Person[]>();
  function whoOf(ev: CalEvent): Person[] {
    if (ev.source) return [feedPeople.get(ev.source.name)!];
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

  // --- Meals: a band above the hours, chips in the month grid and rows in the agenda; a click opens the meal ---
  /** Slots that actually have a meal, so the toggles never offer an empty choice. */
  const slotsPresent = $derived(SLOTS.filter((slot) => meals.some((d) => d.meals.some((m) => m.slot === slot))));
  const NO_MEALS: Meal[] = [];
  const shownByDay = $derived(new Map(meals.map((d) => [d.date, d.meals.filter((m) => shownSlots.includes(m.slot))])));
  const mealsOn = (key: string): Meal[] => shownByDay.get(key) ?? NO_MEALS;
  /** Every meal currently shown, in order, for the previous/next buttons in the meal panel. */
  const mealList = $derived(meals.flatMap((d) => mealsOn(d.date).map((m) => ({ key: d.date, meal: m }))));

  const dayMeals = $derived(mealsOn(cursor));
  let mealDlg = $state<HTMLDialogElement>();
  let pickedId = $state<string | null>(null);
  const pickedAt = $derived(mealList.findIndex((x) => x.meal.id === pickedId));
  const picked = $derived(pickedAt >= 0 ? mealList[pickedAt]! : null);
  const prevMeal = $derived(pickedAt > 0 ? mealList[pickedAt - 1]! : null);
  const nextMeal = $derived(pickedAt >= 0 ? (mealList[pickedAt + 1] ?? null) : null);
  function openMeal(id: string) {
    pickedId = id;
    mealDlg?.showModal();
  }
  /** Other meals shown that week, by ingredient, so one shop covers them. */
  const norm = (ingredient: string) => ingredient.trim().toLowerCase();
  const sharedIngredients = $derived.by(() => {
    const shared = new Map<string, string[]>();
    if (!picked) return shared;
    const first = weekStartKey(picked.key), last = addDays(first, 6);
    for (const x of mealList) {
      if (x.meal.id === picked.meal.id || x.key < first || x.key > last) continue;
      for (const ing of new Set(x.meal.ingredients?.map(norm))) shared.set(ing, [...(shared.get(ing) ?? []), x.meal.title]);
    }
    return shared;
  });
  const alsoIn = (ingredient: string) => sharedIngredients.get(norm(ingredient)) ?? [];

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
  const agendaDays = $derived(days.filter((d) => d.events.length > 0 || mealsOn(d.key).length > 0));

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
      ? (chips.length
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

{#snippet wxBadge(key: string, cls = '')}
  {@const w = wx(key)}
  {#if w}
    <span class="inline-flex items-center gap-1 text-[.8rem] text-muted tabular-nums font-medium {cls}" title={`${w.label}, high ${w.hi}°, low ${w.lo}°`}>
      <svg class="size-[1.1rem] fill-none stroke-current [stroke-width:2] [stroke-linecap:round] [stroke-linejoin:round]" viewBox="0 0 24 24" aria-hidden="true">{@html iconMarkup(w.icon)}</svg>
      <b class="text-fg font-semibold">{w.hi}°</b><i class="not-italic opacity-75">{w.lo}°</i>
      <span class="sr-only">{`${w.label}, high ${w.hi}°, low ${w.lo}°`}</span>
    </span>
  {/if}
{/snippet}

{#snippet dots(ev: CalEvent)}
  {#each whoOf(ev) as p (p.id)}<i class="cal-dot" style:--c={p.color} title={p.name}></i>{/each}
{/snippet}

<div class="[--hh:3.5rem] [--c:var(--accent)]">
  <header class="flex items-center gap-x-[.85rem] gap-y-[.6rem] flex-wrap mb-3 max-[40rem]:grid max-[40rem]:grid-cols-[1fr_auto]">
    <div class="flex gap-[.35rem] items-center max-[40rem]:col-span-full">
      <button type="button" class="ghost cal-step size-10" onclick={() => go(prev)} disabled={!prev} aria-label={`Previous ${view === 'agenda' ? 'days' : view}`}><svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 18 9 12 15 6" /></svg></button>
      <button type="button" class="ghost m-0 w-auto py-[.45rem] px-4 rounded-full text-[.9rem] disabled:opacity-35 disabled:cursor-default max-[40rem]:flex-1" onclick={() => (cursor = todayKey)} disabled={cursor === todayKey && view !== 'month'}>Today</button>
      <button type="button" class="ghost cal-step size-10" onclick={() => go(next)} disabled={!next} aria-label={`Next ${view === 'agenda' ? 'days' : view}`}><svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 18 15 12 9 6" /></svg></button>
    </div>
    <h2 class="order-[-1] m-0 flex-[1_1_11rem] text-left [font-size:clamp(1.15rem,1rem+.6vw,1.45rem)] whitespace-nowrap tracking-[-.02em] max-[40rem]:col-span-full max-[40rem]:row-start-1" aria-live="polite">{title}</h2>
    <div class="seg-group mb-3 max-[40rem]:grid max-[40rem]:grid-cols-4 max-[40rem]:col-span-full" role="group" aria-label="Calendar view">
      {#each VIEWS as v (v.id)}
        <button type="button" class="seg-btn" aria-pressed={view === v.id} onclick={() => setView(v.id)}>{v.label}</button>
      {/each}
    </div>
    {#if chips.length > 0}
      <div class="flex flex-wrap items-center gap-[.3rem] ml-auto mb-5 max-[40rem]:col-span-full max-[40rem]:ml-0" role="group" aria-label="Show whose events">
        {#each chips as p (p.id)}
          <button type="button" class="person-pill {only.length > 0 && !only.includes(p.id) ? 'opacity-50' : ''}" style:--c={p.color} title={p.name} aria-label={p.name} aria-pressed={only.includes(p.id)} onclick={() => toggle(p.id)}>
            <span class="avatar size-[1.6rem] text-[.78rem]" aria-hidden="true">{initial(p)}</span>{#if only.includes(p.id)}<span class="pn">{p.name}</span>{/if}
          </button>
        {/each}
        {#if only.length > 0}<button type="button" class="inline-flex items-center justify-center rounded-full w-[1.9rem] h-[1.9rem] m-0 p-0 text-[1.1rem] leading-none bg-transparent text-muted shadow-none [border:1px_dashed_var(--border)]" onclick={() => (only = [])} aria-label="Show everyone" title="Show everyone">×</button>{/if}
      </div>
    {/if}
    {#if slotsPresent.length > 0}
      <div class="flex flex-wrap items-center gap-[.3rem] mb-5 max-[40rem]:col-span-full {chips.length > 0 ? '' : 'ml-auto max-[40rem]:ml-0'}" role="group" aria-label="Show meals">
        {#each slotsPresent as slot (slot)}
          <button type="button" class="cal-toggle" style:--c={SLOT_COLOR[slot]} aria-pressed={shownSlots.includes(slot)} onclick={() => toggleSlot(slot)}>{SLOT_LABEL[slot]}</button>
        {/each}
      </div>
    {/if}
  </header>

  {#if view === 'month'}
    <div class="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-[6px] max-[40rem]:gap-[2px]" aria-hidden="true">{#each weekdays as w}<span class="text-center text-[.7rem] [font-weight:650] uppercase tracking-[.06em] text-muted py-[.35rem] px-0">{w}</span>{/each}</div>
    <div class="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-[6px] max-[40rem]:gap-[2px]">
      {#each days as { key, events: evs } (key)}
        {@const { banners: multi, rest } = split.get(key)!}
        <button
          type="button"
          class="cal-cell {parseKey(key).m !== cur.m ? 'opacity-40' : ''} {key === cursor ? 'border-accent shadow-[0_0_0_3px_var(--ring)]' : ''}"
          aria-label={`${fmt({ weekday: 'long', month: 'long', day: 'numeric' }, key)}, ${evs.length} events`}
          aria-pressed={key === cursor}
          onclick={() => openDay(key)}
          aria-haspopup="dialog"
        >
          <span class="flex items-center justify-between gap-1 max-[40rem]:justify-center"><span class="font-semibold text-[.95rem] leading-[1.7rem] py-0 px-[.3rem] {key === todayKey ? 'bg-accent text-accent-fg rounded-full min-w-[1.7rem] text-center' : ''}">{+key.slice(8, 10)}</span>{@render wxBadge(key, 'max-[40rem]:hidden')}</span>
          {#each multi as ev (ev.id)}
            {@const [from, to] = spanKeys(ev)}
            <span class="max-[40rem]:hidden {key !== from && key !== to ? 'cal-chip-mid' : 'cal-chip-multi'}" style:--c={colorOf(ev)}>{#if key === from}{ev.title}{:else if key === to}ends{ev.allDay ? '' : ` ${formatTime(ev.end, timeZone, locale)}`}{:else}<span class="sr-only">{ev.title}</span>{/if}</span>
          {/each}
          {#each rest.slice(0, 3) as ev (ev.id)}<span class="cal-chip max-[40rem]:hidden" style:--c={colorOf(ev)}>{ev.title}</span>{/each}
          {#if rest.length > 3}<span class="text-muted py-0 px-1 max-[40rem]:hidden">+{rest.length - 3} more</span>{/if}
          {#each mealsOn(key) as m (m.id)}<span class="cal-chip max-[40rem]:hidden" style:--c={SLOT_COLOR[m.slot]} title={SLOT_LABEL[m.slot]}>{m.title}</span>{/each}
          {#if evs.length > 0}<span class="hidden max-[40rem]:flex gap-[3px] justify-center" aria-hidden="true">{#each evs.slice(0, 4) as ev (ev.id)}<i class="cal-dot" style:--c={colorOf(ev)}></i>{/each}</span>{/if}
        </button>
      {/each}
    </div>
  {:else if view === 'week' || view === 'day'}
    <div class="[--gutter:3.25rem] max-[40rem]:[--gutter:2.75rem] [container-type:inline-size] max-h-[max(28rem,calc(100dvh-11rem))] overflow-auto border border-solid border-line rounded-[16px] bg-card relative" bind:this={scroller} style:--n={cols.length}>
      <div class="sticky top-0 z-[3] bg-card [border-bottom:1px_solid_var(--border)]">
        <div class="grid [grid-template-columns:var(--gutter)_repeat(var(--n),minmax(0,1fr))] min-w-[32rem]">
          <span class="text-[.7rem] text-muted text-right pt-[.3rem] pr-2"></span>
          {#each cols as c (c.id)}
            {#if view === 'week'}
              <button type="button" class="cal-colhead" onclick={() => openDay(c.day)} aria-haspopup="dialog"
                aria-label={fmt({ weekday: 'long', month: 'long', day: 'numeric' }, c.day)}>
                <span class="text-[.7rem] [font-weight:650] uppercase tracking-[.06em] {c.day === todayKey ? 'text-accent' : 'text-muted'}">{fmt({ weekday: 'short' }, c.day)}</span>
                <span class="text-[1.3rem] font-semibold text-center min-w-8 leading-8 rounded-full @max-[46rem]:text-[1.15rem] {c.day === todayKey ? 'bg-accent text-accent-fg' : ''}">{+c.day.slice(8, 10)}</span>
                {@render wxBadge(c.day, '@max-[46rem]:text-[.75rem] @max-[46rem]:[&_i]:hidden @max-[46rem]:[&_svg]:hidden')}
              </button>
            {:else}
              <div class="flex flex-col flex-wrap items-center justify-center gap-2 py-2 px-0 m-0 border-solid [border-width:0_0_0_1px] border-line bg-transparent text-fg font-normal hover:bg-card2" style:--c={c.person?.color}>
                {#if c.person}<span class="avatar size-[1.6rem] text-[.78rem]" aria-hidden="true">{initial(c.person)}</span><span class="[font-weight:650]">{c.person.name}</span>
                {:else}<span class="text-[.7rem] [font-weight:650] uppercase tracking-[.06em] text-muted">{fmt({ weekday: 'short' }, c.day)}</span><span class="text-[1.3rem] font-semibold text-center min-w-8 leading-8 rounded-full @max-[46rem]:text-[1.15rem] {c.day === todayKey ? 'bg-accent text-accent-fg' : ''}">{+c.day.slice(8, 10)}</span>{/if}
                {#if c === cols[0]}{@render wxBadge(c.day, 'basis-full justify-center')}{/if}
              </div>
            {/if}
          {/each}
        </div>
        {#if banners.spans.length > 0}
          <div class="grid [grid-template-columns:var(--gutter)_repeat(var(--n),minmax(0,1fr))] min-w-[32rem] [border-top:1px_solid_var(--border)] gap-y-[2px] py-1" style:--lanes={banners.lanes}>
            <span class="text-[.7rem] text-muted text-right pr-2 [grid-column:1] [grid-row:1/span_var(--lanes,1)] self-center">multi-day</span>
            {#each banners.spans as s (s.ev.id)}
              <button type="button" class="cal-banner {s.opensHere ? '' : '[&&]:ml-0 [&&]:rounded-l-none [&&]:border-l-0'} {s.closesHere ? '' : '[&&]:mr-0 [&&]:rounded-r-none [&&]:border-r-0'}" style:--c={colorOf(s.ev)} title={`${s.ev.title}, ${bannerText(s)}`}
                style:grid-column="{s.from + 2} / {s.to + 3}" style:grid-row={s.lane + 1} onclick={() => openDay(cols[s.from]!.day)} aria-haspopup="dialog">
                <b class="font-semibold whitespace-nowrap overflow-hidden text-ellipsis flex-[0_1_auto] min-w-[4ch]">{s.ev.title}</b><span class="text-muted whitespace-nowrap overflow-hidden text-ellipsis flex-none text-[.72rem]">{bannerText(s)}</span>
              </button>
            {/each}
          </div>
        {/if}
        {#if cols.some((c) => allDayOf(c).length > 0)}
          <div class="grid [grid-template-columns:var(--gutter)_repeat(var(--n),minmax(0,1fr))] min-w-[32rem] [border-top:1px_solid_var(--border)]">
            <span class="text-[.7rem] text-muted text-right self-center pr-2">all-day</span>
            {#each cols as c (c.id)}
              <div class="grid gap-[2px] p-1 [border-left:1px_solid_var(--border)] content-start min-w-0">{#each allDayOf(c) as ev (ev.id)}<button type="button" class="cal-chip-ad" style:--c={c.person?.color ?? colorOf(ev)} title={ev.title} onclick={() => openDay(c.day)} aria-haspopup="dialog">{ev.title}</button>{/each}</div>
            {/each}
          </div>
        {/if}
        {#if cols.some((c) => mealsOn(c.day).length > 0)}
          <div class="grid [grid-template-columns:var(--gutter)_repeat(var(--n),minmax(0,1fr))] min-w-[32rem] [border-top:1px_solid_var(--border)]">
            <span class="text-[.7rem] text-muted text-right self-center pr-2">meals</span>
            {#each view === 'day' ? [cols[0]!] : cols as c (c.id)}
              <div class="grid gap-[2px] p-1 [border-left:1px_solid_var(--border)] content-start min-w-0" style:grid-column={view === 'day' ? '2 / -1' : undefined}>
                {#each mealsOn(c.day) as m (m.id)}
                  <button type="button" class="cal-chip-ad" style:--c={SLOT_COLOR[m.slot]} title={`${SLOT_LABEL[m.slot]}: ${m.title}`} aria-haspopup="dialog" onclick={() => openMeal(m.id)}>
                    <span class="[font-size:.62rem] uppercase tracking-[.05em] opacity-80 mr-[.3rem]">{SLOT_LABEL[m.slot].slice(0, view === 'day' ? undefined : 1)}</span>{m.title}{#if m.prepMinutes}<span class="opacity-75 tabular-nums"> · {m.prepMinutes}m</span>{/if}
                  </button>
                {/each}
              </div>
            {/each}
          </div>
        {/if}
      </div>
      <div class="grid [grid-template-columns:var(--gutter)_repeat(var(--n),minmax(0,1fr))] min-w-[32rem] relative [grid-template-rows:calc(var(--hh)*var(--rows,24))]" style:--rows={hourSpan.count}>
        <div class="text-[.7rem] text-muted text-right pt-[.3rem] pr-2 relative">{#each hours as h, i (h)}<span class="absolute right-2 {i === 0 ? 'mt-[2px]' : '-translate-y-1/2'}" style:top="calc(var(--hh) * {i})">{hourLabel(h)}</span>{/each}</div>
        {#each cols as c (c.id)}
          <div class="relative [border-left:1px_solid_var(--border)] bg-[linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:100%_var(--hh)] {c.day === todayKey ? '[background-color:color-mix(in_srgb,var(--accent)_5%,transparent)]' : ''}">
            {#each placed(c) as p (p.ev.id)}
              <button type="button" class="cal-block {p.height < 50 ? '[&&]:py-[.1rem]' : ''}" title={`${p.ev.title}, ${when(p.ev)}`} onclick={() => openDay(c.day)} aria-haspopup="dialog"
                style:--c={c.person?.color ?? colorOf(p.ev)}
                style:top="calc(var(--hh) * {rows(p.top)})" style:height="calc(var(--hh) * {p.height / 60} - 2px)"
                style:left="calc({p.col / p.cols} * 100% + 1px)" style:width="calc({1 / p.cols} * 100% - 2px)">
                <b class="[display:-webkit-box] [-webkit-box-orient:vertical] {p.height < 50 ? '[-webkit-line-clamp:1] [line-clamp:1]' : '[-webkit-line-clamp:4] [line-clamp:4]'} overflow-hidden font-semibold [overflow-wrap:anywhere]">{p.ev.title}</b>
                <span class="text-muted whitespace-nowrap overflow-hidden text-ellipsis {p.height < 50 ? 'hidden' : 'block'}">{formatTime(p.ev.start, timeZone, locale)}{#if p.ev.location && !p.ev.title.includes(p.ev.location)}{' · '}{p.ev.location}{/if}</span>
              </button>
            {/each}
            {#if c.day === todayKey && nowInGrid}<div class="absolute inset-x-0 h-[2px] bg-danger z-[2] pointer-events-none before:content-[''] before:absolute before:-left-1 before:-top-[3px] before:size-2 before:rounded-full before:bg-danger" style:top="calc(var(--hh) * {rows(nowMinutes)})"></div>{/if}
          </div>
        {/each}
      </div>
    </div>
  {:else}
    <section>
      {#if agendaDays.length === 0}
        <p class="text-muted">Nothing scheduled in these {AGENDA_DAYS} days.</p>
      {/if}
      {#each agendaDays as d (d.key)}
        <h3 class="flex items-center gap-3 mt-5 mb-2 mx-0 text-[.72rem] [font-weight:650] uppercase tracking-[.07em] text-muted first:mt-0">{dayLabel(d.key, todayKey, locale)} {@render wxBadge(d.key)}</h3>
        <ul class="list-none m-0 p-0">
          {#each d.events as ev (ev.id + d.key)}
            <li class="flex gap-[.85rem] items-baseline py-[.7rem] pr-0 pl-[.8rem] [border-left:4px_solid_var(--c,var(--accent))] [&:not(:first-child)]:[border-top:1px_solid_var(--border)]" style:--c={colorOf(ev)}>
              <span class="text-muted min-w-[8.5rem] text-[.9rem] tabular-nums max-[40rem]:min-w-[6.5rem]">{ev.allDay ? 'All day' : isBanner(ev) ? agendaWhen(ev, d.key) : `${formatTime(ev.start, timeZone, locale)}–${formatTime(ev.end, timeZone, locale)}`}</span>
              <span class="font-medium min-w-0 [overflow-wrap:anywhere]">{ev.title}{#if ev.location}{' '}<span class="text-muted font-normal">· {ev.location}</span>{/if}</span>
              {#if roster.length}<span class="inline-flex gap-[3px] ml-auto">{@render dots(ev)}</span>{/if}
            </li>
          {/each}
          {#each mealsOn(d.key) as m (m.id)}
            <li class="flex gap-[.85rem] items-baseline py-[.7rem] pr-0 pl-[.8rem] [border-left:4px_solid_var(--c)] [&:not(:first-child)]:[border-top:1px_solid_var(--border)]" style:--c={SLOT_COLOR[m.slot]}>
              <span class="text-muted min-w-[8.5rem] text-[.9rem] max-[40rem]:min-w-[6.5rem]">{SLOT_LABEL[m.slot]}</span>
              <button type="button" class="ghost [&&]:m-0 [&&]:p-0 [&&]:w-auto [&&]:text-left [&&]:font-medium min-w-0 [overflow-wrap:anywhere] bg-transparent border-0 shadow-none text-fg" aria-haspopup="dialog" onclick={() => openMeal(m.id)}>{m.title}</button>
            </li>
          {/each}
        </ul>
      {/each}
    </section>
  {/if}

  {#snippet stepBtn(kind: 'prev' | 'next' | 'close', label: string, onclick: () => void, disabled = false)}
    <button type="button" class="ghost cal-step flex-none size-[2.4rem] {kind === 'close' ? '[&&]:ml-1' : ''}" {onclick} {disabled} aria-label={label}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {#if kind === 'prev'}<polyline points="15 18 9 12 15 6" />{:else if kind === 'next'}<polyline points="9 18 15 12 9 6" />{:else}<line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />{/if}
      </svg>
    </button>
  {/snippet}

  <dialog class="cal-dialog w-[min(32rem,calc(100vw-2rem))] max-h-[min(40rem,85dvh)]" bind:this={dlg} aria-labelledby="day-title"
    onclick={(e) => e.target === dlg && dlg?.close()}>
    <header class="cal-dialog-head">
      {@render stepBtn('prev', 'Previous day', () => (cursor = addDays(cursor, -1)), !canPrevDay)}
      <div class="flex-1 min-w-0">
        <h3 class="[&&]:m-0 text-[1.15rem] tracking-[-.02em]" id="day-title">{fmt({ weekday: 'long' }, cursor)}</h3>
        <p class="m-0 text-[.88rem]">{fmt({ month: 'long', day: 'numeric', year: 'numeric' }, cursor)}{#if cursor === todayKey}{' · Today'}{/if}</p>
      </div>
      {@render wxBadge(cursor)}
      {@render stepBtn('next', 'Next day', () => (cursor = addDays(cursor, 1)), !canNextDay)}
      {@render stepBtn('close', 'Close', () => dlg?.close())}
    </header>
    {#if dayMeals.length > 0}
      <ul class="list-none m-0 pt-3 px-5 pb-1 grid gap-2">
        {#each dayMeals as m (m.id)}
          <li>
            <button type="button" class="w-full m-0 text-left flex items-baseline gap-[.6rem] py-[.6rem] px-[.9rem] rounded-[4px] [border-left:4px_solid_var(--c)] bg-[color-mix(in_srgb,var(--c)_8%,transparent)] text-fg shadow-none border-y-0 border-r-0 hover:filter-none hover:bg-[color-mix(in_srgb,var(--c)_16%,transparent)]" style:--c={SLOT_COLOR[m.slot]} aria-haspopup="dialog" onclick={() => openMeal(m.id)}>
              <span class="text-[.75rem] uppercase tracking-[.06em] font-semibold text-muted min-w-[4.5rem]">{SLOT_LABEL[m.slot]}</span>
              <span class="font-semibold [overflow-wrap:anywhere]">{m.title}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
    {#if dayEvents.length === 0}
      {#if dayMeals.length === 0}<p class="py-6 px-5 m-0">Nothing scheduled.</p>{/if}
    {:else}
      <ul class="list-none m-0 pt-2 px-5 pb-4">
        {#each dayEvents as ev (ev.id + cursor)}
          <li class="py-[.85rem] pr-0 pl-[.9rem] my-2 mx-0 rounded-[4px] [border-left:4px_solid_var(--c,var(--accent))] bg-[color-mix(in_srgb,var(--c,var(--accent))_6%,transparent)]" style:--c={colorOf(ev)}>
            <div class="flex flex-wrap gap-x-[.6rem] gap-y-1 items-center text-[.85rem] text-muted tabular-nums">
              <span class="text-accent font-semibold">{detailWhen(ev)}</span>
              {#if duration(ev)}<span>{duration(ev)}</span>{/if}
              {#if position(ev, cursor)}<span class="cal-pill">{position(ev, cursor)}</span>{/if}
              {#each roster.length ? whoOf(ev) : [] as p (p.id)}<span class="cal-pill-who" style:--c={p.color}>{p.name}</span>{/each}
            </div>
            <div class="mt-[.15rem] text-[1.05rem] font-semibold tracking-[-.01em] [overflow-wrap:anywhere]">{ev.title}</div>
            {#if ev.location}
              <div class="flex items-center gap-[.35rem] mt-[.2rem] text-[.9rem] text-muted"><svg class="size-[.95rem] flex-none fill-none stroke-current [stroke-width:2] [stroke-linecap:round] [stroke-linejoin:round]" viewBox="0 0 24 24" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>{ev.location}</div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </dialog>

  <dialog class="cal-dialog w-[min(30rem,calc(100vw-2rem))] max-h-[min(42rem,88dvh)]" bind:this={mealDlg} aria-labelledby="meal-title"
    onclick={(e) => e.target === mealDlg && mealDlg?.close()}>
    <header class="cal-dialog-head">
      {@render stepBtn('prev', 'Previous meal', () => (pickedId = prevMeal!.meal.id), !prevMeal)}
      <div class="flex-1 min-w-0">
        {#if picked}<p class="m-0 text-[.75rem] uppercase tracking-[.07em] font-semibold" style:color={SLOT_COLOR[picked.meal.slot]}>{fmt({ weekday: 'long', month: 'short', day: 'numeric' }, picked.key)} · {SLOT_LABEL[picked.meal.slot]}</p>{/if}
      </div>
      {@render stepBtn('next', 'Next meal', () => (pickedId = nextMeal!.meal.id), !nextMeal)}
      {@render stepBtn('close', 'Close', () => mealDlg?.close())}
    </header>
    {#if picked}
      {@const m = picked.meal}
      <div class="grid gap-4 py-4 px-5 pb-5">
        <h3 class="[&&]:m-0 text-[1.3rem] tracking-[-.02em] [overflow-wrap:anywhere]" id="meal-title">{m.title}</h3>
        {#if m.prepMinutes || m.ingredients?.length}
          <div class="flex flex-wrap gap-[.4rem] text-[.8rem] tabular-nums">
            {#if m.prepMinutes}<span class="cal-pill">{m.prepMinutes} min prep</span>{/if}
            {#if m.ingredients?.length}<span class="cal-pill">{m.ingredients.length} ingredients</span>{/if}
          </div>
        {/if}
        {#if m.description}<p class="m-0 text-fg [overflow-wrap:anywhere]">{m.description}</p>{/if}
        {#if m.note}<p class="m-0 text-muted [overflow-wrap:anywhere]">{m.note}</p>{/if}
        {#if m.ingredients?.length}
          <div>
            <h4 class="cal-label">Ingredients</h4>
            <ul class="meal-ingredients [&&]:mb-0">
              {#each m.ingredients as ing, i (ing + i)}
                {@const also = alsoIn(ing)}
                <li class="[overflow-wrap:anywhere]">{ing}{#if also.length}<span class="text-muted text-[.8rem]"> · also in {also.join(', ')}</span>{/if}</li>
              {/each}
            </ul>
          </div>
        {/if}
        {#if m.instructions?.length}
          <div>
            <h4 class="cal-label">Instructions</h4>
            <ol class="list-decimal pl-[1.2rem] m-0 grid gap-[.4rem] text-[.92rem]">
              {#each m.instructions as step, i (i)}<li class="pl-[.2rem] [overflow-wrap:anywhere]">{step}</li>{/each}
            </ol>
          </div>
        {/if}
        {#if !m.description && !m.ingredients?.length && !m.instructions?.length}
          <p class="m-0 text-muted">No details for this meal.</p>
        {/if}
        {#if m.recipeUrl}<a class="font-semibold" href={m.recipeUrl} target="_blank" rel="noopener noreferrer">Open recipe</a>{/if}
      </div>
    {/if}
  </dialog>
</div>

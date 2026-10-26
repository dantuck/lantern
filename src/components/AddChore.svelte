<script lang="ts">
  import ScheduleFields from './ScheduleFields.svelte';
  import Stepper from './Stepper.svelte';
  import { choreSuggestions, describeSchedule, EVERY_DAY, normalizeDays, PERIODS, PERIOD_LABEL, WEEKDAYS_MASK, WEEKENDS_MASK, weekStart, type ChoreTemplate, type Period, type Routine } from '../lib/choreTypes';

  /**
   * The form for one new chore: what it is, what it is worth, when in the day, and which days.
   * While typing the title, chores already on other lists are offered; picking one adds it with the same points and schedule.
   */
  let { person, day, busy, send, routines = [], labels = PERIOD_LABEL, bare = false }: { bare?: boolean; labels?: Record<Period, string>; person: string | null; day: string; busy: boolean; send: (payload: Record<string, unknown>) => Promise<boolean>; routines?: Routine[] } = $props();

  const uid = $props.id();

  let title = $state('');
  let points = $state(1);
  let period = $state<Period>('any');
  let once = $state(false);
  let days = $state(EVERY_DAY);
  let every = $state(1);
  let untilDone = $state(false);
  let kept = $state(0);
  let optional = $state(false);
  // svelte-ignore state_referenced_locally
  let from = $state(weekStart(day));
  // svelte-ignore state_referenced_locally
  let date = $state(day);

  // The last points, time of day and repeat used are remembered in this browser, so a run of similar chores needs no re-picking.
  const KEY = 'lantern:add-chore';
  let saved: string | null = null; // what storage holds, so loading it does not write it straight back
  let loaded = false;
  $effect(() => {
    try {
      saved = localStorage.getItem(KEY);
      const v = JSON.parse(saved ?? 'null');
      if (v && Number.isFinite(v.points)) points = Math.min(100, Math.max(0, v.points));
      if (v && PERIODS.includes(v.period)) period = v.period;
      // Only the repeating days are remembered, never "just once".
      if (v && Number.isInteger(v.days) && v.days >= 1 && v.days <= EVERY_DAY) days = v.days;
      else if (v && v.when === 'weekdays') days = WEEKDAYS_MASK; // an older save
      else if (v && v.when === 'weekends') days = WEEKENDS_MASK;
    } catch { /* private window or bad data: the usual defaults */ }
    loaded = true;
  });
  $effect(() => {
    const v = JSON.stringify({ points, period, days });
    if (!loaded || v === saved) return;
    saved = v;
    try { localStorage.setItem(KEY, v); } catch { /* not saved; nothing breaks */ }
  });

  /** Flips one weekday. The last day cannot be turned off. */

  // Opened in a drawer, the name is ready to type. A moment's wait lets the drawer settle its own focus first.
  $effect(() => {
    if (!bare) return;
    const t = setTimeout(() => input?.focus(), 80);
    return () => clearTimeout(t);
  });

  let focused = $state(false);
  let active = $state(-1);
  const listId = `chore-suggest-${uid}`;
  // In the drawer nothing is offered until something is typed, so it opens clean; the inline form also lists chores to pick from on focus.
  const browsing = $derived(focused && (!bare || title.trim() !== ''));
  const suggestions = $derived(browsing ? choreSuggestions(routines, person, title, day) : []);
  // Typing offers the text itself first ("Add “taco”", with the points and schedule below), then matching chores from other lists.
  const typed = $derived(focused ? title.trim() : '');
  const offset = $derived(typed ? 1 : 0);
  const rows = $derived(offset + suggestions.length);

  // The list is a popover (the top layer) so the section's scrolling card cannot clip it, and it floats instead of moving the form.
  let input = $state<HTMLInputElement>();
  let list = $state<HTMLUListElement>();
  function place() {
    if (!input || !list) return;
    // The visual viewport is what is really on screen: on phones it excludes the on-screen keyboard, which innerHeight does not.
    const vv = window.visualViewport, top = vv?.offsetTop ?? 0, height = vv?.height ?? window.innerHeight;
    const r = input.getBoundingClientRect(), below = top + height - r.bottom - 12, above = r.top - top - 12;
    const up = below < 160 && above > below;
    const { style } = list;
    style.left = `${r.left}px`;
    style.width = `${r.width}px`;
    style.maxHeight = `${Math.max(120, Math.min(288, up ? above : below))}px`;
    style.top = up ? 'auto' : `${r.bottom + 4}px`;
    style.bottom = up ? `${window.innerHeight - r.top + 4}px` : 'auto';
  }
  $effect(() => {
    if (!list) return;
    try { list.showPopover(); } catch { /* no popover support: it stays where it is */ }
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    window.visualViewport?.addEventListener('resize', place);
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place); window.visualViewport?.removeEventListener('resize', place); };
  });
  $effect(() => { if (rows) place(); }); // the list grew or shrank, or just appeared

  async function pick(c: ChoreTemplate) {
    if (await send({ action: 'item_add', person, title: c.title, points: c.points, period: c.period, days: c.days, onceDate: c.onceDate, everyWeeks: c.everyWeeks, weekAnchor: c.weekAnchor, untilDone: c.untilDone, keptPoints: c.keptPoints, optional: c.optional })) { title = ''; active = -1; input?.focus(); } // the list stays open (minus what was just added), ready for the next one
  }
  function keys(e: KeyboardEvent) {
    if (e.key === 'Escape') { focused = false; return; }
    if (!rows) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focused = true;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + rows + 1) % (rows + 1) - 1;
    } else if (e.key === 'Enter' && active >= offset) { e.preventDefault(); const s = suggestions[active - offset]; if (s) void pick(s); }
  }

  function submit(e: SubmitEvent) {
    e.preventDefault();
    void add();
  }
  async function add() {
    const t = title.trim();
    if (!t) return;
    const schedule = once ? { days: null, onceDate: date } : { days: normalizeDays(days), onceDate: null, everyWeeks: every, weekAnchor: every > 1 ? from : null, untilDone, keptPoints: kept };
    if (await send({ action: 'item_add', person, title: t, points: Number(points) || 0, period, optional, ...schedule })) { title = ''; input?.focus(); }
  }
</script>

<form class="grid grid-cols-2 items-end gap-2 {bare ? '' : 'my-3 p-3 rounded-[var(--radius-sm)] border border-dashed border-line'}" onsubmit={submit}>
  <div class="col-span-2">
    <input class="m-0" bind:this={input} bind:value={title} maxlength="80" placeholder="Add a chore" aria-label="New chore" autocomplete="off" autocapitalize="sentences" enterkeyhint="done"
      role="combobox" aria-expanded={rows > 0} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
      onfocus={() => (focused = true)} onblur={() => (focused = false)} oninput={() => { focused = true; active = -1; }} onkeydown={keys} />
    {#if rows > 0}
      <ul bind:this={list} popover="manual" id={listId} role="listbox" aria-label="Chores already on other lists" class="m-0 p-1 list-none overflow-auto text-fg rounded-[var(--radius-sm)] border border-solid border-line bg-card shadow-[var(--shadow-md)] [inset:auto]">
        {#if typed}
          <!-- svelte-ignore a11y_click_events_have_key_events -- as below: keyboards use the input itself, where Enter adds the typed chore -->
          <li id="{listId}-0" role="option" aria-selected={active === 0} class="flex items-center gap-2 px-2 py-2 rounded-[var(--radius-sm)] cursor-pointer pointer-coarse:min-h-11 {active === 0 ? 'bg-line' : ''}" onmousedown={(e) => e.preventDefault()} onclick={() => void add()}>
            <span class="min-w-0 flex-1 [overflow-wrap:anywhere]">Add “{typed}”<span class="note block text-[.85rem]">{labels[period]} · {describeSchedule(once ? { days: null, onceDate: date } : { days: normalizeDays(days), onceDate: null, everyWeeks: every, untilDone })}</span></span>
            <span class="text-[.9rem] [font-weight:650] tabular-nums">+{Number(points) || 0}</span>
            <span class="text-[.85rem] text-accent">Add</span>
          </li>
        {/if}
        {#each suggestions as c, j (c.title)}
          {@const i = j + offset}
          <!-- svelte-ignore a11y_click_events_have_key_events -- keyboards pick through the input (arrows and Enter), as in any combobox; mousedown keeps it focused so its blur does not close the list before the click lands, and picking on click means scrolling by touch never adds a chore -->
          <li id="{listId}-{i}" role="option" aria-selected={i === active} class="flex items-baseline gap-2 px-2 py-2 rounded-[var(--radius-sm)] cursor-pointer pointer-coarse:min-h-11 {i === active ? 'bg-line' : ''}" onmousedown={(e) => e.preventDefault()} onclick={() => void pick(c)}>
            <span class="min-w-0 flex-1 [overflow-wrap:anywhere]">{c.title}<span class="note block text-[.85rem]">{labels[c.period]} · {describeSchedule(c)}</span></span>
            <span class="text-[.9rem] [font-weight:650] tabular-nums">+{c.points}</span>
            <span class="text-[.85rem] text-accent">Add</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  <Stepper caption="Points" bind:value={points} min={0} max={100} label="Points" />
  <label class="cap-field">Time of day <select class="m-0" bind:value={period} aria-label="Time of day">{#each PERIODS as p (p)}<option value={p}>{labels[p]}</option>{/each}</select></label>
  <ScheduleFields class="col-span-2" {day} bind:once bind:days bind:date bind:every bind:from bind:untilDone bind:keptPoints={kept} bind:optional earns={person !== null} />
  <button class="small col-span-2 [&&&]:w-full" type="submit" disabled={busy || !title.trim()}>Add chore</button>
</form>

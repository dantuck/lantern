<script lang="ts">
  import Stepper from './Stepper.svelte';
  import { choreSuggestions, describeSchedule, PERIODS, PERIOD_LABEL, WEEKDAYS_MASK, WEEKENDS_MASK, type ChoreTemplate, type Period, type Routine } from '../lib/choreTypes';

  /**
   * The form for one new chore: what it is, what it is worth, when in the day, and which days.
   * While typing the title, chores already on other lists are offered; picking one adds it with the same points and schedule.
   */
  let { person, day, busy, send, routines = [] }: { person: string | null; day: string; busy: boolean; send: (payload: Record<string, unknown>) => Promise<boolean>; routines?: Routine[] } = $props();

  const uid = $props.id();
  type When = 'every' | 'weekdays' | 'weekends' | 'once';
  let title = $state('');
  let points = $state(1);
  let period = $state<Period>('any');
  let when = $state<When>('every');
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
      if (v && ['every', 'weekdays', 'weekends'].includes(v.when)) when = v.when; // "just once" is not carried over
    } catch { /* private window or bad data: the usual defaults */ }
    loaded = true;
  });
  $effect(() => {
    const v = JSON.stringify({ points, period, when });
    if (!loaded || v === saved) return;
    saved = v;
    try { localStorage.setItem(KEY, v); } catch { /* not saved; nothing breaks */ }
  });

  const DAYS = { every: null, weekdays: WEEKDAYS_MASK, weekends: WEEKENDS_MASK }; // a null mask is every day

  let focused = $state(false);
  let active = $state(-1);
  const listId = `chore-suggest-${uid}`;
  const suggestions = $derived(focused ? choreSuggestions(routines, person, title, day) : []);

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
  $effect(() => { if (suggestions.length) place(); }); // the list grew or shrank, or just appeared

  async function pick(c: ChoreTemplate) {
    if (await send({ action: 'item_add', person, title: c.title, points: c.points, period: c.period, days: c.days, onceDate: c.onceDate })) { title = ''; active = -1; input?.focus(); } // the list stays open (minus what was just added), ready for the next one
  }
  function keys(e: KeyboardEvent) {
    if (e.key === 'Escape') { focused = false; return; }
    if (!suggestions.length) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focused = true;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + suggestions.length + 1) % (suggestions.length + 1) - 1;
    } else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); void pick(suggestions[active]); }
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const schedule = when === 'once' ? { days: null, onceDate: date } : { days: DAYS[when], onceDate: null };
    if (await send({ action: 'item_add', person, title: t, points: Number(points) || 0, period, ...schedule })) { title = ''; input?.focus(); }
  }
</script>

<form class="grid grid-cols-2 gap-2 my-3 p-3 rounded-[var(--radius-sm)] border border-dashed border-line min-[40rem]:flex min-[40rem]:flex-wrap min-[40rem]:items-end" onsubmit={submit}>
  <div class="col-span-2 min-[40rem]:flex-[1_1_14rem]">
    <input class="m-0" bind:this={input} bind:value={title} maxlength="80" placeholder="Add a chore" aria-label="New chore" autocomplete="off"
      role="combobox" aria-expanded={suggestions.length > 0} aria-controls={listId} aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
      onfocus={() => (focused = true)} onblur={() => (focused = false)} oninput={() => { focused = true; active = -1; }} onkeydown={keys} />
    {#if suggestions.length > 0}
      <ul bind:this={list} popover="manual" id={listId} role="listbox" aria-label="Chores already on other lists" class="m-0 p-1 list-none overflow-auto text-fg rounded-[var(--radius-sm)] border border-solid border-line bg-card shadow-[var(--shadow-md)] [inset:auto]">
        {#each suggestions as c, i (c.title)}
          <!-- svelte-ignore a11y_click_events_have_key_events -- keyboards pick through the input (arrows and Enter), as in any combobox; mousedown keeps it focused so its blur does not close the list before the click lands, and picking on click means scrolling by touch never adds a chore -->
          <li id="{listId}-{i}" role="option" aria-selected={i === active} class="flex items-baseline gap-2 px-2 py-2 rounded-[var(--radius-sm)] cursor-pointer pointer-coarse:min-h-11 {i === active ? 'bg-line' : ''}" onmousedown={(e) => e.preventDefault()} onclick={() => void pick(c)}>
            <span class="min-w-0 flex-1 [overflow-wrap:anywhere]">{c.title}<span class="note block text-[.85rem]">{PERIOD_LABEL[c.period]} · {describeSchedule(c)}</span></span>
            <span class="text-[.9rem] [font-weight:650] tabular-nums">+{c.points}</span>
            <span class="text-[.85rem] text-accent">Add</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  <Stepper caption="Points" class="col-span-2 min-[40rem]:col-auto min-[40rem]:w-[9.75rem]" bind:value={points} min={0} max={100} label="Points" />
  <label class="cap-field">Time of day <select class="m-0 min-[40rem]:w-auto" bind:value={period} aria-label="Time of day">{#each PERIODS as p (p)}<option value={p}>{PERIOD_LABEL[p]}</option>{/each}</select></label>
  <label class="cap-field {when === 'once' ? '' : 'col-span-2'} min-[40rem]:col-auto">Repeats <select class="m-0 min-[40rem]:w-auto" bind:value={when} aria-label="Repeats">
    <option value="every">Every day</option><option value="weekdays">Weekdays</option><option value="weekends">Weekends</option><option value="once">Just once</option>
  </select></label>
  {#if when === 'once'}<label class="cap-field">Date <input class="m-0" type="date" bind:value={date} required aria-label="Date" /></label>{/if}
  <button class="small col-span-2 [&&&]:w-full min-[40rem]:col-auto min-[40rem]:[&&&]:w-auto" type="submit" disabled={busy || !title.trim()}>Add chore</button>
</form>

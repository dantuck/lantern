<script lang="ts">
  import { dayClock } from '../lib/dayClock.svelte';
  import FeatherIcon from './FeatherIcon.svelte';
  import { chorePipe } from '../lib/chorePipe.svelte';
  import { toggleIn } from '../lib/arrays';
  import { blockFor, tally, formatCountdown, timeLeftMs, hoursLabel, lockedPoints, PERIODS, onToday, sections, waitingPoints, skippedToday, todaysRoutines, type ChoreItem, type ChoreState, type Period, type Routine } from '../lib/choreTypes';
  import { liveTimers } from '../lib/timerClient.svelte';
  import { onMount } from 'svelte';
  import { celebrate } from '../lib/celebrate.svelte';
  import { celebrationKeys } from '../lib/completion';
  import Confetti from './Confetti.svelte';
  import type { Person } from '../lib/people';

  let { initial, people, intro = '', demo = false, manageHref = '/chores/manage', inboxHref = '/inbox', personBase = '/chores' }: { initial: ChoreState; people: Person[]; intro?: string; demo?: boolean; manageHref?: string; inboxHref?: string; personBase?: string } = $props();

  // Rendered once from the server, then replaced by whatever the API answers after each change.
  // svelte-ignore state_referenced_locally
  let choreState = $state<ChoreState>(initial);
  // svelte-ignore state_referenced_locally
  const pipe = chorePipe(() => choreState, (s) => (choreState = s), demo);
  const busy = $derived(pipe.busy);
  const error = $derived(pipe.error);
  const send = pipe.send;

  const initialOf = (p: Person) => [...p.name][0]!.toUpperCase();

  /** One column per person, plus "Anyone" for chores nobody owns (and for households with no people set up). */
  const columns = $derived.by(() => {
    const today = todaysRoutines(choreState.routines);
    const skippedIn = (rs: readonly Routine[]) => skippedToday(rs.flatMap((r) => r.items));
    const cols: { id: string | null; name: string; person?: Person; routine?: Routine; items: ChoreItem[]; skipped: ChoreItem[] }[] = people.map((p) => {
      const routine = today.find((r) => r.person === p.id);
      return { id: p.id, name: p.name, person: p, ...(routine ? { routine } : {}), items: routine?.items ?? [], skipped: skippedIn(choreState.routines.filter((r) => r.person === p.id)) };
    });
    const isAnyone = (r: Routine) => !r.person || !people.some((p) => p.id === r.person);
    const anyone = today.filter(isAnyone).flatMap((r) => r.items);
    const anyoneSkipped = skippedIn(choreState.routines.filter(isAnyone));
    if (anyone.length > 0 || anyoneSkipped.length > 0 || people.length === 0) cols.push({ id: null, name: 'Anyone', items: anyone, skipped: anyoneSkipped });
    return cols;
  });
    // Confetti the moment someone's last chore gets ticked: big for the day, small for a time of day with a bonus.
  const party = celebrate(() => columns.flatMap((c) => celebrationKeys(c.id, c.items, c.routine?.bonuses)));
  const partyColor = $derived(columns.find((c) => party.key.startsWith(`${c.id}:`))?.person?.color ?? 'var(--accent)');
  const day = dayClock(() => choreState);
  const closed = $derived(day.closed);

  // --- Filters: whose chores, which time of day, and done or not. Remembered in this browser only. ---
  type Status = 'all' | 'todo' | 'done';
  let only = $state<string[]>([]); // person ids; '' stands for "Anyone"
  let status = $state<Status>('all');
  let period = $state<Period | 'all'>('all');
  const KEY = 'chores-filter';
  let loaded = false; // not reactive: only gates the first write until the saved choice has been read
  onMount(() => {
    try {
      const f = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { only?: unknown; status?: unknown; period?: unknown };
      if (Array.isArray(f.only)) only = f.only.filter((x): x is string => typeof x === 'string');
      if (f.status === 'todo' || f.status === 'done') status = f.status;
      if (typeof f.period === 'string' && (PERIODS as readonly string[]).includes(f.period)) period = f.period as Period;
    } catch { /* private window or bad data: start unfiltered */ }
    loaded = true;
  });
  $effect(() => {
    const saved = JSON.stringify({ only, status, period });
    if (!loaded) return;
    try { localStorage.setItem(KEY, saved); } catch { /* not remembered */ }
  });
  const filtering = $derived(only.length > 0 || status !== 'all' || period !== 'all');
  const clear = () => { only = []; status = 'all'; period = 'all'; };
  const toggle = (id: string) => { only = toggleIn(only, id); };
  /** The time-of-day choices that exist today, so the filter never offers an empty option. */
  const periodChoices = $derived.by(() => {
    const today = PERIODS.filter((p) => choreState.routines.some((r) => r.items.some((i) => onToday(i) && i.period === p)));
    return today.length > 1 ? today : [];
  });
  /** What a column shows after filtering: the chosen time of day, and only the chores in the chosen state. */
  const shown = (items: ChoreItem[]) =>
    sections(items)
      .filter((x) => period === 'all' || x.period === period)
      .map((x) => ({ ...x, items: x.items.filter((i) => status === 'all' || (status === 'done') === i.done) }))
      .filter((x) => x.items.length > 0);
  const visibleColumns = $derived(
    columns
      .filter((c) => only.length === 0 || only.includes(c.id ?? ''))
      .map((c) => ({ ...c, ...tally(c.items), rows: shown(c.items) }))
      // A column left empty only by the status or time-of-day filter is hidden rather than shown blank.
      .filter((c) => (status === 'all' && period === 'all') || c.rows.length > 0),
  );

  // Countdowns started on the person's page or on any other device. The page with the person's name is the one that rings.
  // svelte-ignore state_referenced_locally
  const clock = liveTimers(() => choreState, (s) => (choreState = s), { demo, busy: () => pipe.busy });
</script>

{#key party.burst}{#if party.burst > 0}<Confetti color={partyColor} size={party.size} />{/if}{/key}

{#if error}<p class="notice error" role="alert">{error}</p>{/if}

<header class="page-head flex items-start justify-between gap-x-4 gap-y-3 mb-4">
  <div class="min-w-0">
    <h1 class="mt-0 mx-0 mb-1 [html[data-wall]_&]:hidden">Chores</h1>
    {#if intro}<p class="m-0 text-muted">{intro}</p>{/if}
  </div>
  {#if choreState.manager}
    <div class="flex flex-wrap items-center gap-2">
    {#if choreState.pending.length > 0}<a class="inline-flex items-center gap-2 py-[.45rem] px-4 rounded-full border border-accent text-accent [font-weight:650] no-underline" href={inboxHref}>Inbox <span class="count-badge font-semibold bg-accent text-white" aria-label={`${choreState.pending.length} waiting for approval`}>{choreState.pending.length}</span></a>{/if}
    <a class="inline-flex items-center gap-[.55rem] py-[.45rem] px-4 rounded-full bg-accent text-accent-fg [font-weight:650] no-underline shadow-[var(--shadow-sm)] hover:brightness-[1.08] [&_svg]:size-5 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-width:2] [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]" href={manageHref} title="Create routines and set what chores and rewards are worth.">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
      Manage
    </a>
    </div>
  {/if}
</header>

{#if choreState.goals.length > 0}
  <section class="mb-5 bg-card border border-solid border-line rounded-[var(--radius)] py-4 px-[1.1rem] shadow-[var(--shadow-sm)]" aria-label="Household goals">
    <h2 class="mt-0 mx-0 mb-2 text-[1.1rem]">Together</h2>
    <ul class="plain-list">
      {#each choreState.goals as g (g.id)}
        {@const reached = g.progress >= g.target}
        <li class="py-2 [li+&]:[border-top:1px_solid_var(--border)] {g.claimed ? 'opacity-60' : ''}">
          <div class="flex flex-wrap items-center gap-x-3 gap-y-[.3rem]">
            <strong>{g.name}</strong>
            <span class="text-muted text-[.88rem] font-normal flex-1">{g.claimed ? 'Enjoyed!' : reached ? 'Goal reached!' : `${g.progress} / ${g.target} points`}</span>
            {#if choreState.manager && reached && !g.claimed}
              <button type="button" class="small" disabled={busy} onclick={() => send({ action: 'goal_claim', id: g.id })}>Mark as enjoyed</button>
            {/if}
          </div>
          <div class="track h-3 mt-[.4rem]" role="progressbar" aria-label={g.name} aria-valuemin={0} aria-valuemax={g.target} aria-valuenow={g.progress}>
            <span class="fill bg-accent" style:width={`${(g.progress / g.target) * 100}%`}></span>
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if columns.length > 1 || periodChoices.length > 0 || choreState.routines.length > 0}
  <div class="flex items-center flex-wrap gap-x-[.85rem] gap-y-[.6rem] mb-4" role="group" aria-label="Filter chores">
    {#if columns.length > 1}
      <div class="flex flex-wrap items-center gap-[.3rem] mb-5 max-[40rem]:flex-[1_1_100%]" role="group" aria-label="Show whose chores">
        {#each columns as col (col.id ?? 'anyone')}
          {@const on = only.includes(col.id ?? '')}
          <button type="button" class="person-chip {only.length > 0 && !on ? 'opacity-50' : ''}" style:--c={col.person?.color ?? 'var(--accent)'} title={col.name} aria-label={col.name} aria-pressed={on} onclick={() => toggle(col.id ?? '')}>
            <span class="avatar size-[1.6rem] text-[.78rem]" aria-hidden="true">{#if col.person}{initialOf(col.person)}{:else}<FeatherIcon name="star" />{/if}</span>{#if on}<span class="pn">{col.name}</span>{/if}
          </button>
        {/each}
        {#if only.length > 0}<button type="button" class="inline-flex items-center justify-center rounded-full w-[1.9rem] h-[1.9rem] m-0 p-0 text-[1.1rem] leading-none bg-transparent text-muted shadow-none [border:1px_dashed_var(--border)] pointer-coarse:min-h-11" onclick={() => (only = [])} aria-label="Show everyone" title="Show everyone">×</button>{/if}
      </div>
    {/if}
    <div class="seg-group mb-3" role="group" aria-label="Show chores that are">
      {#each [['all', 'All'], ['todo', 'To do'], ['done', 'Done']] as [v, label] (v)}
        <button type="button" class="seg-btn" aria-pressed={status === v} onclick={() => (status = v as Status)}>{label}</button>
      {/each}
    </div>
    {#if periodChoices.length > 0}
      <div class="seg-group mb-3" role="group" aria-label="Time of day">
        <button type="button" class="seg-btn" aria-pressed={period === 'all'} onclick={() => (period = 'all')}>All day</button>
        {#each periodChoices as p (p)}<button type="button" class="seg-btn" aria-pressed={period === p} onclick={() => (period = p)}>{choreState.periodLabels[p]}</button>{/each}
      </div>
    {/if}
  </div>
{/if}

{#if filtering && visibleColumns.length === 0}
  <p class="text-muted text-[.88rem] font-normal" role="status">Nothing matches these filters. <button type="button" class="w-auto m-0 p-0 bg-transparent border-0 shadow-none text-accent underline [font:inherit]" onclick={clear}>Clear filters</button></p>
{/if}

<!-- Equal-height cards in rows, at most one column per card so two people split the width instead of leaving empty columns beside them. -->
<div class="grid grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] gap-5 mb-6">
  {#each visibleColumns as col (col.id ?? 'anyone')}
    {@const earns = col.person !== undefined}
    <section class="bg-[color-mix(in_srgb,var(--c)_8%,var(--card))] [border:1px_dashed_color-mix(in_srgb,var(--c)_65%,transparent)] rounded-[var(--radius)] pt-[1.1rem] px-[1.1rem] pb-5 shadow-[var(--shadow-sm)]" style:--c={col.person?.color ?? 'var(--accent)'} aria-label={`${col.name}'s chores`}>
      <header class="flex items-center gap-[.7rem]">
        <span class="avatar size-10" aria-hidden="true">{#if col.person}{initialOf(col.person)}{:else}<FeatherIcon name="star" />{/if}</span>
        <h3 class="m-0 flex-1 text-[1.25rem] tracking-[-.02em]">{#if col.person}<a class="group inline-flex items-center gap-[.15rem] text-inherit underline [text-decoration-thickness:2px] [text-decoration-color:color-mix(in_srgb,var(--c)_55%,transparent)] underline-offset-[.22em] rounded-[.35rem] hover:[text-decoration-color:var(--c)] focus-visible:[outline:2px_solid_var(--c)] focus-visible:outline-offset-[3px]" href={`${personBase}/${col.person.id}`} title={`Open ${col.name}'s page`}>{col.name}<svg class="size-[1.1rem] flex-none fill-none [stroke:var(--c)] [stroke-width:3] [stroke-linecap:round] [stroke-linejoin:round] transition-transform duration-150 ease-out group-hover:translate-x-[3px]" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg></a>{:else}{col.name}{/if}</h3>
        {#if col.person}{@const waiting = waitingPoints(choreState.pending, col.person.id)}<span class="font-bold tabular-nums text-[color:var(--c)] text-[1.15rem]" title="Points to spend"><FeatherIcon name="star" /> {choreState.balances[col.person.id] ?? 0}<span class="sr-only"> points</span>{#if waiting > 0}<span class="text-muted text-[.8rem] font-normal"> ({waiting} waiting)</span>{/if}</span>{/if}
      </header>
      {#if col.person}
        {@const who = col.person}
        {@const t = choreState.timers[who.id]}
        {#if t}
          {@const left = timeLeftMs(t, clock.now)}
          <div class="flex items-center gap-2 mt-[.6rem]" role="status">
            <span class="mr-auto text-[1.15rem] font-bold tabular-nums"><FeatherIcon name={left > 0 ? 'clock' : 'bell'} /> {left > 0 ? formatCountdown(left) : "Time's up!"}<span class="sr-only">{left > 0 ? ' left' : ''}</span></span>
            <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'timer_stop', person: who.id })}>{left > 0 ? 'Stop' : 'Done'}</button>
          </div>
        {/if}
      {/if}
      <div class="track h-2 mt-[.8rem] mb-2" role="progressbar" aria-label="Done today" aria-valuemin={0} aria-valuemax={col.total} aria-valuenow={col.done}>
        <span class="fill bg-[var(--c)]" style:width={col.total ? `${(col.done / col.total) * 100}%` : '0%'}></span>
      </div>
      {#if col.items.length === 0}
        <p class="mt-3 mx-0 mb-0 text-muted">Nothing today.</p>
      {/if}
      {#each col.rows as sec (sec.period)}
        {@const all = col.items.filter((i) => i.period === sec.period)}
        {@const bonus = col.routine?.bonuses[sec.period] ?? 0}
        {@const earned = col.routine?.bonusEarned[sec.period] ?? false}
        {@const block = blockFor(choreState, sec.period, day.dayMs, demo)}
        {@const prog = tally(all)}
        <div class="mt-4">
          {#if sec.period !== 'any' || col.rows.length > 1}
            <h4 class="flex flex-wrap items-baseline gap-x-[.6rem] gap-y-[.15rem] m-0 text-[.95rem] tracking-[.01em]">
              {choreState.periodLabels[sec.period]}
              {#if choreState.periodHours[sec.period]}<span class="note [font-weight:400]">{hoursLabel(choreState.periodHours[sec.period])}</span>{/if}
              {#if block}<span class="note [font-weight:400]"><FeatherIcon name="lock" /> {block}</span>{/if}
              <span class="ml-auto [font-weight:650] tabular-nums text-muted">{prog.done}/{prog.total}</span>
            </h4>
            {#if earns && lockedPoints(all, closed) > 0}<div class="track h-[.35rem] mt-1" role="progressbar" aria-label={`${choreState.periodLabels[sec.period]} done, points held until it is finished`} aria-valuemin={0} aria-valuemax={prog.total} aria-valuenow={prog.done}><span class="fill bg-[var(--c)]" style:width={`${prog.total ? (prog.done / prog.total) * 100 : 0}%`}></span></div>{/if}
          {/if}
          <ul class="plain-list">
            {#each sec.items as c (c.id)}
              <li class="list-row">
                <button type="button" class="tick size-11 [&_svg]:size-[1.4rem] disabled:opacity-40 disabled:cursor-not-allowed" aria-pressed={c.done} aria-label={`${c.title}${c.done ? ', done' : ''}`} disabled={block !== ''} title={block} onclick={() => send({ action: 'check', id: c.id, done: !c.done })}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                </button>
                <span class="min-w-0 flex-1 [overflow-wrap:anywhere] text-[1.05rem] font-medium {c.done ? 'text-muted line-through' : ''}">{c.title}</span>
                {#if earns && c.points > 0}<span class="text-[.85rem] [font-weight:650] text-[color:var(--c)] tabular-nums">+{c.points}</span>{/if}
                {#if choreState.manager}<button type="button" class="ghost small w-auto m-0" disabled={busy} aria-label={`Skip ${c.title} today`} onclick={() => send({ action: 'item_skip', id: c.id, skipped: true })}>{c.optional && c.done ? 'Not done' : 'Skip'}</button>{/if}
              </li>
            {/each}
          </ul>
          {#if earns && bonus > 0}
            <p class="mt-1 mx-0 mb-0 text-[.88rem] {earned ? 'text-[color:var(--c)] [font-weight:650]' : 'text-muted'}">{earned ? `All done! +${bonus} bonus` : `Finish them all for +${bonus} bonus`}</p>
          {/if}
        </div>
      {/each}

      {#if choreState.manager && col.skipped.length > 0}
        <div class="mt-4">
          <h4 class="m-0 text-[.95rem] tracking-[.01em]">Skipped today</h4>
          <ul class="plain-list">
            {#each col.skipped as c (c.id)}
              <li class="list-row">
                <span class="min-w-0 flex-1 [overflow-wrap:anywhere] text-[1.05rem] font-medium text-muted">{c.title}</span>
                <button type="button" class="ghost small w-auto m-0" disabled={busy} aria-label={`Put ${c.title} back on today's list`} onclick={() => send({ action: 'item_skip', id: c.id, skipped: false })}>Undo</button>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
    </section>
  {/each}
</div>

{#if choreState.routines.every((r) => r.items.length === 0)}
  <p class="text-muted text-[.88rem] font-normal">No chores yet. {#if choreState.manager}<a href={manageHref}>Add the first one</a>.{:else}Ask a manager to set some up.{/if}</p>
{/if}

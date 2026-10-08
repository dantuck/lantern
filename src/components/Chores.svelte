<script lang="ts">
  import { allowanceLeft, canAsk, timeAvailable, PERIOD_LABEL, PERIODS, sections, todaysRoutines, type ChoreItem, type ChoreState, type Period, type Routine } from '../lib/choreTypes';
  import { runChores } from '../lib/choreClient';
  import { onMount } from 'svelte';
  import { celebrate } from '../lib/celebrate.svelte';
  import { celebrationKeys } from '../lib/completion';
  import Confetti from './Confetti.svelte';
  import type { Person } from '../lib/people';

  let { initial, people, intro = '', demo = false, manageHref = '/chores/manage', personBase = '/chores' }: { initial: ChoreState; people: Person[]; intro?: string; demo?: boolean; manageHref?: string; personBase?: string } = $props();

  // Rendered once from the server, then replaced by whatever the API answers after each change.
  // svelte-ignore state_referenced_locally
  let choreState = $state<ChoreState>(initial);
  let error = $state('');
  let busy = $state(false);

  const initialOf = (p: Person) => [...p.name][0]!.toUpperCase();

  /** One column per person, plus "Anyone" for chores nobody owns (and for households with no people set up). */
  const columns = $derived.by(() => {
    const today = todaysRoutines(choreState.routines);
    const cols: { id: string | null; name: string; person?: Person; routine?: Routine; items: ChoreItem[] }[] = people.map((p) => {
      const routine = today.find((r) => r.person === p.id);
      return { id: p.id, name: p.name, person: p, ...(routine ? { routine } : {}), items: routine?.items ?? [] };
    });
    const anyone = today.filter((r) => !r.person || !people.some((p) => p.id === r.person)).flatMap((r) => r.items);
    if (anyone.length > 0 || people.length === 0) cols.push({ id: null, name: 'Anyone', items: anyone });
    return cols;
  });
  const tally = (items: ChoreItem[]) => ({ total: items.length, done: items.filter((i) => i.done).length });
  // Confetti the moment someone's last chore gets ticked: big for the day, small for a time of day with a bonus.
  const party = celebrate(() => columns.flatMap((c) => celebrationKeys(c.id, c.items, c.routine?.bonuses)));
  const partyColor = $derived(columns.find((c) => party.key.startsWith(`${c.id}:`))?.person?.color ?? 'var(--accent)');
  const pendingFor = (id: string | null) => choreState.pending.filter((r) => r.person === id);
  const rewardsFor = (id: string) => choreState.rewards.filter((r) => !r.hidden && canAsk(r, id));
  const available = (id: string) => (choreState.balances[id] ?? 0) - pendingFor(id).reduce((n, r) => n + r.cost, 0);

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
  const toggle = (id: string) => { only = only.includes(id) ? only.filter((x) => x !== id) : [...only, id]; };
  /** The time-of-day choices that exist today, so the filter never offers an empty option. */
  const periodChoices = $derived.by(() => {
    const today = PERIODS.filter((p) => choreState.routines.some((r) => r.items.some((i) => i.due && i.period === p)));
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

  async function send(payload: Record<string, unknown>) {
    if (busy) return;
    error = '';
    busy = true;
    const r = await runChores(choreState, payload, demo);
    busy = false;
    if (r.ok) choreState = r.state; else error = r.error;
  }

  const timeTitle = (id: string) => (choreState.allowance[id] ? `${allowanceLeft(choreState.allowance[id])} left of today's allowance + ${choreState.minutes[id] ?? 0} banked` : 'Screen time to use');
  const usesTime = $derived(choreState.rewards.some((r) => r.minutes > 0) || Object.keys(choreState.allowance).length > 0 || Object.values(choreState.minutes).some((n) => n > 0));
  const mins = (n: number) => `${n} min`;
  const pts = (n: number) => `${n} ${n === 1 ? 'point' : 'points'}`;
</script>

{#key party.burst}{#if party.burst > 0}<Confetti color={partyColor} size={party.size} />{/if}{/key}

{#if error}<p class="notice error" role="alert">{error}</p>{/if}

<header class="flex items-start justify-between gap-x-4 gap-y-3 mb-4">
  <div class="min-w-0">
    <h1 class="mt-0 mx-0 mb-1 [html[data-wall]_&]:hidden">Chores</h1>
    {#if intro}<p class="m-0 text-muted">{intro}</p>{/if}
  </div>
  {#if choreState.manager}
    <a class="inline-flex items-center gap-[.55rem] py-[.45rem] px-4 rounded-full bg-accent text-accent-fg [font-weight:650] no-underline shadow-[var(--shadow-sm)] hover:brightness-[1.08] [&_svg]:size-5 [&_svg]:fill-none [&_svg]:stroke-current [&_svg]:[stroke-width:2] [&_svg]:[stroke-linecap:round] [&_svg]:[stroke-linejoin:round]" href={manageHref} title="Create routines, set what chores are worth, and approve rewards.">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
      Manage
      {#if choreState.pending.length > 0}<span class="count-badge font-semibold bg-white text-accent" aria-label={`${choreState.pending.length} waiting for approval`}>{choreState.pending.length}</span>{/if}
    </a>
  {/if}
</header>

{#if choreState.goals.length > 0}
  <section class="mb-5 bg-card border border-solid border-line rounded-[var(--radius)] py-4 px-[1.1rem] shadow-[var(--shadow-sm)]" aria-label="Household goals">
    <h2 class="mt-0 mx-0 mb-2 text-[1.1rem]">Together</h2>
    <ul class="list-none m-0 p-0">
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
            <span class="avatar size-[1.6rem] text-[.78rem]" aria-hidden="true">{col.person ? initialOf(col.person) : '★'}</span>{#if on}<span class="pn">{col.name}</span>{/if}
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
        {#each periodChoices as p (p)}<button type="button" class="seg-btn" aria-pressed={period === p} onclick={() => (period = p)}>{PERIOD_LABEL[p]}</button>{/each}
      </div>
    {/if}
  </div>
{/if}

{#if filtering && visibleColumns.length === 0}
  <p class="text-muted text-[.88rem] font-normal" role="status">Nothing matches these filters. <button type="button" class="w-auto m-0 p-0 bg-transparent border-0 shadow-none text-accent underline [font:inherit]" onclick={clear}>Clear filters</button></p>
{/if}

<div class="columns-[17rem] gap-x-5 mb-6">
  {#each visibleColumns as col (col.id ?? 'anyone')}
    {@const earns = col.person !== undefined}
    <section class="break-inside-avoid mb-5 bg-[color-mix(in_srgb,var(--c)_8%,var(--card))] [border:1px_dashed_color-mix(in_srgb,var(--c)_65%,transparent)] rounded-[var(--radius)] pt-[1.1rem] px-[1.1rem] pb-5 shadow-[var(--shadow-sm)]" style:--c={col.person?.color ?? 'var(--accent)'} aria-label={`${col.name}'s chores`}>
      <header class="flex items-center gap-[.7rem]">
        <span class="avatar size-10" aria-hidden="true">{col.person ? initialOf(col.person) : '★'}</span>
        <h3 class="m-0 flex-1 text-[1.25rem] tracking-[-.02em]">{#if col.person}<a class="group inline-flex items-center gap-[.15rem] text-inherit underline [text-decoration-thickness:2px] [text-decoration-color:color-mix(in_srgb,var(--c)_55%,transparent)] underline-offset-[.22em] rounded-[.35rem] hover:[text-decoration-color:var(--c)] focus-visible:[outline:2px_solid_var(--c)] focus-visible:outline-offset-[3px]" href={`${personBase}/${col.person.id}`} title={`Open ${col.name}'s page`}>{col.name}<svg class="size-[1.1rem] flex-none fill-none [stroke:var(--c)] [stroke-width:3] [stroke-linecap:round] [stroke-linejoin:round] transition-transform duration-150 ease-out group-hover:translate-x-[3px]" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg></a>{:else}{col.name}{/if}</h3>
        {#if col.person}<span class="font-bold tabular-nums text-[color:var(--c)] text-[1.15rem]" title="Points to spend"><span aria-hidden="true">★</span> {choreState.balances[col.person.id] ?? 0}<span class="sr-only"> points</span></span>{/if}
      </header>
      {#if col.person && usesTime}
        {@const who = col.person}
        {@const avail = timeAvailable(choreState, who.id)}
        <div class="flex flex-wrap items-center gap-x-2 gap-y-[.35rem] mt-[.6rem]">
          <span class="mr-auto [font-weight:650] tabular-nums" title={timeTitle(who.id)}><span aria-hidden="true">⏱</span> {mins(avail)}<span class="sr-only"> of screen time</span></span>
          {#each [15, 30] as m (m)}
            {#if avail >= m}<button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'use_time', person: who.id, minutes: m })}>Use {m}</button>{/if}
          {/each}
          {#if avail > 0 && avail !== 15 && avail !== 30}
            <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'use_time', person: who.id, minutes: avail })}>Use all</button>
          {/if}
        </div>
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
        <div class="mt-4">
          {#if sec.period !== 'any' || col.rows.length > 1}
            <h4 class="flex flex-wrap items-baseline gap-x-[.6rem] gap-y-[.15rem] m-0 text-[.95rem] tracking-[.01em]">
              {PERIOD_LABEL[sec.period]}
              <span class="ml-auto [font-weight:650] tabular-nums text-muted">{all.filter((i) => i.done).length}/{all.length}</span>
            </h4>
          {/if}
          <ul class="list-none m-0 p-0">
            {#each sec.items as c (c.id)}
              <li class="list-row">
                <button type="button" class="tick size-11 [&_svg]:size-[1.4rem]" aria-pressed={c.done} aria-label={`${c.title}${c.done ? ', done' : ''}`} disabled={busy} onclick={() => send({ action: 'check', id: c.id, done: !c.done })}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                </button>
                <span class="min-w-0 flex-1 [overflow-wrap:anywhere] text-[1.05rem] font-medium {c.done ? 'text-muted line-through' : ''}">{c.title}</span>
                {#if earns && c.points > 0}<span class="text-[.85rem] [font-weight:650] text-[color:var(--c)] tabular-nums">+{c.points}</span>{/if}
              </li>
            {/each}
          </ul>
          {#if earns && bonus > 0}
            <p class="mt-1 mx-0 mb-0 text-[.88rem] {earned ? 'text-[color:var(--c)] [font-weight:650]' : 'text-muted'}">{earned ? `All done! +${bonus} bonus` : `Finish them all for +${bonus} bonus`}</p>
          {/if}
        </div>
      {/each}

      {#if col.person && (rewardsFor(col.person.id).length > 0 || pendingFor(col.person.id).length > 0)}
        {@const who = col.person}
        <details class="mt-[1.1rem] pt-3 [border-top:1px_solid_var(--border)]">
          <summary class="cursor-pointer [font-weight:650] pointer-coarse:flex pointer-coarse:items-center pointer-coarse:min-h-11">Rewards{#if pendingFor(who.id).length > 0}<span class="count-badge ml-2 font-semibold bg-[var(--c)] text-white">{pendingFor(who.id).length}</span>{/if}</summary>
          {#each pendingFor(who.id) as r (r.id)}
            <div class="flex flex-wrap items-center gap-x-[.6rem] gap-y-[.4rem] py-2">
              <span class="min-w-0 flex-1 [overflow-wrap:anywhere] text-[1.05rem] font-medium">{r.rewardName} <span class="text-muted text-[.88rem] font-normal">({pts(r.cost)}{r.minutes > 0 ? `, ${mins(r.minutes)}` : ''}), waiting</span></span>
              {#if choreState.manager}
                <button type="button" class="small" disabled={busy} onclick={() => send({ action: 'decide', id: r.id, approve: true })}>Approve</button>
                <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'decide', id: r.id, approve: false })}>Deny</button>
              {/if}
            </div>
          {/each}
          <ul class="list-none m-0 p-0">
            {#each rewardsFor(who.id) as r (r.id)}
              <li class="list-row">
                <span class="min-w-0 flex-1 [overflow-wrap:anywhere] text-[1.05rem] font-medium">{r.name}{#if r.minutes > 0} <span class="text-muted text-[.88rem] font-normal">({mins(r.minutes)})</span>{/if}</span>
                <button type="button" class="small" disabled={busy || available(who.id) < r.cost} onclick={() => send({ action: 'redeem', person: who.id, rewardId: r.id })}>
                  <span aria-hidden="true">★</span> {r.cost}<span class="sr-only"> points, ask for {r.name}</span>
                </button>
              </li>
            {/each}
          </ul>
        </details>
      {/if}
    </section>
  {/each}
</div>

{#if choreState.routines.every((r) => r.items.length === 0)}
  <p class="text-muted text-[.88rem] font-normal">No chores yet. {#if choreState.manager}<a href={manageHref}>Add the first one</a>.{:else}Ask a manager to set some up.{/if}</p>
{/if}

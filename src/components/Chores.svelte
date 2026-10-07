<script lang="ts">
  import { allowanceLeft, canAsk, timeAvailable, PERIOD_LABEL, PERIODS, sections, todaysRoutines, type ChoreItem, type ChoreState, type Period, type Routine } from '../lib/choreTypes';
  import { runChores } from '../lib/choreClient';
  import { onMount } from 'svelte';
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

{#if error}<p class="notice error" role="alert">{error}</p>{/if}

<header class="head">
  <div class="titles">
    <h1>Chores</h1>
    {#if intro}<p class="intro">{intro}</p>{/if}
  </div>
  {#if choreState.manager}
    <a class="manage-btn" href={manageHref} title="Create routines, set what chores are worth, and approve rewards.">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
      Manage
      {#if choreState.pending.length > 0}<span class="badge" aria-label={`${choreState.pending.length} waiting for approval`}>{choreState.pending.length}</span>{/if}
    </a>
  {/if}
</header>

{#if choreState.goals.length > 0}
  <section class="goals" aria-label="Household goals">
    <h2>Together</h2>
    <ul>
      {#each choreState.goals as g (g.id)}
        {@const reached = g.progress >= g.target}
        <li class:claimed={g.claimed}>
          <div class="gtop">
            <strong>{g.name}</strong>
            <span class="muted">{g.claimed ? 'Enjoyed!' : reached ? 'Goal reached!' : `${g.progress} / ${g.target} points`}</span>
            {#if choreState.manager && reached && !g.claimed}
              <button type="button" class="small" disabled={busy} onclick={() => send({ action: 'goal_claim', id: g.id })}>Mark as enjoyed</button>
            {/if}
          </div>
          <div class="gbar" role="progressbar" aria-label={g.name} aria-valuemin={0} aria-valuemax={g.target} aria-valuenow={g.progress}>
            <span style:width={`${(g.progress / g.target) * 100}%`}></span>
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if columns.length > 1 || periodChoices.length > 0 || choreState.routines.length > 0}
  <div class="toolbar" role="group" aria-label="Filter chores">
    {#if columns.length > 1}
      <div class="people" role="group" aria-label="Show whose chores">
        {#each columns as col (col.id ?? 'anyone')}
          {@const on = only.includes(col.id ?? '')}
          <button type="button" class="person" style:--c={col.person?.color ?? 'var(--accent)'} title={col.name} aria-label={col.name} aria-pressed={on} class:dim={only.length > 0 && !on} onclick={() => toggle(col.id ?? '')}>
            <span class="avatar sm" aria-hidden="true">{col.person ? initialOf(col.person) : '★'}</span>{#if on}<span class="pn">{col.name}</span>{/if}
          </button>
        {/each}
        {#if only.length > 0}<button type="button" class="person clear" onclick={() => (only = [])} aria-label="Show everyone" title="Show everyone">×</button>{/if}
      </div>
    {/if}
    <div class="seg" role="group" aria-label="Show chores that are">
      {#each [['all', 'All'], ['todo', 'To do'], ['done', 'Done']] as [v, label] (v)}
        <button type="button" aria-pressed={status === v} onclick={() => (status = v as Status)}>{label}</button>
      {/each}
    </div>
    {#if periodChoices.length > 0}
      <div class="seg" role="group" aria-label="Time of day">
        <button type="button" aria-pressed={period === 'all'} onclick={() => (period = 'all')}>All day</button>
        {#each periodChoices as p (p)}<button type="button" aria-pressed={period === p} onclick={() => (period = p)}>{PERIOD_LABEL[p]}</button>{/each}
      </div>
    {/if}
  </div>
{/if}

{#if filtering && visibleColumns.length === 0}
  <p class="muted" role="status">Nothing matches these filters. <button type="button" class="linklike" onclick={clear}>Clear filters</button></p>
{/if}

<div class="cols">
  {#each visibleColumns as col (col.id ?? 'anyone')}
    {@const earns = col.person !== undefined}
    <section class="col" style:--c={col.person?.color ?? 'var(--accent)'} aria-label={`${col.name}'s chores`}>
      <header>
        <span class="avatar" aria-hidden="true">{col.person ? initialOf(col.person) : '★'}</span>
        <h3>{#if col.person}<a class="who" href={`${personBase}/${col.person.id}`} title={`Open ${col.name}'s page`}>{col.name}<svg class="go" viewBox="0 0 24 24" aria-hidden="true"><polyline points="9 6 15 12 9 18" /></svg></a>{:else}{col.name}{/if}</h3>
        {#if col.person}<span class="stars" title="Points to spend"><span aria-hidden="true">★</span> {choreState.balances[col.person.id] ?? 0}<span class="sr"> points</span></span>{/if}
      </header>
      {#if col.person && usesTime}
        {@const who = col.person}
        {@const avail = timeAvailable(choreState, who.id)}
        <div class="time">
          <span class="bank" title={timeTitle(who.id)}><span aria-hidden="true">⏱</span> {mins(avail)}<span class="sr"> of screen time</span></span>
          {#each [15, 30] as m (m)}
            {#if avail >= m}<button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'use_time', person: who.id, minutes: m })}>Use {m}</button>{/if}
          {/each}
          {#if avail > 0 && avail !== 15 && avail !== 30}
            <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'use_time', person: who.id, minutes: avail })}>Use all</button>
          {/if}
        </div>
      {/if}
      <div class="bar" role="progressbar" aria-label="Done today" aria-valuemin={0} aria-valuemax={col.total} aria-valuenow={col.done}>
        <span style:width={col.total ? `${(col.done / col.total) * 100}%` : '0%'}></span>
      </div>
      {#if col.items.length === 0}
        <p class="empty">Nothing today.</p>
      {/if}
      {#each col.rows as sec (sec.period)}
        {@const all = col.items.filter((i) => i.period === sec.period)}
        {@const bonus = col.routine?.bonuses[sec.period] ?? 0}
        {@const earned = col.routine?.bonusEarned[sec.period] ?? false}
        <div class="routine">
          {#if sec.period !== 'any' || col.rows.length > 1}
            <h4>
              {PERIOD_LABEL[sec.period]}
              <span class="count">{all.filter((i) => i.done).length}/{all.length}</span>
            </h4>
          {/if}
          <ul>
            {#each sec.items as c (c.id)}
              <li class:done={c.done}>
                <button type="button" class="tick" aria-pressed={c.done} aria-label={`${c.title}${c.done ? ', done' : ''}`} disabled={busy} onclick={() => send({ action: 'check', id: c.id, done: !c.done })}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                </button>
                <span class="label">{c.title}</span>
                {#if earns && c.points > 0}<span class="pts">+{c.points}</span>{/if}
              </li>
            {/each}
          </ul>
          {#if earns && bonus > 0}
            <p class="bonus" class:earned>{earned ? `All done! +${bonus} bonus` : `Finish them all for +${bonus} bonus`}</p>
          {/if}
        </div>
      {/each}

      {#if col.person && (rewardsFor(col.person.id).length > 0 || pendingFor(col.person.id).length > 0)}
        {@const who = col.person}
        <details class="shop">
          <summary>Rewards{#if pendingFor(who.id).length > 0}<span class="badge">{pendingFor(who.id).length}</span>{/if}</summary>
          {#each pendingFor(who.id) as r (r.id)}
            <div class="ask">
              <span class="label">{r.rewardName} <span class="muted">({pts(r.cost)}{r.minutes > 0 ? `, ${mins(r.minutes)}` : ''}), waiting</span></span>
              {#if choreState.manager}
                <button type="button" class="small" disabled={busy} onclick={() => send({ action: 'decide', id: r.id, approve: true })}>Approve</button>
                <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'decide', id: r.id, approve: false })}>Deny</button>
              {/if}
            </div>
          {/each}
          <ul>
            {#each rewardsFor(who.id) as r (r.id)}
              <li>
                <span class="label">{r.name}{#if r.minutes > 0} <span class="muted">({mins(r.minutes)})</span>{/if}</span>
                <button type="button" class="small" disabled={busy || available(who.id) < r.cost} onclick={() => send({ action: 'redeem', person: who.id, rewardId: r.id })}>
                  <span aria-hidden="true">★</span> {r.cost}<span class="sr"> points, ask for {r.name}</span>
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
  <p class="muted">No chores yet. {#if choreState.manager}<a href={manageHref}>Add the first one</a>.{:else}Ask a manager to set some up.{/if}</p>
{/if}


<style>
  /* Masonry: columns of different heights pack together instead of leaving gaps under the short ones. */
  .cols { column-width: 17rem; column-gap: 1.25rem; margin-bottom: 1.5rem; }
  .col { break-inside: avoid; margin-bottom: 1.25rem; background: color-mix(in srgb, var(--c) 8%, var(--card)); border: 1px dashed color-mix(in srgb, var(--c) 65%, transparent); border-radius: var(--radius); padding: 1.1rem 1.1rem 1.25rem; box-shadow: var(--shadow-sm); }
  .col header { display: flex; align-items: center; gap: .7rem; }
  .who { display: inline-flex; align-items: center; gap: .15rem; color: inherit; text-decoration: underline; text-decoration-color: color-mix(in srgb, var(--c) 55%, transparent); text-decoration-thickness: 2px; text-underline-offset: .22em; border-radius: .35rem; }
  .who .go { width: 1.1rem; height: 1.1rem; flex: none; fill: none; stroke: var(--c); stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; transition: transform .15s ease; }
  .who:hover { text-decoration-color: var(--c); }
  .who:hover .go { transform: translateX(3px); }
  .who:focus-visible { outline: 2px solid var(--c); outline-offset: 3px; }
  .col h3 { margin: 0; flex: 1; font-size: 1.25rem; letter-spacing: -.02em; }
  .avatar { display: grid; place-items: center; flex: none; width: 2.5rem; height: 2.5rem; border-radius: 50%; background: var(--c); color: #fff; font-weight: 700; }
  .stars { font-weight: 700; font-variant-numeric: tabular-nums; color: var(--c); font-size: 1.15rem; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .time { display: flex; flex-wrap: wrap; align-items: center; gap: .35rem .5rem; margin-top: .6rem; }
  .bank { margin-right: auto; font-weight: 650; font-variant-numeric: tabular-nums; }
  .bar { height: .5rem; margin: .8rem 0 .5rem; border-radius: 999px; background: var(--card-2); overflow: hidden; }
  .bar span { display: block; height: 100%; border-radius: inherit; background: var(--c); transition: width .25s ease; }
  .empty { margin: .75rem 0 0; color: var(--muted); }
  .routine { margin-top: 1rem; }
  .routine h4 { display: flex; flex-wrap: wrap; align-items: baseline; gap: .15rem .6rem; margin: 0; font-size: .95rem; letter-spacing: .01em; }
  .count { margin-left: auto; font-weight: 650; font-variant-numeric: tabular-nums; color: var(--muted); }
  ul { list-style: none; margin: 0; padding: 0; }
  .col li { display: flex; align-items: center; gap: .85rem; padding: .55rem 0; }
  .col li + li { border-top: 1px solid var(--border); }
  .label { min-width: 0; flex: 1; overflow-wrap: anywhere; font-size: 1.05rem; font-weight: 500; }
  .done .label { color: var(--muted); text-decoration: line-through; }
  .pts { font-size: .85rem; font-weight: 650; color: var(--c); font-variant-numeric: tabular-nums; }
  .bonus { margin: .25rem 0 0; font-size: .88rem; color: var(--muted); }
  .bonus.earned { color: var(--c); font-weight: 650; }
  .tick { display: grid; place-items: center; flex: none; width: 2.75rem; height: 2.75rem; margin: 0; padding: 0; border-radius: 50%; background: transparent; border: 2.5px solid var(--c); box-shadow: none; color: transparent; }
  .tick:hover:not(:disabled) { background: color-mix(in srgb, var(--c) 14%, transparent); filter: none; }
  .tick[aria-pressed="true"] { background: var(--c); color: #fff; }
  .tick svg { width: 1.4rem; height: 1.4rem; fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
  .shop { margin-top: 1.1rem; border-top: 1px solid var(--border); padding-top: .75rem; }
  .shop summary { cursor: pointer; font-weight: 650; }
  .shop summary .badge { margin-left: .5rem; }
  .badge { display: inline-grid; place-items: center; min-width: 1.4rem; height: 1.4rem; padding: 0 .4rem; box-sizing: border-box; line-height: 1; border-radius: 999px; background: var(--c); color: #fff; font-size: .8rem; text-align: center; }
  .ask { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem .6rem; padding: .5rem 0; }
  .small { width: auto; margin: 0; padding: .3rem .8rem; font-size: .85rem; }
  @media (pointer: coarse) { .small, .seg button, .person { min-height: 2.75rem; } .shop summary { display: flex; align-items: center; min-height: 2.75rem; } }
  .muted { font-size: .88rem; font-weight: 400; }
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: .75rem 1rem; margin-bottom: 1rem; }
  .titles { min-width: 0; }
  .titles h1 { margin: 0 0 .25rem; }
  .intro { margin: 0; color: var(--muted); }
  :global(html[data-wall]) .titles h1 { display: none; }
  .manage-btn { display: inline-flex; align-items: center; gap: .55rem; padding: .45rem 1rem; border-radius: 999px; background: var(--accent); color: var(--accent-fg, #fff); font-weight: 650; text-decoration: none; box-shadow: var(--shadow-sm); }
  .manage-btn:hover { filter: brightness(1.08); }
  .manage-btn svg { width: 1.25rem; height: 1.25rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .manage-btn .badge { background: #fff; color: var(--accent); }
  .goals { margin-bottom: 1.25rem; background: var(--card); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem 1.1rem; box-shadow: var(--shadow-sm); }
  .goals h2 { margin: 0 0 .5rem; font-size: 1.1rem; }
  .goals li { padding: .5rem 0; }
  .goals li + li { border-top: 1px solid var(--border); }
  .gtop { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem .75rem; }
  .gtop .muted { flex: 1; }
  .goals .claimed { opacity: .6; }
  .gbar { height: .75rem; margin-top: .4rem; border-radius: 999px; background: var(--card-2); overflow: hidden; }
  .gbar span { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width .25s ease; }
  /* Filter toolbar, in the calendar's style: avatar chips (the name shows when picked) and segmented controls. */
  .toolbar { display: flex; align-items: center; flex-wrap: wrap; gap: .6rem .85rem; margin-bottom: 1rem; }
  .seg { display: inline-flex; padding: 3px; gap: 2px; background: var(--card-2); border: 1px solid var(--border); border-radius: 999px; }
  .seg button { width: auto; margin: 0; padding: .4rem .85rem; font-size: .9rem; border-radius: 999px; background: transparent; color: var(--muted); border: 0; box-shadow: none; }
  .seg button:hover { color: var(--fg); filter: none; }
  .seg button[aria-pressed="true"] { background: var(--card); color: var(--accent); box-shadow: var(--shadow-sm); }
  .people { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem; }
  .person { display: inline-flex; align-items: center; gap: .4rem; width: auto; margin: 0; padding: .15rem; border-radius: 999px; font-size: .85rem; font-weight: 600; color: var(--fg); background: color-mix(in srgb, var(--c) 14%, var(--card)); border: 1px dashed color-mix(in srgb, var(--c) 65%, transparent); box-shadow: none; }
  .person:hover { filter: none; background: color-mix(in srgb, var(--c) 24%, var(--card)); }
  .person[aria-pressed="true"] { border-style: solid; border-color: var(--c); background: color-mix(in srgb, var(--c) 26%, var(--card)); padding-right: .7rem; }
  .person.dim { opacity: .5; }
  .person.clear { width: 1.9rem; height: 1.9rem; justify-content: center; padding: 0; font-size: 1.1rem; line-height: 1; background: transparent; color: var(--muted); border: 1px dashed var(--border); }
  .person .avatar { width: 1.6rem; height: 1.6rem; font-size: .78rem; }
  @media (max-width: 40rem) { .seg { flex: 1 1 100%; } .seg button { flex: 1; padding-inline: 0; } .people { flex: 1 1 100%; } }
  .linklike { width: auto; margin: 0; padding: 0; background: none; border: 0; box-shadow: none; color: var(--accent); text-decoration: underline; font: inherit; }
</style>

<script lang="ts">
  import { canAsk, PERIOD_LABEL, PERIODS, type ChoreList, type ChoreState, type Period } from '../lib/choreTypes';
  import { runChores } from '../lib/choreClient';
  import { onMount } from 'svelte';
  import type { Person } from '../lib/people';

  let { initial, people, demo = false, manageHref = '/chores/manage' }: { initial: ChoreState; people: Person[]; demo?: boolean; manageHref?: string } = $props();

  // Rendered once from the server, then replaced by whatever the API answers after each change.
  let state = $state<ChoreState>(initial);
  let error = $state('');
  let busy = $state(false);

  const initialOf = (p: Person) => [...p.name][0]!.toUpperCase();

  /** One column per person, plus "Anyone" for lists nobody owns (and for households with no people set up). */
  const columns = $derived.by(() => {
    const today = state.lists.filter((l) => l.due);
    const cols: { id: string | null; name: string; person?: Person; lists: ChoreList[] }[] = people.map((p) => ({ id: p.id, name: p.name, person: p, lists: today.filter((l) => l.person === p.id) }));
    const anyone = today.filter((l) => !l.person || !people.some((p) => p.id === l.person));
    if (anyone.length > 0 || people.length === 0) cols.push({ id: null, name: 'Anyone', lists: anyone });
    return cols;
  });
  const tally = (ls: ChoreList[]) => {
    const items = ls.flatMap((l) => l.items);
    return { total: items.length, done: items.filter((i) => i.done).length };
  };
  const pendingFor = (id: string | null) => state.pending.filter((r) => r.person === id);
  const rewardsFor = (id: string) => state.rewards.filter((r) => canAsk(r, id, state.lists));
  const available = (id: string) => (state.balances[id] ?? 0) - pendingFor(id).reduce((n, r) => n + r.cost, 0);

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
    const today = PERIODS.filter((p) => state.lists.some((l) => l.due && l.period === p));
    return today.length > 1 ? today : [];
  });
  /** What a column shows after filtering: lists in the chosen time of day, each with only the chores in the chosen state. */
  const shown = (ls: ChoreList[]) =>
    ls
      .filter((l) => period === 'all' || l.period === period)
      .map((l) => ({ l, shown: l.items.filter((i) => status === 'all' || (status === 'done') === i.done) }))
      .filter((x) => x.shown.length > 0 || status === 'all');
  const visibleColumns = $derived(
    columns
      .filter((c) => only.length === 0 || only.includes(c.id ?? ''))
      .map((c) => ({ ...c, ...tally(c.lists), rows: shown(c.lists) }))
      // A column left empty only by the status or time-of-day filter is hidden rather than shown blank.
      .filter((c) => (status === 'all' && period === 'all') || c.rows.length > 0),
  );

  async function send(payload: Record<string, unknown>) {
    if (busy) return;
    error = '';
    busy = true;
    const r = await runChores(state, payload, demo);
    busy = false;
    if (r.ok) state = r.state; else error = r.error;
  }

  const pts = (n: number) => `${n} ${n === 1 ? 'point' : 'points'}`;
</script>

{#if error}<p class="notice error" role="alert">{error}</p>{/if}

{#if state.manager}
  <div class="manage-bar">
    <a class="manage-btn" href={manageHref}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
      Manage chores &amp; rewards
      {#if state.pending.length > 0}<span class="badge" aria-label={`${state.pending.length} waiting for approval`}>{state.pending.length}</span>{/if}
    </a>
    <span class="muted">Create routines, set what chores are worth, and approve rewards.</span>
  </div>
{/if}

{#if columns.length > 1 || periodChoices.length > 0 || state.lists.length > 0}
  <div class="filters" role="group" aria-label="Filter chores">
    {#if columns.length > 1}
      <div class="chips" role="group" aria-label="Show whose chores">
        {#each columns as col (col.id ?? 'anyone')}
          <button type="button" class="pick" style:--c={col.person?.color ?? 'var(--accent)'} aria-pressed={only.includes(col.id ?? '')} onclick={() => toggle(col.id ?? '')}>
            <span class="avatar sm" aria-hidden="true">{col.person ? initialOf(col.person) : '★'}</span>{col.name}
          </button>
        {/each}
      </div>
    {/if}
    <div class="chips" role="group" aria-label="Show chores that are">
      {#each [['all', 'All'], ['todo', 'To do'], ['done', 'Done']] as [v, label] (v)}
        <button type="button" class="pick plain" aria-pressed={status === v} onclick={() => (status = v as Status)}>{label}</button>
      {/each}
    </div>
    {#if periodChoices.length > 0}
      <div class="chips" role="group" aria-label="Time of day">
        <button type="button" class="pick plain" aria-pressed={period === 'all'} onclick={() => (period = 'all')}>Any time</button>
        {#each periodChoices as p (p)}<button type="button" class="pick plain" aria-pressed={period === p} onclick={() => (period = p)}>{PERIOD_LABEL[p]}</button>{/each}
      </div>
    {/if}
    {#if filtering}<button type="button" class="ghost small" onclick={clear}>Clear filters</button>{/if}
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
        <h3>{col.name}</h3>
        {#if col.person}<span class="stars" title="Points to spend"><span aria-hidden="true">★</span> {state.balances[col.person.id] ?? 0}<span class="sr"> points</span></span>{/if}
      </header>
      <div class="bar" role="progressbar" aria-label="Done today" aria-valuemin={0} aria-valuemax={col.total} aria-valuenow={col.done}>
        <span style:width={col.total ? `${(col.done / col.total) * 100}%` : '0%'}></span>
      </div>
      {#if col.lists.length === 0}
        <p class="empty">Nothing today.</p>
      {/if}
      {#each col.rows as { l, shown: rows } (l.id)}
        {@const left = l.items.filter((i) => !i.done).length}
        <div class="routine">
          <h4>
            {l.name}
            {#if l.period !== 'any'}<span class="period">{PERIOD_LABEL[l.period]}</span>{/if}
            <span class="count">{l.items.length - left}/{l.items.length}</span>
          </h4>
          <ul>
            {#each rows as c (c.id)}
              <li class:done={c.done}>
                <button type="button" class="tick" aria-pressed={c.done} aria-label={`${c.title}${c.done ? ', done' : ''}`} disabled={busy} onclick={() => send({ action: 'check', id: c.id, done: !c.done })}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
                </button>
                <span class="label">{c.title}</span>
                {#if earns && c.points > 0}<span class="pts">+{c.points}</span>{/if}
              </li>
            {/each}
          </ul>
          {#if earns && l.bonus > 0 && l.items.length > 0}
            <p class="bonus" class:earned={l.bonusEarned}>{l.bonusEarned ? `All done! +${l.bonus} bonus` : `Finish them all for +${l.bonus} bonus`}</p>
          {/if}
        </div>
      {/each}

      {#if col.person && (rewardsFor(col.person.id).length > 0 || pendingFor(col.person.id).length > 0)}
        {@const who = col.person}
        <details class="shop">
          <summary>Rewards{#if pendingFor(who.id).length > 0} <span class="badge">{pendingFor(who.id).length}</span>{/if}</summary>
          {#each pendingFor(who.id) as r (r.id)}
            <div class="ask">
              <span class="label">{r.rewardName} <span class="muted">({pts(r.cost)}), waiting</span></span>
              {#if state.manager}
                <button type="button" class="small" disabled={busy} onclick={() => send({ action: 'decide', id: r.id, approve: true })}>Approve</button>
                <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'decide', id: r.id, approve: false })}>Deny</button>
              {/if}
            </div>
          {/each}
          <ul>
            {#each rewardsFor(who.id) as r (r.id)}
              <li>
                <span class="label">{r.name}</span>
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

{#if state.lists.length === 0}
  <p class="muted">No chore lists yet.{#if state.manager} <a href={manageHref}>Create the first one</a>.{:else} Ask a manager to set some up.{/if}</p>
{/if}


<style>
  /* Masonry: columns of different heights pack together instead of leaving gaps under the short ones. */
  .cols { column-width: 17rem; column-gap: 1.25rem; margin-bottom: 1.5rem; }
  .col { break-inside: avoid; margin-bottom: 1.25rem; background: var(--card); border: 1px solid var(--border); border-top: 6px solid var(--c); border-radius: var(--radius); padding: 1.1rem 1.1rem 1.25rem; box-shadow: var(--shadow-sm); }
  .col header { display: flex; align-items: center; gap: .7rem; }
  .col h3 { margin: 0; flex: 1; font-size: 1.25rem; letter-spacing: -.02em; }
  .avatar { display: grid; place-items: center; flex: none; width: 2.5rem; height: 2.5rem; border-radius: 50%; background: var(--c); color: #fff; font-weight: 700; }
  .stars { font-weight: 700; font-variant-numeric: tabular-nums; color: var(--c); font-size: 1.15rem; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .bar { height: .5rem; margin: .8rem 0 .5rem; border-radius: 999px; background: var(--card-2); overflow: hidden; }
  .bar span { display: block; height: 100%; border-radius: inherit; background: var(--c); transition: width .25s ease; }
  .empty { margin: .75rem 0 0; color: var(--muted); }
  .routine { margin-top: 1rem; }
  .routine h4 { display: flex; flex-wrap: wrap; align-items: baseline; gap: .15rem .6rem; margin: 0; font-size: .95rem; letter-spacing: .01em; }
  .period { font-size: .75rem; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }
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
  .badge { display: inline-block; min-width: 1.3rem; padding: 0 .4rem; border-radius: 999px; background: var(--c); color: #fff; font-size: .8rem; text-align: center; }
  .ask { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem .6rem; padding: .5rem 0; }
  .small { width: auto; margin: 0; padding: .3rem .8rem; font-size: .85rem; }
  .muted { font-size: .88rem; font-weight: 400; }
  .manage-bar { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem 1rem; margin-bottom: 1.1rem; }
  .manage-btn { display: inline-flex; align-items: center; gap: .55rem; padding: .65rem 1.2rem; border-radius: 999px; background: var(--accent); color: var(--accent-fg, #fff); font-weight: 650; text-decoration: none; box-shadow: var(--shadow-sm); }
  .manage-btn:hover { filter: brightness(1.08); }
  .manage-btn svg { width: 1.25rem; height: 1.25rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
  .manage-btn .badge { background: #fff; color: var(--accent); }
  .filters { display: flex; flex-wrap: wrap; align-items: center; gap: .6rem 1.25rem; margin-bottom: 1.25rem; }
  .chips { display: flex; flex-wrap: wrap; gap: .4rem; }
  .pick { display: inline-flex; align-items: center; gap: .45rem; width: auto; margin: 0; padding: .35rem .85rem .35rem .4rem; border-radius: 999px; background: transparent; color: inherit; border: 1.5px solid var(--c, var(--border)); box-shadow: none; font-size: .92rem; font-weight: 600; }
  .pick.plain { padding: .35rem .9rem; --c: var(--border); }
  .pick:hover:not(:disabled) { background: color-mix(in srgb, var(--c, var(--accent)) 12%, transparent); filter: none; }
  .pick[aria-pressed="true"] { background: var(--c, var(--accent)); border-color: var(--c, var(--accent)); color: #fff; }
  .pick.plain[aria-pressed="true"] { --c: var(--accent); }
  .avatar.sm { width: 1.6rem; height: 1.6rem; font-size: .8rem; }
  .pick[aria-pressed="true"] .avatar.sm { background: #fff; color: var(--c); }
  .linklike { width: auto; margin: 0; padding: 0; background: none; border: 0; box-shadow: none; color: var(--accent); text-decoration: underline; font: inherit; }
</style>

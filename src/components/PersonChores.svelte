<script lang="ts">
  import RoutineEditor from './RoutineEditor.svelte';
  import { allowanceLeft, canAsk, formatWhen, LEDGER_LABEL, PERIOD_LABEL, periodRecord, sections, timeAvailable, type ChoreState } from '../lib/choreTypes';
  import { runChores } from '../lib/choreClient';
  import type { Person } from '../lib/people';

  let { initial, people, who, base = '/chores', demo = false }: { initial: ChoreState; people: Person[]; who: string; base?: string; demo?: boolean } = $props();

  let state = $state<ChoreState>(initial);
  let error = $state('');
  let busy = $state(false);

  const me = $derived(people.find((p) => p.id === who)!);
  const routine = $derived(state.routines.find((r) => r.person === who));
  const chores = $derived(routine?.items.filter((i) => i.due) ?? []);
  const groups = $derived(sections(chores));
  const points = $derived(state.balances[who] ?? 0);
  const banked = $derived(state.minutes[who] ?? 0);
  const allowance = $derived(state.allowance[who]);
  const left = $derived(allowanceLeft(allowance));
  const minutes = $derived(timeAvailable(state, who)); // what can be spent now
  const pending = $derived(state.pending.filter((r) => r.person === who));
  const available = $derived(points - pending.reduce((n, r) => n + r.cost, 0));
  const shop = $derived(state.rewards.filter((r) => !r.hidden && canAsk(r, who)));
  const history = $derived(state.recent.filter((e) => e.person === who));
  const done = $derived(chores.filter((i) => i.done).length);
  const total = $derived(chores.length);

  async function send(payload: Record<string, unknown>): Promise<boolean> {
    if (busy) return false;
    error = '';
    busy = true;
    const r = await runChores(state, payload, demo);
    busy = false;
    if (r.ok) { state = r.state; return true; }
    error = r.error;
    return false;
  }

  // --- Manager tools for this person ---
  let editing = $state(false);
  let allowDaily = $state(0);
  let allowWeekend = $state<number | null>(null);
  $effect(() => { allowDaily = allowance?.weekday ?? 0; allowWeekend = allowance?.weekend ?? null; }); // follows what was saved
  async function saveAllowance(e: SubmitEvent) {
    e.preventDefault();
    await send({ action: 'allowance_set', person: who, weekday: Number(allowDaily) || 0, weekend: allowWeekend === null ? null : Number(allowWeekend) || 0 });
  }
  let pointsDelta = $state(5);
  let timeDelta = $state(15);
  let note = $state('');
  async function adjust(e: SubmitEvent) {
    e.preventDefault();
    if (await send({ action: 'adjust', person: who, delta: pointsDelta, note: note.trim() })) note = '';
  }
  async function adjustTime(e: SubmitEvent) {
    e.preventDefault();
    if (await send({ action: 'adjust_time', person: who, delta: timeDelta, note: note.trim() })) note = '';
  }

  const initialOf = (p: Person) => [...p.name][0]!.toUpperCase();
</script>

<div class="me" style:--c={me.color}>
  <div class="topbar">
  <nav class="who" aria-label="Whose page">
    {#each people as p (p.id)}
      <a class="person" class:current={p.id === who} aria-current={p.id === who ? 'page' : undefined} style:--c={p.color} href={`${base}/${p.id}`} title={p.name}>
        <span class="av" aria-hidden="true">{initialOf(p)}</span>{#if p.id === who}<span class="pn">{p.name}</span>{/if}
      </a>
    {/each}
    <a class="person all" href={base} title="Everyone's chores">All</a>
  </nav>
  {#if state.manager}<button type="button" class="manage" aria-pressed={editing} onclick={() => (editing = !editing)}>{editing ? 'Done managing' : 'Manage'}</button>{/if}
  </div>

  {#if error}<p class="notice error" role="alert">{error}</p>{/if}

  <header class="hero">
    <span class="av big" aria-hidden="true">{initialOf(me)}</span>
    <h1>{me.name}</h1>
    <div class="stats">
      <div class="stat"><span class="n"><span aria-hidden="true">★</span> {points}</span><span class="l">points</span></div>
      <div class="stat">
        <span class="n"><span aria-hidden="true">⏱</span> {minutes}</span><span class="l">{allowance ? `min: ${left} left today + ${banked} banked` : 'min screen time'}</span>
        {#if minutes > 0}
          <span class="use">
            {#each [15, 30] as m (m)}
              {#if minutes >= m}<button type="button" class="small" disabled={busy} onclick={() => send({ action: 'use_time', person: who, minutes: m })}>Use {m}</button>{/if}
            {/each}
            {#if minutes !== 15 && minutes !== 30}<button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'use_time', person: who, minutes })}>Use all</button>{/if}
          </span>
        {/if}
      </div>
      <div class="stat"><span class="n"><span aria-hidden="true">✓</span> {done}/{total}</span><span class="l">chores today</span></div>
    </div>
  </header>

  <div class="grid">
    <div class="main">
  <section class="card" aria-labelledby="today-h">
    <h2 id="today-h">Today <span class="muted">{done}/{total} done</span></h2>
    <div class="bar" role="progressbar" aria-label="Done today" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}><span style:width={total ? `${(done / total) * 100}%` : '0%'}></span></div>
    {#each groups as g (g.period)}
      {@const bonus = routine?.bonuses[g.period] ?? 0}
      {@const earned = routine?.bonusEarned[g.period] ?? false}
      <div class="routine">
        {#if g.period !== 'any' || groups.length > 1}<h3>{PERIOD_LABEL[g.period]} <span class="muted">{g.items.filter((i) => i.done).length}/{g.items.length}</span></h3>{/if}
        <ul>
          {#each g.items as c (c.id)}
            <li class:done={c.done}>
              <button type="button" class="tick" aria-pressed={c.done} aria-label={`${c.title}${c.done ? ', done' : ''}`} disabled={busy} onclick={() => send({ action: 'check', id: c.id, done: !c.done })}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
              </button>
              <span class="label">{c.title}</span>
              {#if c.points > 0}<span class="pts">+{c.points}</span>{/if}
            </li>
          {/each}
        </ul>
        {#if bonus > 0}
          <p class="bonus" class:earned>{earned ? `All done! +${bonus} bonus` : `Finish them all for +${bonus} bonus`}</p>
        {/if}
      </div>
    {:else}
      <p class="muted">Nothing today.</p>
    {/each}
  </section>

      {#if state.manager && editing}
        <section class="card manage-panel" aria-labelledby="manage-h">
          <h2 id="manage-h">Manage {me.name}</h2>
          <p class="muted">Every chore in {me.name}'s routine, not only today's. Changes save as you make them.</p>
          <RoutineEditor person={who} name={me.name} items={routine?.items ?? []} bonuses={routine?.bonuses ?? periodRecord(0)} day={state.day} {busy} {send} />

          <h3>Daily screen time</h3>
          <p class="muted">A base allowance that comes back every day. It is not saved up: whatever is left at midnight is gone. Time they earn from rewards is kept in the bank and used after the allowance.</p>
          <form class="allow" onsubmit={saveAllowance}>
            <div class="field">
              <label for="allow-daily">{allowWeekend === null ? 'Minutes a day' : 'Weekdays'}</label>
              <input id="allow-daily" type="number" min="0" max="1440" bind:value={allowDaily} />
            </div>
            {#if allowWeekend !== null}
              <div class="field">
                <label for="allow-weekend">Weekends</label>
                <input id="allow-weekend" type="number" min="0" max="1440" bind:value={allowWeekend} />
              </div>
            {/if}
            <button type="submit" class="small" disabled={busy}>Save</button>
            <label class="check"><input type="checkbox" checked={allowWeekend !== null} onchange={(e) => (allowWeekend = e.currentTarget.checked ? allowDaily : null)} /> Different on weekends</label>
          </form>

          <h3>Points and screen time</h3>
          <p class="muted">Add or take away by hand, for a bonus or a correction.</p>
          <form class="adj" onsubmit={adjust}>
            <input class="pts" type="number" min="-1000" max="1000" bind:value={pointsDelta} aria-label="Points to add (negative to take away)" />
            <input class="grow" bind:value={note} maxlength="60" placeholder="Why (optional)" aria-label="Reason" autocomplete="off" />
            <button type="submit" class="small" disabled={busy || !pointsDelta}>Add points</button>
          </form>
          <form class="adj" onsubmit={adjustTime}>
            <input class="pts" type="number" min="-1440" max="1440" bind:value={timeDelta} aria-label="Minutes to add (negative to take away)" />
            <span class="muted grow">minutes of screen time</span>
            <button type="submit" class="small" disabled={busy || !timeDelta}>Add minutes</button>
          </form>
        </section>
      {/if}
    </div>
    <aside class="side">
  {#if state.goals.length > 0}
    <section class="card goals" aria-label="Household goals">
      <h2>Together</h2>
      <ul>
        {#each state.goals as g (g.id)}
          <li class:claimed={g.claimed}>
            <div class="gtop"><strong>{g.name}</strong><span class="muted">{g.claimed ? 'Enjoyed!' : g.progress >= g.target ? 'Goal reached!' : `${g.progress} / ${g.target} points`}</span></div>
            <div class="gbar" role="progressbar" aria-label={g.name} aria-valuemin={0} aria-valuemax={g.target} aria-valuenow={g.progress}><span style:width={`${(g.progress / g.target) * 100}%`}></span></div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="card" aria-labelledby="shop-h">
    <h2 id="shop-h">Rewards</h2>
    {#if pending.length > 0}
      <ul class="rows">
        {#each pending as r (r.id)}
          <li>
            <span class="label">{r.rewardName} <span class="muted">({r.cost} points{r.minutes > 0 ? `, ${r.minutes} min` : ''}), waiting for a manager</span></span>
            {#if state.manager}
              <button type="button" class="small" disabled={busy || points < r.cost} onclick={() => send({ action: 'decide', id: r.id, approve: true })}>Approve</button>
              <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'decide', id: r.id, approve: false })}>Deny</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    <ul class="rows">
      {#each shop as r (r.id)}
        {@const short = r.cost - available}
        <li>
          <span class="label">{r.name}{#if r.minutes > 0} <span class="muted">({r.minutes} min of screen time)</span>{/if}
            {#if short > 0}<span class="muted short">{short} more {short === 1 ? 'point' : 'points'} to go</span>{/if}
          </span>
          <button type="button" disabled={busy || short > 0} onclick={() => send({ action: 'redeem', person: who, rewardId: r.id })}><span aria-hidden="true">★</span> {r.cost}<span class="sr"> points, ask for {r.name}</span></button>
        </li>
      {:else}
        <li class="muted">No rewards to ask for yet.</li>
      {/each}
    </ul>
  </section>

  {#if history.length > 0}
    <section class="card" aria-labelledby="hist-h">
      <h2 id="hist-h">Recent</h2>
      <ul class="recent">
        {#each history as e (e.id)}
          <li><span class="when">{formatWhen(e.at)}</span> <strong class:neg={e.delta < 0}>{e.delta > 0 ? '+' : ''}{e.delta}</strong> <span class="muted">{LEDGER_LABEL[e.kind]}{e.note ? `: ${e.note}` : ''}</span></li>
        {/each}
      </ul>
    </section>
  {/if}
    </aside>
  </div>
</div>

<style>
  .me { max-width: 72rem; margin: 0 auto; }
  .grid { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: 0 1.5rem; align-items: start; }
  @media (max-width: 52rem) { .grid { grid-template-columns: minmax(0, 1fr); } }
  .topbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem 1rem; margin-bottom: 1rem; }
  .who { display: flex; flex-wrap: wrap; align-items: center; gap: .3rem; }
  .person { display: inline-flex; align-items: center; gap: .4rem; padding: .15rem; border-radius: 999px; font-size: .85rem; font-weight: 600; color: var(--fg); text-decoration: none; background: color-mix(in srgb, var(--c) 14%, var(--card)); border: 2px solid transparent; }
  .person:hover { background: color-mix(in srgb, var(--c) 24%, var(--card)); }
  .person.current { border-color: var(--c); padding-right: .7rem; }
  .person.all { --c: var(--border); padding: .35rem .8rem; background: transparent; border: 1px dashed var(--border); color: var(--muted); }
  .av { display: grid; place-items: center; flex: none; width: 1.6rem; height: 1.6rem; border-radius: 50%; background: var(--c); color: #fff; font-size: .78rem; font-weight: 700; }
  .av.big { width: 4rem; height: 4rem; font-size: 1.7rem; box-shadow: 0 0 0 4px color-mix(in srgb, var(--c) 30%, var(--card)); }
  .hero { display: flex; flex-wrap: wrap; align-items: center; gap: .75rem 1.25rem; margin-bottom: 1.25rem; padding: 1.1rem 1.25rem; background: linear-gradient(135deg, color-mix(in srgb, var(--c) 24%, var(--card)), color-mix(in srgb, var(--c) 7%, var(--card))); border: 1px solid color-mix(in srgb, var(--c) 35%, var(--border)); border-radius: var(--radius); box-shadow: var(--shadow-sm); }
  .hero h1 { margin: 0; font-size: 2rem; flex: 1 1 8rem; }
  .stats { display: flex; flex-wrap: wrap; gap: .75rem; }
  .stat { display: grid; gap: .1rem; min-width: 8.5rem; padding: .6rem .9rem; border-radius: var(--radius); background: var(--card); box-shadow: var(--shadow-sm); }
  .stat .n { font-size: 1.8rem; font-weight: 750; letter-spacing: -.02em; color: var(--fg); font-variant-numeric: tabular-nums; }
  .stat .n > span[aria-hidden="true"] { color: var(--c); }
  .stat .l { color: var(--muted); font-size: .9rem; }
  .manage { width: auto; margin: 0 0 0 auto; padding: .45rem 1rem; border-radius: 999px; font-size: .9rem; }
  .manage[aria-pressed="true"] { background: var(--card); color: var(--accent); border: 1.5px solid var(--accent); }
  .manage-panel h3 { margin: 1.5rem 0 .25rem; font-size: 1rem; }
  .adj { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin-top: .5rem; }
  .adj input { margin: 0; }
  .allow { display: flex; flex-wrap: wrap; align-items: flex-end; gap: .6rem .9rem; margin-top: .6rem; }
  .allow .field { display: grid; gap: .25rem; }
  .allow label { font-size: .85rem; font-weight: 600; color: var(--muted); }
  .allow input[type="number"] { width: 6.5rem; margin: 0; padding: .45rem .65rem; }
  .allow .small { margin-bottom: .1rem; }
  .allow .check { flex: 1 1 100%; display: flex; align-items: center; gap: .5rem; font-size: .9rem; font-weight: 500; color: var(--fg); }
  .allow .check input { width: auto; margin: 0; }
  .adj .grow { flex: 1 1 10rem; }
  .adj .pts { flex: 0 0 5.5rem; width: 5.5rem; }
  .use { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .35rem; }
  .small { width: auto; margin: 0; padding: .3rem .8rem; font-size: .85rem; }
  .use button, .rows button { width: auto; margin: 0; }
  .card { margin-bottom: 1.25rem; }
  .card h2 { margin: 0 0 .6rem; font-size: 1.15rem; }
  .muted { font-size: .9rem; font-weight: 400; color: var(--muted); }
  .short { display: block; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  ul { list-style: none; margin: 0; padding: 0; }
  .bar, .gbar { height: .6rem; border-radius: 999px; background: var(--card-2); overflow: hidden; }
  .bar span { display: block; height: 100%; border-radius: inherit; background: var(--c); transition: width .25s ease; }
  .gbar { height: .85rem; margin-top: .4rem; }
  .gbar span { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: width .25s ease; }
  .goals li { padding: .5rem 0; }
  .goals li + li { border-top: 1px solid var(--border); }
  .goals .claimed { opacity: .6; }
  .gtop { display: flex; flex-wrap: wrap; justify-content: space-between; gap: .2rem .75rem; }
  .routine { margin-top: 1rem; }
  .routine h3 { margin: 0; font-size: 1rem; }
  li { display: flex; align-items: center; gap: .85rem; padding: .55rem 0; }
  li + li { border-top: 1px solid var(--border); }
  .goals li { display: block; }
  .label { min-width: 0; flex: 1; overflow-wrap: anywhere; font-size: 1.1rem; font-weight: 500; }
  .done .label { color: var(--muted); text-decoration: line-through; }
  .pts { font-size: .9rem; font-weight: 650; color: var(--c); font-variant-numeric: tabular-nums; }
  .bonus { margin: .25rem 0 0; font-size: .9rem; color: var(--muted); }
  .bonus.earned { color: var(--c); font-weight: 650; }
  .tick { display: grid; place-items: center; flex: none; width: 3rem; height: 3rem; margin: 0; padding: 0; border-radius: 50%; background: transparent; border: 2.5px solid var(--c); box-shadow: none; color: transparent; }
  .tick:hover:not(:disabled) { background: color-mix(in srgb, var(--c) 14%, transparent); filter: none; }
  .tick[aria-pressed="true"] { background: var(--c); color: #fff; }
  .tick svg { width: 1.5rem; height: 1.5rem; fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
  .recent li { flex-wrap: wrap; gap: .1rem .6rem; padding: .3rem 0; font-size: .92rem; }
  .when { color: var(--muted); font-variant-numeric: tabular-nums; }
  .neg { color: var(--danger, #c92a2a); }
  @media (pointer: coarse) { .person { min-height: 2.75rem; } .person.all { display: inline-flex; align-items: center; } }
</style>

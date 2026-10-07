<script lang="ts">
  import RoutineEditor from './RoutineEditor.svelte';
  import Stepper from './Stepper.svelte';
  import { allowanceLeft, canAsk, formatWhen, LEDGER_LABEL, PERIOD_LABEL, periodRecord, sections, timeAvailable, type ChoreState } from '../lib/choreTypes';
  import { chorePipe } from '../lib/chorePipe.svelte';
  import type { Person } from '../lib/people';

  let { initial, people, who, base = '/chores', demo = false }: { initial: ChoreState; people: Person[]; who: string; base?: string; demo?: boolean } = $props();

  // svelte-ignore state_referenced_locally
  let choreState = $state<ChoreState>(initial);
  // svelte-ignore state_referenced_locally
  const pipe = chorePipe(() => choreState, (s) => (choreState = s), demo);
  const busy = $derived(pipe.busy);
  const error = $derived(pipe.error);

  const me = $derived(people.find((p) => p.id === who)!);
  const routine = $derived(choreState.routines.find((r) => r.person === who));
  const chores = $derived(routine?.items.filter((i) => i.due) ?? []);
  const groups = $derived(sections(chores));
  const points = $derived(choreState.balances[who] ?? 0);
  const banked = $derived(choreState.minutes[who] ?? 0);
  const allowance = $derived(choreState.allowance[who]);
  const left = $derived(allowanceLeft(allowance));
  const minutes = $derived(timeAvailable(choreState, who)); // what can be spent now
  const pending = $derived(choreState.pending.filter((r) => r.person === who));
  const available = $derived(points - pending.reduce((n, r) => n + r.cost, 0));
  const shop = $derived(choreState.rewards.filter((r) => !r.hidden && canAsk(r, who)));
  const history = $derived(choreState.recent.filter((e) => e.person === who));
  const done = $derived(chores.filter((i) => i.done).length);
  const total = $derived(chores.length);

  const send = pipe.send;

  // --- Manager tools for this person ---
  let editing = $state(false);
  let allowDaily = $state(0);
  let allowWeekend = $state(0);
  let splitWeekend = $state(false); // weekends get their own allowance
  $effect(() => { allowDaily = allowance?.weekday ?? 0; splitWeekend = allowance?.weekend != null; allowWeekend = allowance?.weekend ?? allowance?.weekday ?? 0; }); // follows what was saved
  async function saveAllowance(e: SubmitEvent) {
    e.preventDefault();
    await send({ action: 'allowance_set', person: who, weekday: Number(allowDaily) || 0, weekend: splitWeekend ? Number(allowWeekend) || 0 : null });
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

<div class="max-w-[72rem] mx-auto" style:--c={me.color}>
  <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-4">
  <nav class="flex flex-wrap items-center gap-[.3rem]" aria-label="Whose page">
    {#each people as p (p.id)}
      <a class="inline-flex items-center gap-[.4rem] p-[.15rem] rounded-full text-[.85rem] font-semibold text-fg no-underline bg-[color-mix(in_srgb,var(--c)_14%,var(--card))] border-2 border-solid hover:bg-[color-mix(in_srgb,var(--c)_24%,var(--card))] pointer-coarse:min-h-11 {p.id === who ? 'border-[var(--c)] pr-[.7rem]' : 'border-transparent'}" aria-current={p.id === who ? 'page' : undefined} style:--c={p.color} href={`${base}/${p.id}`} title={p.name}>
        <span class="avatar size-[1.6rem] text-[.78rem]" aria-hidden="true">{initialOf(p)}</span>{#if p.id === who}<span class="pn">{p.name}</span>{/if}
      </a>
    {/each}
    <a class="inline-flex items-center py-[.35rem] px-[.8rem] rounded-full text-[.85rem] font-semibold text-muted no-underline bg-transparent [border:1px_dashed_var(--border)] pointer-coarse:min-h-11" href={base} title="Everyone's chores">All</a>
  </nav>
  {#if choreState.manager}<button type="button" class="w-auto [margin:0_0_0_auto] py-[.45rem] px-4 rounded-full text-[.9rem] [&[aria-pressed=true]]:bg-card [&[aria-pressed=true]]:text-accent [&[aria-pressed=true]]:border-[1.5px] [&[aria-pressed=true]]:border-accent" aria-pressed={editing} onclick={() => (editing = !editing)}>{editing ? 'Done managing' : 'Manage'}</button>{/if}
  </div>

  {#if error}<p class="notice error sticky top-2 z-30" role="alert">{error}</p>{/if}

  <header class="flex flex-wrap items-center gap-x-5 gap-y-3 mb-5 py-[1.1rem] px-5 border border-solid border-[color-mix(in_srgb,var(--c)_35%,var(--border))] rounded-[var(--radius)] shadow-[var(--shadow-sm)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--c)_24%,var(--card)),color-mix(in_srgb,var(--c)_7%,var(--card)))]">
    <span class="avatar size-16 text-[1.7rem] shadow-[0_0_0_4px_color-mix(in_srgb,var(--c)_30%,var(--card))]" aria-hidden="true">{initialOf(me)}</span>
    <h1 class="m-0 text-[2rem] flex-[1_1_8rem]">{me.name}</h1>
    <div class="flex flex-wrap gap-3">
      <div class="stat"><span class="stat-n"><span aria-hidden="true">★</span> {points}</span><span class="text-muted text-[.9rem]">points</span></div>
      <div class="stat">
        <span class="stat-n"><span aria-hidden="true">⏱</span> {minutes}</span><span class="text-muted text-[.9rem]">{allowance ? `min: ${left} left today + ${banked} banked` : 'min screen time'}</span>
        {#if minutes > 0}
          <span class="flex flex-wrap gap-[.4rem] mt-[.35rem]">
            {#each [15, 30] as m (m)}
              {#if minutes >= m}<button type="button" class="small" disabled={busy} onclick={() => send({ action: 'use_time', person: who, minutes: m })}>Use {m}</button>{/if}
            {/each}
            {#if minutes !== 15 && minutes !== 30}<button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'use_time', person: who, minutes })}>Use all</button>{/if}
          </span>
        {/if}
      </div>
      <div class="stat"><span class="stat-n"><span aria-hidden="true">✓</span> {done}/{total}</span><span class="text-muted text-[.9rem]">chores today</span></div>
    </div>
  </header>

  <div class="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] max-[52rem]:grid-cols-[minmax(0,1fr)] gap-x-6 items-start">
    <div>
  <section class="card" aria-labelledby="today-h">
    <h2 class="card-h" id="today-h">Today <span class="note">{done}/{total} done</span></h2>
    <div class="track h-[.6rem]" role="progressbar" aria-label="Done today" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}><span class="fill bg-[var(--c)]" style:width={total ? `${(done / total) * 100}%` : '0%'}></span></div>
    {#each groups as g (g.period)}
      {@const bonus = routine?.bonuses[g.period] ?? 0}
      {@const earned = routine?.bonusEarned[g.period] ?? false}
      <div class="mt-4">
        {#if g.period !== 'any' || groups.length > 1}<h3 class="m-0 text-[1rem]">{PERIOD_LABEL[g.period]} <span class="note">{g.items.filter((i) => i.done).length}/{g.items.length}</span></h3>{/if}
        <ul class="list-none m-0 p-0">
          {#each g.items as c (c.id)}
            <li class="list-row">
              <button type="button" class="tick size-12 [&_svg]:size-6" aria-pressed={c.done} aria-label={`${c.title}${c.done ? ', done' : ''}`} disabled={busy} onclick={() => send({ action: 'check', id: c.id, done: !c.done })}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
              </button>
              <span class="min-w-0 flex-1 [overflow-wrap:anywhere] text-[1.1rem] font-medium {c.done ? 'text-muted line-through' : ''}">{c.title}</span>
              {#if c.points > 0}<span class="text-[.9rem] [font-weight:650] text-[color:var(--c)] tabular-nums">+{c.points}</span>{/if}
            </li>
          {/each}
        </ul>
        {#if bonus > 0}
          <p class="mt-1 mx-0 mb-0 text-[.9rem] {earned ? 'text-[color:var(--c)] [font-weight:650]' : 'text-muted'}">{earned ? `All done! +${bonus} bonus` : `Finish them all for +${bonus} bonus`}</p>
        {/if}
      </div>
    {:else}
      <p class="note">Nothing today.</p>
    {/each}
  </section>

      {#if choreState.manager && editing}
        <section class="card" aria-labelledby="manage-h">
          <h2 class="card-h" id="manage-h">Manage {me.name}</h2>
          <p class="note">Every chore in {me.name}'s routine, not only today's. Changes save as you make them.</p>
          <RoutineEditor person={who} name={me.name} items={routine?.items ?? []} bonuses={routine?.bonuses ?? periodRecord(0)} day={choreState.day} {busy} {send} />

          <h3 class="mt-6 mb-1 mx-0 text-[1rem]">Daily screen time</h3>
          <p class="note">A base allowance that comes back every day. It is not saved up: whatever is left at midnight is gone. Time they earn from rewards is kept in the bank and used after the allowance.</p>
          <form class="flex flex-wrap items-end gap-x-[.9rem] gap-y-[.6rem] mt-[.6rem]" onsubmit={saveAllowance}>
            <div class="grid gap-1">
              <span class="text-[.85rem] font-semibold text-muted">{splitWeekend ? 'Weekdays' : 'Minutes a day'}</span>
              <Stepper class="w-[9.75rem]" bind:value={allowDaily} min={0} max={1440} step={5} label={splitWeekend ? 'Weekday minutes' : 'Minutes a day'} />
            </div>
            {#if splitWeekend}
              <div class="grid gap-1">
                <span class="text-[.85rem] font-semibold text-muted">Weekends</span>
                <Stepper class="w-[9.75rem]" bind:value={allowWeekend} min={0} max={1440} step={5} label="Weekend minutes" />
              </div>
            {/if}
            <button type="submit" class="small [&&&]:mb-[.1rem]" disabled={busy}>Save</button>
            <label class="flex-[1_1_100%] flex items-center gap-2 text-[.9rem] font-medium text-fg"><input class="w-auto m-0" type="checkbox" bind:checked={splitWeekend} onchange={() => { if (splitWeekend) allowWeekend = allowDaily; }} /> Different on weekends</label>
          </form>

          <h3 class="mt-6 mb-1 mx-0 text-[1rem]">Points and screen time</h3>
          <p class="note">Add or take away by hand, for a bonus or a correction.</p>
          <form class="flex flex-wrap items-center gap-2 mt-2" onsubmit={adjust}>
            <Stepper class="w-[9.75rem]" bind:value={pointsDelta} min={-1000} max={1000} label="Points to add (negative to take away)" />
            <input class="m-0 flex-[1_1_10rem]" bind:value={note} maxlength="60" placeholder="Why (optional)" aria-label="Reason" autocomplete="off" />
            <button type="submit" class="small" disabled={busy || !pointsDelta}>Add points</button>
          </form>
          <form class="flex flex-wrap items-center gap-2 mt-2" onsubmit={adjustTime}>
            <Stepper class="w-[9.75rem]" bind:value={timeDelta} min={-1440} max={1440} step={5} label="Minutes to add (negative to take away)" />
            <span class="note flex-[1_1_10rem]">minutes of screen time</span>
            <button type="submit" class="small" disabled={busy || !timeDelta}>Add minutes</button>
          </form>
        </section>
      {/if}
    </div>
    <aside>
  {#if choreState.goals.length > 0}
    <section class="card" aria-label="Household goals">
      <h2 class="card-h">Together</h2>
      <ul class="list-none m-0 p-0">
        {#each choreState.goals as g (g.id)}
          <li class="block py-2 [li+&]:[border-top:1px_solid_var(--border)] {g.claimed ? 'opacity-60' : ''}">
            <div class="flex flex-wrap justify-between gap-x-3 gap-y-[.2rem]"><strong>{g.name}</strong><span class="note">{g.claimed ? 'Enjoyed!' : g.progress >= g.target ? 'Goal reached!' : `${g.progress} / ${g.target} points`}</span></div>
            <div class="track h-[.85rem] mt-[.4rem]" role="progressbar" aria-label={g.name} aria-valuemin={0} aria-valuemax={g.target} aria-valuenow={g.progress}><span class="fill bg-accent" style:width={`${(g.progress / g.target) * 100}%`}></span></div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="card" aria-labelledby="shop-h">
    <h2 class="card-h" id="shop-h">Rewards</h2>
    {#if pending.length > 0}
      <ul class="list-none m-0 p-0">
        {#each pending as r (r.id)}
          <li class="list-row">
            <span class="min-w-0 flex-1 [overflow-wrap:anywhere] text-[1.1rem] font-medium">{r.rewardName} <span class="note">({r.cost} points{r.minutes > 0 ? `, ${r.minutes} min` : ''}), waiting for a manager</span></span>
            {#if choreState.manager}
              <button type="button" class="small" disabled={busy || points < r.cost} onclick={() => send({ action: 'decide', id: r.id, approve: true })}>Approve</button>
              <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'decide', id: r.id, approve: false })}>Deny</button>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    <ul class="list-none m-0 p-0">
      {#each shop as r (r.id)}
        {@const short = r.cost - available}
        <li class="list-row">
          <span class="min-w-0 flex-1 [overflow-wrap:anywhere] text-[1.1rem] font-medium">{r.name}{#if r.minutes > 0} <span class="note">({r.minutes} min of screen time)</span>{/if}
            {#if short > 0}<span class="note block">{short} more {short === 1 ? 'point' : 'points'} to go</span>{/if}
          </span>
          <button type="button" class="w-auto m-0" disabled={busy || short > 0} onclick={() => send({ action: 'redeem', person: who, rewardId: r.id })}><span aria-hidden="true">★</span> {r.cost}<span class="sr-only"> points, ask for {r.name}</span></button>
        </li>
      {:else}
        <li class="note list-row">No rewards to ask for yet.</li>
      {/each}
    </ul>
  </section>

  {#if history.length > 0}
    <section class="card" aria-labelledby="hist-h">
      <h2 class="card-h" id="hist-h">Recent</h2>
      <ul class="list-none m-0 p-0">
        {#each history as e (e.id)}
          <li class="flex flex-wrap items-center gap-x-[.6rem] gap-y-[.1rem] py-[.3rem] text-[.92rem] [li+&]:[border-top:1px_solid_var(--border)]"><span class="text-muted tabular-nums">{formatWhen(e.at)}</span> <strong class={e.delta < 0 ? 'text-danger' : ''}>{e.delta > 0 ? '+' : ''}{e.delta}</strong> <span class="note">{LEDGER_LABEL[e.kind]}{e.note ? `: ${e.note}` : ''}</span></li>
        {/each}
      </ul>
    </section>
  {/if}
    </aside>
  </div>
</div>

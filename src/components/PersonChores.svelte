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

  let menu = $state<HTMLElement>();
  let picked = $state<number | null>(null); // minutes awaiting confirmation
  const fromAllowance = $derived(Math.min(picked ?? 0, allowance ? left : 0));
  let used = $state(false); // spent: the thank-you shows for a moment before the menu closes
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  async function confirmUse() {
    if (picked === null) return;
    const m = picked;
    if (!(await send({ action: 'use_time', person: who, minutes: m }))) return;
    used = true;
    closeTimer = setTimeout(() => menu?.hidePopover(), 1800);
  }
  $effect(() => () => clearTimeout(closeTimer));
  /** Every way of closing the menu lands here: forget the pending step so it reopens fresh. */
  function menuToggled(e: Event) {
    if ((e as ToggleEvent).newState !== 'closed') return;
    clearTimeout(closeTimer);
    picked = null;
    used = false;
  }

  // Spending screen time: a popover (like the Display menu) of 5 minute blocks, plus the exact remainder when it is not a multiple of 5.
  const useOptions = $derived.by(() => {
    const opts: number[] = [];
    for (let m = 5; m <= minutes; m += 5) opts.push(m);
    if (minutes % 5 !== 0 || opts.length === 0) opts.push(minutes);
    return opts;
  });
  let slot = $state(2); // slider position, an index into useOptions
  const slotAt = $derived(Math.min(slot, useOptions.length - 1));
  const chosen = $derived(useOptions[slotAt] ?? 0);
  const slotPct = $derived(useOptions.length > 1 ? (slotAt / (useOptions.length - 1)) * 100 : 100);
  const afterPct = $derived(minutes && picked !== null ? ((minutes - picked) / minutes) * 100 : 0);

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

  // Stat tiles shrink to pills on phones (screen time keeps its own row).
  const pill = 'max-[34rem]:flex max-[34rem]:items-center max-[34rem]:min-w-0 max-[34rem]:gap-[.2rem] max-[34rem]:py-[.25rem] max-[34rem]:px-[.65rem] max-[34rem]:rounded-full';
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

  <header class="flex flex-wrap items-center gap-x-5 gap-y-3 mb-5 py-[1.1rem] px-5 border border-solid border-[color-mix(in_srgb,var(--c)_35%,var(--border))] rounded-[var(--radius)] shadow-[var(--shadow-sm)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--c)_24%,var(--card)),color-mix(in_srgb,var(--c)_7%,var(--card)))] max-[34rem]:gap-x-2 max-[34rem]:gap-y-2 max-[34rem]:mb-3 max-[34rem]:p-3">
    <span class="avatar size-16 text-[1.7rem] shadow-[0_0_0_4px_color-mix(in_srgb,var(--c)_30%,var(--card))] max-[34rem]:size-10 max-[34rem]:text-[1.1rem] max-[34rem]:shadow-none" aria-hidden="true">{initialOf(me)}</span>
    <h1 class="m-0 text-[2rem] flex-[1_1_8rem] max-[34rem]:text-[1.5rem] max-[34rem]:basis-0 max-[34rem]:min-w-0">{me.name}</h1>
    <!-- On phones the wrapper dissolves: points and chores become pills beside the name, screen time a slim full-width row. -->
    <div class="flex flex-wrap gap-3 max-[34rem]:contents">
      <div class="stat {pill}"><span class="stat-n max-[34rem]:text-[1rem]"><span aria-hidden="true">★</span> {points}</span><span class="text-muted text-[.9rem] max-[34rem]:sr-only">points</span></div>
      <div class="stat {pill}"><span class="stat-n max-[34rem]:text-[1rem]"><span aria-hidden="true">✓</span> {done}/{total}</span><span class="text-muted text-[.9rem] max-[34rem]:sr-only">chores today</span></div>
      <div class="stat max-[34rem]:order-last max-[34rem]:basis-full max-[34rem]:grid-cols-[1fr_auto] max-[34rem]:items-center max-[34rem]:gap-x-3 max-[34rem]:py-[.5rem]">
        <span class="stat-n max-[34rem]:text-[1.3rem]"><span aria-hidden="true">⏱</span> {minutes}</span><span class="text-muted text-[.9rem] max-[34rem]:text-[.8rem] max-[34rem]:[grid-column:1]">{allowance ? `min: ${left} left today + ${banked} banked` : 'min screen time'}</span>
        {#if minutes > 0}
          <div class="mt-[.35rem] max-[34rem]:mt-0 max-[34rem]:[grid-column:2] max-[34rem]:[grid-row:1/span_2]">
            <button type="button" class="small use-btn" disabled={busy} popovertarget="use-menu">Use</button>
            <div id="use-menu" class="use-menu" popover bind:this={menu} ontoggle={menuToggled}>
              {#if used}
                <div class="use-hooray" role="status"><span class="use-big" aria-hidden="true">🎉</span><p class="m-0 text-[1.2rem] font-bold">Enjoy your screen time, {me.name}!</p><p class="note m-0">{picked} minutes of screen time, starting now.</p></div>
              {:else if picked === null}
                <p class="use-title">How much screen time do you want to use?</p>
                <p class="use-big-n">{chosen}<span> min</span></p>
                <input class="use-range" type="range" min="0" max={useOptions.length - 1} step="1" style:--pct={`${slotPct}%`} bind:value={slot} disabled={useOptions.length < 2} aria-label="Minutes of screen time to use" aria-valuetext={`${chosen} minutes`} />
                <p class="use-ends"><span>{useOptions[0]} min</span><span>{useOptions[useOptions.length - 1]} min</span></p>
                <div class="flex items-center gap-2">
                  <button type="button" class="ghost small use-back" popovertarget="use-menu" popovertargetaction="hide">Cancel</button>
                  <button type="button" class="use-go flex-1 w-auto" onclick={() => (picked = chosen)}>Next</button>
                </div>
              {:else}
                <p class="use-title">Ready to use</p>
                <p class="use-big-n">{picked}<span> min</span></p>
                <div class="use-bar" role="img" aria-label={`${minutes - picked} of ${minutes} minutes left after this`}>
                  <span class="use-left" style:width={`${afterPct}%`}></span>
                  <span class="use-spent"></span>
                </div>
                <p class="use-key"><span class="use-dot left"></span>left for later <span class="use-dot spent"></span>using now</p>
                <p class="m-0 mt-2 text-center font-semibold">{minutes - picked > 0 ? `You'll still have ${minutes - picked} min left!` : "That's all your time. Make it count!"}</p>
                <p class="note m-0 text-center">{#if fromAllowance > 0}{fromAllowance} from today's time{/if}{#if fromAllowance > 0 && picked > fromAllowance}, {/if}{#if picked > fromAllowance}{picked - fromAllowance} from your saved-up time{/if}</p>
                <div class="grid gap-2 mt-3 justify-items-center">
                  <button type="button" class="use-go" disabled={busy} onclick={confirmUse}>Let's go! 🚀</button>
                  <button type="button" class="ghost small use-back" onclick={() => (picked = null)}>Not yet</button>
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </header>

  <div class="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] max-[52rem]:grid-cols-[minmax(0,1fr)] gap-x-6 items-start">
    <div>
  {#if choreState.manager && editing}
  <section class="card" aria-labelledby="today-h">
    <h2 class="card-h" id="today-h">Routine <span class="note">{routine?.items.length ?? 0} {routine?.items.length === 1 ? 'chore' : 'chores'}, tap one to edit</span></h2>
    <RoutineEditor person={who} name={me.name} items={routine?.items ?? []} bonuses={routine?.bonuses ?? periodRecord(0)} day={choreState.day} {busy} {send} collapsible />
  </section>
  {:else}
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
  {/if}

      {#if choreState.manager && editing}
        <section class="card" aria-labelledby="manage-h">
          <h2 class="card-h" id="manage-h">Screen time and points</h2>
          <h3 class="mt-2 mb-1 mx-0 text-[1rem]">Daily screen time</h3>
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

<script lang="ts">
  import RoutineEditor from './RoutineEditor.svelte';
  import ConfirmButton from './ConfirmButton.svelte';
  import Stepper from './Stepper.svelte';
  import { formatWhen, LEDGER_LABEL, periodRecord, type ChoreItem, type ChoreState } from '../lib/choreTypes';
  import { keep, text } from '../lib/choreClient';
  import { chorePipe } from '../lib/chorePipe.svelte';
  import type { Person } from '../lib/people';

  let { initial, people, demo = false }: { initial: ChoreState; people: Person[]; demo?: boolean } = $props();

  // svelte-ignore state_referenced_locally
  let choreState = $state<ChoreState>(initial);
  // svelte-ignore state_referenced_locally
  const pipe = chorePipe(() => choreState, (s) => (choreState = s), demo);
  const busy = $derived(pipe.busy);
  const error = $derived(pipe.error);

  const nameOf = (id: string | null) => (id ? people.find((p) => p.id === id)?.name ?? 'Unknown' : 'Anyone');

  const send = pipe.send;

  /** The people to manage chores for: each person, "Anyone", and anyone with chores who has since left the household. */
  const owners = $derived([
    ...people.map((p) => ({ id: p.id as string | null, name: p.name, color: p.color })),
    { id: null as string | null, name: 'Anyone', color: 'var(--accent)' },
    ...choreState.routines.filter((r) => r.person && !people.some((p) => p.id === r.person)).map((r) => ({ id: r.person, name: nameOf(r.person), color: 'var(--muted)' })),
  ]);
  const itemsOf = (id: string | null): ChoreItem[] => choreState.routines.find((r) => r.person === id)?.items ?? [];
  const bonusesOf = (id: string | null) => choreState.routines.find((r) => r.person === id)?.bonuses ?? periodRecord(0);

  /** Who a reward's scope lets ask: everyone, or the people picked. */
  function scopeLabel(ids: string[] | null): string {
    if (ids === null) return 'Anyone can ask';
    const names = ids.map((id) => nameOf(id));
    return names.length > 0 ? `Only ${names.join(', ')}` : 'Nobody can ask yet (pick someone)';
  }
  const togglePerson = (ids: string[] | null, id: string): string[] => ((ids ?? []).includes(id) ? (ids ?? []).filter((x) => x !== id) : [...(ids ?? []), id]);

  let rewardName = $state('');
  let rewardScope = $state<string[] | null>(null);
  let rewardCost = $state(10);
  let rewardMinutes = $state(0);
  async function addReward(e: SubmitEvent) {
    e.preventDefault();
    if (await send({ action: 'reward_save', name: rewardName.trim(), cost: rewardCost, minutes: rewardMinutes, people: rewardScope })) { rewardName = ''; rewardScope = null; rewardMinutes = 0; }
  }

  let goalName = $state('');
  let goalTarget = $state(100);
  async function addGoal(e: SubmitEvent) {
    e.preventDefault();
    if (await send({ action: 'goal_save', name: goalName.trim(), target: goalTarget })) goalName = '';
  }

  let adjPerson = $state('');
  let adjDelta = $state(5);
  let adjNote = $state('');
  async function adjust(e: SubmitEvent) {
    e.preventDefault();
    if (adjPerson && (await send({ action: 'adjust', person: adjPerson, delta: adjDelta, note: adjNote.trim() }))) adjNote = '';
  }
  let timeDelta = $state(15);
  async function adjustTime(e: SubmitEvent) {
    e.preventDefault();
    if (adjPerson) await send({ action: 'adjust_time', person: adjPerson, delta: timeDelta, note: adjNote.trim() });
  }
  $effect(() => { if (!adjPerson && people[0]) adjPerson = people[0].id; });

</script>

{#if error}<p class="notice error sticky top-2 z-30" role="alert">{error}</p>{/if}
{#key pipe.saved}{#if pipe.saved > 0 && !error}<p class="notice toast" role="status">Saved</p>{/if}{/key}

<nav class="jump sticky top-0 z-20 pt-2 bg-bg" aria-label="Manage sections">
  {#if choreState.pending.length > 0}<a class="jump-link" href="#pending-h">Approvals<span class="jump-count">{choreState.pending.length}</span></a>{/if}
  <a class="jump-link" href="#goals">Goals</a>
  <a class="jump-link" href="#chores">Chores</a>
  <a class="jump-link" href="#rewards">Rewards</a>
  <a class="jump-link" href="#points">Points</a>
</nav>

{#if choreState.pending.length > 0}
  <section class="card" aria-labelledby="pending-h">
    <h2 class="mt-0" id="pending-h">Waiting for approval <span class="inline-block min-w-[1.4rem] px-[.45rem] rounded-full bg-accent text-white text-[.85rem] font-semibold text-center align-middle">{choreState.pending.length}</span></h2>
    <ul class="list-none m-0 p-0">
      {#each choreState.pending as r (r.id)}
        {@const left = (choreState.balances[r.person] ?? 0) - r.cost}
        <li class="flex flex-wrap items-center gap-x-[.6rem] gap-y-[.4rem] py-2 [border-top:1px_solid_var(--border)]">
          <span class="flex-[1_1_14rem]"><strong>{nameOf(r.person)}</strong> asked for <strong>{r.rewardName}</strong> <span class="note">({r.cost} pts{r.minutes > 0 ? `, ${r.minutes} min` : ''}, {left} left after · {formatWhen(r.requestedAt)})</span></span>
          <button type="button" class="small" disabled={busy || left < 0} onclick={() => send({ action: 'decide', id: r.id, approve: true })}>Approve</button>
          <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'decide', id: r.id, approve: false })}>Deny</button>
          {#if left < 0}<span class="note">Not enough points now</span>{/if}
        </li>
      {/each}
    </ul>
    {#if choreState.pending.length > 1}
      <p><button type="button" class="small" disabled={busy} onclick={() => send({ action: 'decide_all' })}>Approve all they can afford</button></p>
    {/if}
  </section>
{/if}

<section class="card" id="goals">
  <h2 class="mt-0">Household goals</h2>
  <p class="note">A target everyone works toward together. Every point anyone earns counts, and spending points on personal rewards does not lower it. When a goal is reached, treat the household, then mark it as enjoyed.</p>
  <ul class="list-none m-0 p-0">
    {#each choreState.goals as g (g.id)}
      <li class="edit-card">
        <input class="m-0" value={g.name} data-v={g.name} maxlength="60" aria-label="Goal" disabled={g.claimed} onchange={(e) => keep(e, !!text(e) && send({ action: 'goal_save', id: g.id, name: text(e), target: g.target }))} />
        <div class="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-2">
          <Stepper caption="Target points" class="w-[9.75rem]" value={g.target} min={1} max={1000000} step={10} label={`Target for ${g.name}`} onchange={(n) => send({ action: 'goal_save', id: g.id, name: g.name, target: n })} />
          <span class="note pb-3">{g.claimed ? 'Enjoyed' : `${g.progress} so far`}</span>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-2">
          {#if !g.claimed && g.progress >= g.target}<button type="button" class="small" disabled={busy} onclick={() => send({ action: 'goal_claim', id: g.id })}>Mark as enjoyed</button>{/if}
          <ConfirmButton ariaLabel={`Remove ${g.name}`} disabled={busy} onconfirm={() => send({ action: 'goal_remove', id: g.id })} />
        </div>
      </li>
    {/each}
  </ul>
  <form class="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-2 mt-3" onsubmit={addGoal}>
    <input class="m-0 col-span-2" bind:value={goalName} maxlength="60" required placeholder="Family pizza night" aria-label="New goal" autocomplete="off" />
    <Stepper caption="Target points" class="w-[9.75rem]" bind:value={goalTarget} min={1} max={1000000} step={10} label="Target in points" />
    <button type="submit" class="small [&&&]:w-full" disabled={busy || !goalName.trim()}>Add goal</button>
  </form>
</section>

<section class="card" id="chores">
  <h2 class="mt-0">Chores</h2>
  <p class="note">One routine for each person, split by time of day. Each chore has its own days, or can be a one-off. Chores are ticked off on the Chores page and start fresh every day they are scheduled. The all-done bonus is paid when every chore due in that time of day is ticked.</p>

  {#each owners as o (o.id ?? 'anyone')}
    {@const items = itemsOf(o.id)}
    <details class="py-3 [border-top:1px_solid_var(--border)]" open={false}>
      <summary class="cursor-pointer flex flex-wrap gap-x-3 gap-y-[.1rem] items-baseline pointer-coarse:min-h-11">
        <strong style:color={o.color}>{o.name}</strong>
        <span class="note">{items.length} {items.length === 1 ? 'chore' : 'chores'}{o.id === null ? ' · no points' : ''}</span>
      </summary>

      <RoutineEditor person={o.id} name={o.name} {items} bonuses={bonusesOf(o.id)} day={choreState.day} {busy} {send} />
    </details>
  {/each}
</section>

{#snippet scope(group: string, ids: string[] | null, set: (ids: string[] | null) => void)}
  <details class="flex-[1_1_100%] text-[.9rem] mb-1">
    <summary class="cursor-pointer text-muted pointer-coarse:min-h-11">{scopeLabel(ids)}</summary>
    <div class="grid gap-[.35rem] pt-2 pr-0 pb-1 pl-1">
      <label class="flex items-center gap-2 font-medium pointer-coarse:min-h-11"><input class="w-auto m-0 pointer-coarse:size-5" type="radio" name={group} checked={ids === null} onchange={() => set(null)} /> Anyone can ask</label>
      <label class="flex items-center gap-2 font-medium pointer-coarse:min-h-11"><input class="w-auto m-0 pointer-coarse:size-5" type="radio" name={group} checked={ids !== null} onchange={() => set(ids ?? [])} /> Only these people</label>
      {#if ids !== null}
        <ul class="list-none mt-0 mr-0 mb-0 ml-[1.6rem] p-0 grid gap-1">
          {#each people as p (p.id)}
            <li class="row-item"><label class="flex items-center gap-2 font-medium pointer-coarse:min-h-11"><input class="w-auto m-0 pointer-coarse:size-5" type="checkbox" checked={ids.includes(p.id)} onchange={() => set(togglePerson(ids, p.id))} /> {p.name}</label></li>
          {:else}
            <li class="note row-item">Add your household first.</li>
          {/each}
        </ul>
      {/if}
    </div>
  </details>
{/snippet}

<section class="card" id="rewards">
  <h2 class="mt-0">Rewards</h2>
  <p class="note">What points can be spent on. Anyone can ask for a reward they can afford, unless you limit it to certain people, in which case only they see it; nothing is deducted until you approve it, in the waiting list at the top of this page (or on the Chores page).</p>
  <ul class="list-none m-0 p-0">
    {#each choreState.rewards as r (r.id)}
      <li class="edit-card" class:opacity-60={r.hidden}>
        <input class="m-0" value={r.name} data-v={r.name} maxlength="60" aria-label="Reward" onchange={(e) => keep(e, !!text(e) && send({ action: 'reward_save', id: r.id, name: text(e), cost: r.cost }))} />
        <div class="grid grid-cols-2 gap-2">
          <Stepper caption="Cost (points)" value={r.cost} min={1} max={100000} label={`Cost of ${r.name}`} onchange={(n) => send({ action: 'reward_save', id: r.id, name: r.name, cost: n })} />
          <div title="Minutes of screen time it adds to the bank (0 for none)"><Stepper caption="Screen time (min)" value={r.minutes} min={0} max={1440} step={5} label={`Screen time minutes for ${r.name}`} onchange={(n) => send({ action: 'reward_save', id: r.id, name: r.name, cost: r.cost, minutes: n })} /></div>
        </div>
        {@render scope(`scope-${r.id}`, r.people, (ids) => send({ action: 'reward_save', id: r.id, name: r.name, cost: r.cost, people: ids }))}
        <div class="flex flex-wrap items-center justify-end gap-2">
          <button type="button" class="ghost small" disabled={busy} aria-pressed={r.hidden} onclick={() => send({ action: 'reward_save', id: r.id, name: r.name, cost: r.cost, hidden: !r.hidden })}>{r.hidden ? 'Hidden: show' : 'Hide'}</button>
          <ConfirmButton ariaLabel={`Remove ${r.name}`} disabled={busy} onconfirm={() => send({ action: 'reward_remove', id: r.id })} />
        </div>
      </li>
    {/each}
  </ul>
  <form class="grid grid-cols-2 gap-2 mt-3 p-3 rounded-[var(--radius-sm)] border border-dashed border-line" onsubmit={addReward}>
    <input class="m-0 col-span-2" bind:value={rewardName} maxlength="60" required placeholder="Movie night pick" aria-label="New reward" autocomplete="off" />
    <Stepper caption="Cost (points)" bind:value={rewardCost} min={1} max={100000} label="Cost in points" />
    <Stepper caption="Screen time (min)" bind:value={rewardMinutes} min={0} max={1440} step={5} label="Screen time minutes it adds (0 for none)" />
    <div class="col-span-2">{@render scope('scope-new', rewardScope, (ids) => (rewardScope = ids))}</div>
    <button type="submit" class="small col-span-2 [&&&]:w-full" disabled={busy || !rewardName.trim()}>Add reward</button>
  </form>
</section>

<section class="card" id="points">
  <h2 class="mt-0">Points</h2>
  {#if people.length === 0}
    <p class="note">Add your household under <code>people</code> in <code>dashboard.config.ts</code> to hand out points.</p>
  {:else}
    <ul class="list-none flex flex-wrap gap-[.6rem] mt-0 mx-0 mb-4 p-0">
      {#each people as p (p.id)}<li class="flex gap-[.6rem] items-baseline py-[.35rem] px-[.8rem] rounded-full border-[1.5px] border-solid border-[var(--c)]" style:--c={p.color}><span>{p.name}</span> <strong class="text-[color:var(--c)] tabular-nums">★ {choreState.balances[p.id] ?? 0}</strong>{#if choreState.minutes[p.id]}<span class="note">⏱ {choreState.minutes[p.id]} min</span>{/if}</li>{/each}
    </ul>
    <label class="grid gap-1 m-0 mb-3 text-[.75rem] text-muted">Person
      <select class="m-0" bind:value={adjPerson} aria-label="Person">{#each people as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</select></label>
    <form class="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-2 mb-3" onsubmit={adjust}>
      <Stepper caption="Points" class="w-[9.75rem]" bind:value={adjDelta} min={-1000} max={1000} label="Points to add (negative to take away)" />
      <label class="cap-field">Reason <input class="m-0" bind:value={adjNote} maxlength="60" placeholder="Optional" aria-label="Reason" autocomplete="off" /></label>
      <button type="submit" class="small col-span-2 [&&&]:w-full" disabled={busy || !adjPerson || !adjDelta}>Add points</button>
    </form>
    <form class="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-2" onsubmit={adjustTime}>
      <Stepper caption="Minutes" class="w-[9.75rem]" bind:value={timeDelta} min={-1440} max={1440} step={5} label="Minutes of screen time to add (negative to take away)" />
      <span class="note pb-3">of screen time for the person above</span>
      <button type="submit" class="small col-span-2 [&&&]:w-full" disabled={busy || !adjPerson || !timeDelta}>Add minutes</button>
    </form>
  {/if}
  {#if choreState.recent.length > 0}
    <h4 class="mt-[1.1rem] mb-[.4rem] mx-0 text-[.95rem]">Recent</h4>
    <ul class="list-none m-0 p-0 text-[.92rem]">
      {#each choreState.recent as e (e.id)}
        <li class="ledger-row"><span class="text-muted tabular-nums">{formatWhen(e.at)}</span> <span>{nameOf(e.person)}</span> <strong class={e.delta < 0 ? 'text-danger' : ''}>{e.delta > 0 ? '+' : ''}{e.delta}</strong> <span class="note">{LEDGER_LABEL[e.kind]}{e.note ? `: ${e.note}` : ''}</span></li>
      {/each}
    </ul>
  {/if}
</section>

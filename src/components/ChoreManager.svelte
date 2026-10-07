<script lang="ts">
  import RoutineEditor from './RoutineEditor.svelte';
  import { formatWhen, LEDGER_LABEL, periodRecord, type ChoreItem, type ChoreState } from '../lib/choreTypes';
  import { num, runChores, text } from '../lib/choreClient';
  import type { Person } from '../lib/people';

  let { initial, people, demo = false }: { initial: ChoreState; people: Person[]; demo?: boolean } = $props();

  // svelte-ignore state_referenced_locally
  let choreState = $state<ChoreState>(initial);
  let error = $state('');
  let busy = $state(false);

  const nameOf = (id: string | null) => (id ? people.find((p) => p.id === id)?.name ?? 'Unknown' : 'Anyone');

  async function send(payload: Record<string, unknown>): Promise<boolean> {
    if (busy) return false;
    busy = true; error = '';
    const r = await runChores(choreState, payload, demo);
    busy = false;
    if (r.ok) { choreState = r.state; return true; }
    error = r.error;
    return false;
  }

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

{#if error}<p class="notice error" role="alert">{error}</p>{/if}

{#if choreState.pending.length > 0}
  <section class="card pending" aria-labelledby="pending-h">
    <h2 id="pending-h">Waiting for approval <span class="badge">{choreState.pending.length}</span></h2>
    <ul class="asks">
      {#each choreState.pending as r (r.id)}
        {@const left = (choreState.balances[r.person] ?? 0) - r.cost}
        <li>
          <span class="what"><strong>{nameOf(r.person)}</strong> asked for <strong>{r.rewardName}</strong> <span class="muted">({r.cost} pts{r.minutes > 0 ? `, ${r.minutes} min` : ''}, {left} left after · {formatWhen(r.requestedAt)})</span></span>
          <button type="button" class="small" disabled={busy || left < 0} onclick={() => send({ action: 'decide', id: r.id, approve: true })}>Approve</button>
          <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'decide', id: r.id, approve: false })}>Deny</button>
          {#if left < 0}<span class="muted short">Not enough points now</span>{/if}
        </li>
      {/each}
    </ul>
    {#if choreState.pending.length > 1}
      <p><button type="button" class="small" disabled={busy} onclick={() => send({ action: 'decide_all' })}>Approve all they can afford</button></p>
    {/if}
  </section>
{/if}

<section class="card">
  <h2>Household goals</h2>
  <p class="muted">A target everyone works toward together. Every point anyone earns counts, and spending points on personal rewards does not lower it. When a goal is reached, treat the household, then mark it as enjoyed.</p>
  <ul class="rows">
    {#each choreState.goals as g (g.id)}
      <li>
        <input class="grow" value={g.name} maxlength="60" aria-label="Goal" disabled={g.claimed} onchange={(e) => text(e) && send({ action: 'goal_save', id: g.id, name: text(e), target: g.target })} />
        <input class="pts" type="number" min="1" max="1000000" value={g.target} aria-label={`Target for ${g.name}`} disabled={g.claimed} onchange={(e) => send({ action: 'goal_save', id: g.id, name: g.name, target: Math.max(1, num(e)) })} />
        <span class="muted">{g.claimed ? 'Enjoyed' : `${g.progress} so far`}</span>
        {#if !g.claimed && g.progress >= g.target}<button type="button" class="small" disabled={busy} onclick={() => send({ action: 'goal_claim', id: g.id })}>Mark as enjoyed</button>{/if}
        <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'goal_remove', id: g.id })} aria-label={`Remove ${g.name}`}>Remove</button>
      </li>
    {/each}
  </ul>
  <form class="rows add" onsubmit={addGoal}>
    <input class="grow" bind:value={goalName} maxlength="60" required placeholder="Family pizza night" aria-label="New goal" autocomplete="off" />
    <input class="pts" type="number" min="1" max="1000000" bind:value={goalTarget} aria-label="Target in points" />
    <button type="submit" class="small" disabled={busy || !goalName.trim()}>Add goal</button>
  </form>
</section>

<section class="card">
  <h2>Chores</h2>
  <p class="muted">One routine for each person, split by time of day. Each chore has its own days, or can be a one-off. Chores are ticked off on the Chores page and start fresh every day they are scheduled. The all-done bonus is paid when every chore due in that time of day is ticked.</p>

  {#each owners as o (o.id ?? 'anyone')}
    {@const items = itemsOf(o.id)}
    <details class="list" open={items.length === 0 && o.id !== null}>
      <summary>
        <strong style:color={o.color}>{o.name}</strong>
        <span class="muted">{items.length} {items.length === 1 ? 'chore' : 'chores'}{o.id === null ? ' · no points' : ''}</span>
      </summary>

      <RoutineEditor person={o.id} name={o.name} {items} bonuses={bonusesOf(o.id)} day={choreState.day} {busy} {send} />
    </details>
  {/each}
</section>

{#snippet scope(group: string, ids: string[] | null, set: (ids: string[] | null) => void)}
  <details class="scope">
    <summary>{scopeLabel(ids)}</summary>
    <div class="scope-body">
      <label class="check"><input type="radio" name={group} checked={ids === null} onchange={() => set(null)} /> Anyone can ask</label>
      <label class="check"><input type="radio" name={group} checked={ids !== null} onchange={() => set(ids ?? [])} /> Only these people</label>
      {#if ids !== null}
        <ul class="picks">
          {#each people as p (p.id)}
            <li><label class="check"><input type="checkbox" checked={ids.includes(p.id)} onchange={() => set(togglePerson(ids, p.id))} /> {p.name}</label></li>
          {:else}
            <li class="muted">Add your household first.</li>
          {/each}
        </ul>
      {/if}
    </div>
  </details>
{/snippet}

<section class="card">
  <h2>Rewards</h2>
  <p class="muted">What points can be spent on. Anyone can ask for a reward they can afford, unless you limit it to certain people, in which case only they see it; nothing is deducted until you approve it, in the waiting list at the top of this page (or on the Chores page).</p>
  <ul class="rows">
    {#each choreState.rewards as r (r.id)}
      <li>
        <input class="grow" value={r.name} maxlength="60" aria-label="Reward" onchange={(e) => text(e) && send({ action: 'reward_save', id: r.id, name: text(e), cost: r.cost })} />
        <input class="pts" type="number" min="1" max="100000" value={r.cost} aria-label={`Cost of ${r.name}`} onchange={(e) => send({ action: 'reward_save', id: r.id, name: r.name, cost: Math.max(1, num(e)) })} />
        <input class="pts" type="number" min="0" max="1440" value={r.minutes} aria-label={`Screen time minutes for ${r.name}`} title="Minutes of screen time it adds to the bank (0 for none)" onchange={(e) => send({ action: 'reward_save', id: r.id, name: r.name, cost: r.cost, minutes: Math.min(1440, Math.max(0, num(e))) })} />
        <span class="muted">min</span>
        <button type="button" class="ghost small" disabled={busy} aria-pressed={r.hidden} onclick={() => send({ action: 'reward_save', id: r.id, name: r.name, cost: r.cost, hidden: !r.hidden })}>{r.hidden ? 'Hidden: show' : 'Hide'}</button>
        <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'reward_remove', id: r.id })} aria-label={`Remove ${r.name}`}>Remove</button>
        {@render scope(`scope-${r.id}`, r.people, (ids) => send({ action: 'reward_save', id: r.id, name: r.name, cost: r.cost, people: ids }))}
      </li>
    {/each}
  </ul>
  <form class="rows add" onsubmit={addReward}>
    <input class="grow" bind:value={rewardName} maxlength="60" required placeholder="Movie night pick" aria-label="New reward" autocomplete="off" />
    <input class="pts" type="number" min="1" max="100000" bind:value={rewardCost} aria-label="Cost in points" />
    <input class="pts" type="number" min="0" max="1440" bind:value={rewardMinutes} aria-label="Screen time minutes it adds (0 for none)" /> <span class="muted">min of screen time</span>
    <button type="submit" class="small" disabled={busy || !rewardName.trim()}>Add reward</button>
    {@render scope('scope-new', rewardScope, (ids) => (rewardScope = ids))}
  </form>
</section>

<section class="card">
  <h2>Points</h2>
  {#if people.length === 0}
    <p class="muted">Add your household under <code>people</code> in <code>dashboard.config.ts</code> to hand out points.</p>
  {:else}
    <ul class="balances">
      {#each people as p (p.id)}<li style:--c={p.color}><span>{p.name}</span> <strong>★ {choreState.balances[p.id] ?? 0}</strong>{#if choreState.minutes[p.id]}<span class="muted">⏱ {choreState.minutes[p.id]} min</span>{/if}</li>{/each}
    </ul>
    <form class="rows add" onsubmit={adjust}>
      <select bind:value={adjPerson} aria-label="Person">{#each people as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</select>
      <input class="pts" type="number" min="-1000" max="1000" bind:value={adjDelta} aria-label="Points to add (negative to take away)" />
      <input class="grow" bind:value={adjNote} maxlength="60" placeholder="Why (optional)" aria-label="Reason" autocomplete="off" />
      <button type="submit" class="small" disabled={busy || !adjPerson || !adjDelta}>Add points</button>
    </form>
    <form class="rows add" onsubmit={adjustTime}>
      <span class="muted">Screen time for the person above:</span>
      <input class="pts" type="number" min="-1440" max="1440" bind:value={timeDelta} aria-label="Minutes to add (negative to take away)" />
      <button type="submit" class="small" disabled={busy || !adjPerson || !timeDelta}>Add minutes</button>
    </form>
  {/if}
  {#if choreState.recent.length > 0}
    <h4>Recent</h4>
    <ul class="recent">
      {#each choreState.recent as e (e.id)}
        <li><span class="when">{formatWhen(e.at)}</span> <span>{nameOf(e.person)}</span> <strong class:neg={e.delta < 0}>{e.delta > 0 ? '+' : ''}{e.delta}</strong> <span class="muted">{LEDGER_LABEL[e.kind]}{e.note ? `: ${e.note}` : ''}</span></li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .card { margin-bottom: 1.25rem; }
  h2 { margin-top: 0; }
  h4 { margin: 1.1rem 0 .4rem; font-size: .95rem; }
  .list { border-top: 1px solid var(--border); padding: .75rem 0; }
  .list summary { cursor: pointer; display: flex; flex-wrap: wrap; gap: .1rem .75rem; align-items: baseline; }
  .scope { flex: 1 1 100%; font-size: .9rem; margin-bottom: .25rem; }
  .scope summary { cursor: pointer; color: var(--muted); }
  .scope-body { display: grid; gap: .35rem; padding: .5rem 0 .25rem .25rem; }
  .scope .check { display: flex; align-items: center; gap: .5rem; font-weight: 500; }
  .scope input[type="radio"], .scope input[type="checkbox"] { width: auto; margin: 0; }
  .picks { list-style: none; margin: 0 0 0 1.6rem; padding: 0; display: grid; gap: .25rem; }
  .picks li { display: block; margin: 0; }
  .asks { list-style: none; margin: 0; padding: 0; }
  .asks li { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem .6rem; padding: .5rem 0; border-top: 1px solid var(--border); }
  .asks .what { flex: 1 1 14rem; }
  .badge { display: inline-block; min-width: 1.4rem; padding: 0 .45rem; border-radius: 999px; background: var(--accent); color: #fff; font-size: .85rem; text-align: center; vertical-align: middle; }
  .rows { list-style: none; margin: 0; padding: 0; }
  .rows li, form.rows { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin-bottom: .5rem; }
  .rows input, .rows select { margin: 0; }
  .rows .grow { flex: 1 1 12rem; }
  .rows .pts { flex: 0 0 5.5rem; width: 5.5rem; }
  .small { width: auto; margin: 0; padding: .3rem .8rem; font-size: .85rem; }
  @media (pointer: coarse) { .small { min-height: 2.75rem; } .list summary, .scope summary { min-height: 2.75rem; } .scope .check { min-height: 2.75rem; } .scope input[type="radio"], .scope input[type="checkbox"] { width: 1.25rem; height: 1.25rem; } }
  .balances { list-style: none; display: flex; flex-wrap: wrap; gap: .6rem; margin: 0 0 1rem; padding: 0; }
  .balances li { display: flex; gap: .6rem; align-items: baseline; padding: .35rem .8rem; border-radius: 999px; border: 1.5px solid var(--c); }
  .balances strong { color: var(--c); font-variant-numeric: tabular-nums; }
  .recent { list-style: none; margin: 0; padding: 0; font-size: .92rem; }
  .recent li { display: flex; flex-wrap: wrap; gap: .1rem .6rem; padding: .3rem 0; border-top: 1px solid var(--border); }
  .when { color: var(--muted); font-variant-numeric: tabular-nums; }
  .neg { color: var(--danger, #c92a2a); }
  .muted { font-size: .9rem; font-weight: 400; }
</style>

<script lang="ts">
  import ChoreListForm, { type ListFields } from './ChoreListForm.svelte';
  import { describeSchedule, hasDay, listPoints, PERIOD_LABEL, toggleDay, WEEKDAY_SHORT, type ChoreItem, type ChoreList, type ChoreState } from '../lib/choreTypes';
  import { runChores } from '../lib/choreClient';
  import type { Person } from '../lib/people';

  let { initial, people, demo = false }: { initial: ChoreState; people: Person[]; demo?: boolean } = $props();

  let state = $state<ChoreState>(initial);
  let error = $state('');
  let busy = $state(false);

  const nameOf = (id: string | null) => (id ? people.find((p) => p.id === id)?.name ?? 'Unknown' : 'Anyone');

  async function send(payload: Record<string, unknown>): Promise<boolean> {
    if (busy) return false;
    busy = true; error = '';
    const r = await runChores(state, payload, demo);
    busy = false;
    if (r.ok) { state = r.state; return true; }
    error = r.error;
    return false;
  }

  /** Flips one weekday on a chore's own schedule. It can only run on days its list runs, and picking them all means "follow the list". */
  const flipDay = (c: ChoreItem, l: ChoreList, weekday: number) => {
    const next = toggleDay(c.days ?? l.days, weekday) & l.days;
    return send({ action: 'item_update', id: c.id, title: c.title, points: c.points, days: next === 0 || next === l.days ? null : next });
  };

  const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value) || 0;
  const text = (e: Event) => (e.currentTarget as HTMLInputElement).value.trim();

  // --- New chore in an existing list, new reward, point adjustment ---
  let newTitle = $state<Record<string, string>>({});
  let newPoints = $state<Record<string, number>>({});
  async function addItem(listId: string, e: SubmitEvent) {
    e.preventDefault();
    const title = (newTitle[listId] ?? '').trim();
    if (title && (await send({ action: 'item_add', listId, title, points: newPoints[listId] ?? 1 }))) newTitle[listId] = '';
  }

  /** Who a reward's scope lets ask: everyone, or the people whose lists were picked. */
  function scopeLabel(ids: string[] | null): string {
    if (ids === null) return 'Anyone can ask';
    const names = [...new Set(state.lists.filter((l) => ids.includes(l.id) && l.person).map((l) => nameOf(l.person)))];
    return names.length > 0 ? `Only ${names.join(', ')}` : 'Nobody can ask yet (pick a list that belongs to someone)';
  }
  const toggleList = (ids: string[] | null, id: string): string[] => ((ids ?? []).includes(id) ? (ids ?? []).filter((x) => x !== id) : [...(ids ?? []), id]);

  let rewardName = $state('');
  let rewardScope = $state<string[] | null>(null);
  let rewardCost = $state(10);
  async function addReward(e: SubmitEvent) {
    e.preventDefault();
    if (await send({ action: 'reward_save', name: rewardName.trim(), cost: rewardCost, listIds: rewardScope })) { rewardName = ''; rewardScope = null; }
  }

  let adjPerson = $state('');
  let adjDelta = $state(5);
  let adjNote = $state('');
  async function adjust(e: SubmitEvent) {
    e.preventDefault();
    if (adjPerson && (await send({ action: 'adjust', person: adjPerson, delta: adjDelta, note: adjNote.trim() }))) adjNote = '';
  }
  $effect(() => { if (!adjPerson && people[0]) adjPerson = people[0].id; });

  const when = (ms: number) => new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const KIND: Record<string, string> = { chore: 'Chore', bonus: 'Bonus', redeem: 'Reward', adjust: 'Adjustment' };
</script>

{#if error}<p class="notice error" role="alert">{error}</p>{/if}

{#if state.pending.length > 0}
  <section class="card pending" aria-labelledby="pending-h">
    <h2 id="pending-h">Waiting for approval <span class="badge">{state.pending.length}</span></h2>
    <ul class="asks">
      {#each state.pending as r (r.id)}
        {@const left = (state.balances[r.person] ?? 0) - r.cost}
        <li>
          <span class="what"><strong>{nameOf(r.person)}</strong> asked for <strong>{r.rewardName}</strong> <span class="muted">({r.cost} pts, {left} left after · {when(r.requestedAt)})</span></span>
          <button type="button" class="small" disabled={busy || left < 0} onclick={() => send({ action: 'decide', id: r.id, approve: true })}>Approve</button>
          <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'decide', id: r.id, approve: false })}>Deny</button>
          {#if left < 0}<span class="muted short">Not enough points now</span>{/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<section class="card">
  <h2>Chore lists</h2>
  <p class="muted">A list is a routine for one person: a morning routine, after-school jobs, Saturday cleaning. Its chores are ticked off on the Chores page and start fresh each day the list is scheduled.</p>

  {#each state.lists as l (l.id)}
    <details class="list">
      <summary>
        <strong>{l.name}</strong>
        <span class="muted">{[nameOf(l.person), l.period === 'any' ? '' : PERIOD_LABEL[l.period], describeSchedule(l), `${l.items.length} ${l.items.length === 1 ? 'chore' : 'chores'}`, l.person ? `up to ${listPoints(l)} pts` : ''].filter(Boolean).join(' · ')}</span>
      </summary>

      <ChoreListForm list={l} {people} day={state.day} {busy} label="Save changes" onsave={(f: ListFields) => send({ action: 'list_save', id: l.id, ...f })} />

      <h4>Chores</h4>
      <ul class="rows">
        {#each l.items as c (c.id)}
          <li>
            <input class="grow" value={c.title} maxlength="80" aria-label="Chore" onchange={(e) => text(e) && send({ action: 'item_update', id: c.id, title: text(e), points: c.points })} />
            <input class="pts" type="number" min="0" max="100" value={c.points} aria-label={`Points for ${c.title}`} onchange={(e) => send({ action: 'item_update', id: c.id, title: c.title, points: num(e) })} />
            <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'item_remove', id: c.id })} aria-label={`Remove ${c.title}`}>Remove</button>
            {#if l.onceDate === null}
              <div class="itemdays" role="group" aria-label={`Days for ${c.title}`}>
                <span class="when">Days:</span>
                {#each WEEKDAY_SHORT as d, i (i)}
                  {@const on = hasDay(c.days ?? l.days, i)}
                  <button type="button" class="chip" aria-pressed={on} disabled={busy || !hasDay(l.days, i) || (on && (c.days ?? l.days) === 1 << i)} title={hasDay(l.days, i) ? '' : 'The list does not run on this day'} onclick={() => flipDay(c, l, i)}>{d}</button>
                {/each}
                <span class="muted">{c.days === null ? 'every day the list runs' : 'only these days'}</span>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
      <form class="rows add" onsubmit={(e) => addItem(l.id, e)}>
        <input class="grow" bind:value={newTitle[l.id]} maxlength="80" placeholder="Add a chore" aria-label="New chore" autocomplete="off" />
        <input class="pts" type="number" min="0" max="100" bind:value={newPoints[l.id]} aria-label="Points" placeholder="1" />
        <button type="submit" class="small" disabled={busy || !(newTitle[l.id] ?? '').trim()}>Add</button>
      </form>

      <p><button type="button" class="ghost danger small" disabled={busy} onclick={() => send({ action: 'list_remove', id: l.id })}>Delete this list</button></p>
    </details>
  {/each}

  <details class="list new" open={state.lists.length === 0}>
    <summary><strong>New chore list</strong></summary>
    <ChoreListForm {people} day={state.day} {busy} label="Create list" onsave={(f: ListFields) => send({ action: 'list_save', ...f })} />
  </details>
</section>

{#snippet scope(group: string, ids: string[] | null, set: (ids: string[] | null) => void)}
  <details class="scope">
    <summary>{scopeLabel(ids)}</summary>
    <div class="scope-body">
      <label class="check"><input type="radio" name={group} checked={ids === null} onchange={() => set(null)} /> Anyone can ask</label>
      <label class="check"><input type="radio" name={group} checked={ids !== null} onchange={() => set(ids ?? [])} /> Only the people on these lists</label>
      {#if ids !== null}
        <ul class="picks">
          {#each state.lists as l (l.id)}
            <li><label class="check"><input type="checkbox" checked={ids.includes(l.id)} onchange={() => set(toggleList(ids, l.id))} /> {l.name} <span class="muted">({nameOf(l.person)})</span></label></li>
          {:else}
            <li class="muted">Create a chore list first.</li>
          {/each}
        </ul>
      {/if}
    </div>
  </details>
{/snippet}

<section class="card">
  <h2>Rewards</h2>
  <p class="muted">What points can be spent on. Anyone can ask for a reward they can afford, unless you limit it to certain chore lists, in which case only the people those lists belong to see it; nothing is deducted until you approve it, in the waiting list at the top of this page (or on the Chores page).</p>
  <ul class="rows">
    {#each state.rewards as r (r.id)}
      <li>
        <input class="grow" value={r.name} maxlength="60" aria-label="Reward" onchange={(e) => text(e) && send({ action: 'reward_save', id: r.id, name: text(e), cost: r.cost })} />
        <input class="pts" type="number" min="1" max="100000" value={r.cost} aria-label={`Cost of ${r.name}`} onchange={(e) => send({ action: 'reward_save', id: r.id, name: r.name, cost: Math.max(1, num(e)) })} />
        <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'reward_remove', id: r.id })} aria-label={`Remove ${r.name}`}>Remove</button>
        {@render scope(`scope-${r.id}`, r.listIds, (ids) => send({ action: 'reward_save', id: r.id, name: r.name, cost: r.cost, listIds: ids }))}
      </li>
    {/each}
  </ul>
  <form class="rows add" onsubmit={addReward}>
    <input class="grow" bind:value={rewardName} maxlength="60" required placeholder="Movie night pick" aria-label="New reward" autocomplete="off" />
    <input class="pts" type="number" min="1" max="100000" bind:value={rewardCost} aria-label="Cost in points" />
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
      {#each people as p (p.id)}<li style:--c={p.color}><span>{p.name}</span> <strong>★ {state.balances[p.id] ?? 0}</strong></li>{/each}
    </ul>
    <form class="rows add" onsubmit={adjust}>
      <select bind:value={adjPerson} aria-label="Person">{#each people as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</select>
      <input class="pts" type="number" min="-1000" max="1000" bind:value={adjDelta} aria-label="Points to add (negative to take away)" />
      <input class="grow" bind:value={adjNote} maxlength="60" placeholder="Why (optional)" aria-label="Reason" autocomplete="off" />
      <button type="submit" class="small" disabled={busy || !adjPerson || !adjDelta}>Add points</button>
    </form>
  {/if}
  {#if state.recent.length > 0}
    <h4>Recent</h4>
    <ul class="recent">
      {#each state.recent as e (e.id)}
        <li><span class="when">{when(e.at)}</span> <span>{nameOf(e.person)}</span> <strong class:neg={e.delta < 0}>{e.delta > 0 ? '+' : ''}{e.delta}</strong> <span class="muted">{KIND[e.kind]}{e.note ? `: ${e.note}` : ''}</span></li>
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
  .list form.listform, .list > :global(form) { margin-top: .9rem; }
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
  .itemdays { flex: 1 1 100%; display: flex; flex-wrap: wrap; align-items: center; gap: .35rem; margin: -.1rem 0 .6rem; font-size: .85rem; }
  .itemdays .when { font-weight: 600; margin-right: .15rem; }
  .itemdays .chip { width: auto; margin: 0; padding: .3rem .65rem; border-radius: 999px; background: transparent; color: inherit; border: 1.5px solid var(--border); box-shadow: none; font-size: .85rem; }
  .itemdays .chip[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: #fff; }
  .itemdays .chip:disabled:not([aria-pressed="true"]) { opacity: .35; text-decoration: line-through; }
  .rows li, form.rows { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin-bottom: .5rem; }
  .rows input, .rows select { margin: 0; }
  .rows .grow { flex: 1 1 12rem; }
  .rows .pts { flex: 0 0 5.5rem; width: 5.5rem; }
  .small { width: auto; margin: 0; padding: .3rem .8rem; font-size: .85rem; }
  @media (pointer: coarse) { .small, .itemdays .chip { min-height: 2.75rem; } .list summary, .scope summary { min-height: 2.75rem; } .scope .check { min-height: 2.75rem; } .scope input[type="radio"], .scope input[type="checkbox"] { width: 1.25rem; height: 1.25rem; } }
  .danger { color: var(--danger, #c92a2a); }
  .balances { list-style: none; display: flex; flex-wrap: wrap; gap: .6rem; margin: 0 0 1rem; padding: 0; }
  .balances li { display: flex; gap: .6rem; align-items: baseline; padding: .35rem .8rem; border-radius: 999px; border: 1.5px solid var(--c); }
  .balances strong { color: var(--c); font-variant-numeric: tabular-nums; }
  .recent { list-style: none; margin: 0; padding: 0; font-size: .92rem; }
  .recent li { display: flex; flex-wrap: wrap; gap: .1rem .6rem; padding: .3rem 0; border-top: 1px solid var(--border); }
  .when { color: var(--muted); font-variant-numeric: tabular-nums; }
  .neg { color: var(--danger, #c92a2a); }
  .muted { font-size: .9rem; font-weight: 400; }
</style>

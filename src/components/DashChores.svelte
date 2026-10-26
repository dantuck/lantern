<script lang="ts">
  import FeatherIcon from './FeatherIcon.svelte';
  import { dayClock } from '../lib/dayClock.svelte';
  import { holdRefresh } from '../lib/holdRefresh.svelte';
  import { runChores } from '../lib/choreClient';
  import { blockFor, tally, timeAvailable, todaysRoutines, type ChoreItem, type ChoreState } from '../lib/choreTypes';
  import type { Person } from '../lib/people';

  let { initial, people, href = '/chores', demo = false }: { initial: ChoreState; people: Person[]; href?: string; demo?: boolean } = $props();

  // Rendered once from the server, then replaced by whatever the API answers after each tick.
  // svelte-ignore state_referenced_locally
  let state = $state<ChoreState>(initial);
  const day = dayClock(() => state);
  const blockOf = (item: ChoreItem) => blockFor(state, item.period, day.dayMs, demo);
  let busy = $state(false);
  let error = $state('');
  // The last chore ticked, offered back for a few seconds. One at a time: a newer tick replaces it.
  let undo = $state<{ n: number; id: string; title: string; name: string } | null>(null);
  let n = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const UNDO_MS = 6000; // matches the .toast fade-out delay

  // A page refresh must not land mid-save or while the undo is still on offer.
  holdRefresh(() => busy || undo !== null);

  const SHOWN = 3; // in each person's list, one-offs go first (they will not be back tomorrow) so the cut-off never hides them
  const groups = $derived.by(() => {
    const today = todaysRoutines(state.routines);
    const mine = (id: string | null) => today.filter((r) => (id === null ? !r.person || !people.some((p) => p.id === r.person) : r.person === id)).flatMap((r) => r.items);
    return [
      ...people.map((p) => ({ id: p.id as string | null, name: p.name, color: p.color, items: mine(p.id) })),
      { id: null as string | null, name: 'Anyone', color: 'var(--accent)', items: mine(null) },
    ].filter((g) => g.items.length > 0);
  });
  const all = $derived(groups.flatMap((g) => g.items));
  const progress = $derived(tally(all));
  const total = $derived(progress.total);
  const doneAll = $derived(progress.done);

  async function tick(item: ChoreItem, name: string, done: boolean) {
    if (busy) return;
    busy = true; error = '';
    const r = await runChores(state, { action: 'check', id: item.id, done }, demo);
    busy = false;
    if (!r.ok) { error = r.error; return; }
    state = r.state;
    clearTimeout(timer);
    if (done) {
      undo = { n: ++n, id: item.id, title: item.title, name };
      timer = setTimeout(() => (undo = null), UNDO_MS + 500);
    } else undo = null;
  }
  const undoLast = () => {
    const u = undo;
    if (!u) return;
    const item = all.find((i) => i.id === u.id);
    if (item) void tick(item, u.name, false);
    else undo = null;
  };
</script>

{#if total > 0}<p class="m-0 mb-3 text-muted text-[.9rem]">{doneAll} of {total} done today</p>{/if}
{#if error}<p class="notice error" role="alert">{error}</p>{/if}
{#if groups.length === 0}
  <p class="text-muted">No chores today. <a {href}>Open chores</a>.</p>
{:else}
  <ul class="mini">
    {#each groups as g (g.id ?? 'anyone')}
      {@const prog = tally(g.items)}
      {@const done = prog.done}
      {@const countedN = prog.total}
      {@const todo = g.items.filter((i) => !i.done).sort((a, b) => +(b.onceDate !== null) - +(a.onceDate !== null))}
      {@const mins = g.id ? timeAvailable(state, g.id) : 0}
      {@const pts = g.id ? state.balances[g.id] : undefined}
      <li style="--c:{g.color}">
        {#if g.id}<a class="mini-name" href="{href}/{encodeURIComponent(g.id)}">{g.name}</a>{:else}<span class="mini-name">{g.name}</span>{/if}
        <span class="mini-bar" role="img" aria-label="{g.name}: {done} of {countedN} done"><span style="width:{countedN ? (done / countedN) * 100 : 0}%"></span></span>
        <span class="mini-n">{done}/{countedN}</span>
        <div class="mini-sub">
          {#if todo.length === 0}
            <span class="text-accent font-semibold">All done <FeatherIcon name="check" /></span>
          {:else}
            <span class="mini-todo">
              {#each todo.slice(0, SHOWN) as item (item.id)}
                <button type="button" class="mini-chip" disabled={busy || blockOf(item) !== ''} title={blockOf(item)} onclick={() => tick(item, g.name, true)} aria-label="Mark {item.title} done for {g.name}"><i aria-hidden="true"></i>{item.title}{#if item.onceDate !== null}<span class="cal-pill ml-auto flex-none text-muted">Today only</span>{/if}</button>
              {/each}
              {#if todo.length > SHOWN}<a class="mini-more" href={g.id ? `${href}/${encodeURIComponent(g.id)}` : href}>+{todo.length - SHOWN} more</a>{/if}
            </span>
          {/if}
          {#if pts !== undefined || mins > 0}
            <span class="mini-stats">
              {#if pts !== undefined}<span title="Points"><FeatherIcon name="star" /> {pts}</span>{/if}
              {#if mins > 0}<span title="Screen time available"><FeatherIcon name="clock" /> {mins} min</span>{/if}
            </span>
          {/if}
        </div>
      </li>
    {/each}
  </ul>
{/if}

{#if undo}
  {#key undo.n}
    <div class="notice toast flex items-center justify-between gap-3" role="status">
      <span class="min-w-0 [overflow-wrap:anywhere]">Ticked “{undo.title}” for {undo.name}.</span>
      <button type="button" class="ghost [&&]:w-auto [&&]:m-0 py-[.4rem] px-4 rounded-full text-[.9rem] flex-none" onclick={undoLast}>Undo</button>
    </div>
  {/key}
{/if}

<script lang="ts">
  import { isDue, type Chore, type ChoreState, type Repeat } from '../lib/chores';
  import type { Person } from '../lib/people';

  let { initial, people, locale = 'en-US', demo = false }: { initial: ChoreState; people: Person[]; locale?: string; demo?: boolean } = $props();

  // Rendered once from the server, then replaced by whatever the API answers after each change.
  let state = $state<ChoreState>(initial);
  let error = $state('');
  let busy = $state(false);

  const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(Date.UTC(2023, 0, 1 + i)));
  const byId = $derived(new Map(people.map((p) => [p.id, p])));
  const initialOf = (p: Person) => [...p.name][0]!.toUpperCase();

  /** One column per person, plus "Anyone" for chores nobody owns (and for households with no people set up). */
  const columns = $derived.by(() => {
    const cols: { id: string | null; name: string; person?: Person; chores: ChoreState['today'] }[] = people.map((p) => ({ id: p.id, name: p.name, person: p, chores: state.today.filter((c) => c.person === p.id) }));
    const anyone = state.today.filter((c) => !c.person || !byId.has(c.person));
    if (anyone.length > 0 || people.length === 0) cols.push({ id: null, name: 'Anyone', chores: anyone });
    return cols;
  });
  const doneCount = (cs: ChoreState['today']) => cs.filter((c) => c.done).length;

  // --- Talking to the server (or, in the demo, pretending to) ---
  type Payload =
    | { action: 'add'; title: string; person: string | null; repeat: Repeat; weekday?: number; dueDate?: string }
    | { action: 'done'; id: string; done: boolean }
    | { action: 'remove'; id: string };

  let demoSeq = 0;
  function applyLocal(s: ChoreState, p: Payload): ChoreState {
    let all = s.all;
    let done = new Set(s.today.filter((c) => c.done).map((c) => c.id));
    if (p.action === 'add') all = [...all, { id: `demo-${++demoSeq}`, title: p.title, person: p.person, repeat: p.repeat, weekday: p.weekday ?? null, dueDate: p.dueDate ?? null }];
    else if (p.action === 'remove') all = all.filter((c) => c.id !== p.id);
    else if (p.done) done.add(p.id); else done.delete(p.id);
    return { day: s.day, all, today: all.filter((c) => isDue(c, s.day)).map((c) => ({ ...c, done: done.has(c.id) })) };
  }

  async function send(p: Payload): Promise<boolean> {
    if (busy) return false;
    busy = true; error = '';
    try {
      if (demo) { state = applyLocal(state, p); return true; }
      const res = await fetch('/api/chores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (res.status === 409) { error = 'That is the most chores the dashboard keeps. Remove one first.'; return false; }
      if (!res.ok) { error = 'That did not save. Try again.'; return false; }
      state = (await res.json()) as ChoreState;
      return true;
    } catch {
      error = 'Could not reach the dashboard. Check your connection.';
      return false;
    } finally {
      busy = false;
    }
  }

  // --- Add form ---
  let title = $state('');
  let who = $state<string>('');
  let repeat = $state<Repeat>('daily');
  let weekday = $state(new Date().getDay());
  let dueDate = $state(initial.day);
  async function add(e: SubmitEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t) return;
    const ok = await send({ action: 'add', title: t, person: who || null, repeat, ...(repeat === 'weekly' ? { weekday } : {}), ...(repeat === 'once' ? { dueDate } : {}) });
    if (ok) title = '';
  }

  const schedule = (c: Chore) =>
    c.repeat === 'daily' ? 'Every day' : c.repeat === 'weekly' ? `Every ${WEEKDAYS[c.weekday ?? 0]}` : `Once, ${c.dueDate}`;
  const nameOf = (id: string | null) => (id ? byId.get(id)?.name ?? 'Anyone' : 'Anyone');
</script>

{#if error}<p class="notice error" role="alert">{error}</p>{/if}

<div class="cols">
  {#each columns as col (col.id ?? 'anyone')}
    <section class="col" style:--c={col.person?.color ?? 'var(--accent)'} aria-label={`${col.name}'s chores`}>
      <header>
        <span class="avatar" aria-hidden="true">{col.person ? initialOf(col.person) : '★'}</span>
        <h3>{col.name}</h3>
        <span class="count">{doneCount(col.chores)}/{col.chores.length}</span>
      </header>
      <div class="bar" role="progressbar" aria-label="Done today" aria-valuemin={0} aria-valuemax={col.chores.length} aria-valuenow={doneCount(col.chores)}>
        <span style:width={col.chores.length ? `${(doneCount(col.chores) / col.chores.length) * 100}%` : '0%'}></span>
      </div>
      {#if col.chores.length === 0}
        <p class="empty">Nothing today.</p>
      {:else}
        <ul>
          {#each col.chores as c (c.id)}
            <li class:done={c.done}>
              <button type="button" class="tick" aria-pressed={c.done} aria-label={`${c.title}${c.done ? ', done' : ''}`} disabled={busy} onclick={() => send({ action: 'done', id: c.id, done: !c.done })}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
              </button>
              <span class="label">{c.title}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/each}
</div>

<form class="add card" onsubmit={add}>
  <h3>Add a chore</h3>
  <div class="fields">
    <div class="grow"><label for="chore-title">What needs doing?</label><input id="chore-title" bind:value={title} maxlength="80" required placeholder="Feed Fluffy" autocomplete="off" /></div>
    {#if people.length > 0}
      <div><label for="chore-who">Who</label>
        <select id="chore-who" bind:value={who}><option value="">Anyone</option>{#each people as p (p.id)}<option value={p.id}>{p.name}</option>{/each}</select>
      </div>
    {/if}
    <div><label for="chore-repeat">Repeats</label>
      <select id="chore-repeat" bind:value={repeat}><option value="daily">Every day</option><option value="weekly">Every week</option><option value="once">Just once</option></select>
    </div>
    {#if repeat === 'weekly'}
      <div><label for="chore-day">On</label>
        <select id="chore-day" bind:value={weekday}>{#each WEEKDAYS as w, i}<option value={i}>{w}</option>{/each}</select>
      </div>
    {:else if repeat === 'once'}
      <div><label for="chore-date">Date</label><input id="chore-date" type="date" bind:value={dueDate} required /></div>
    {/if}
    <button type="submit" disabled={busy || !title.trim()}>Add</button>
  </div>
</form>

{#if state.all.length > 0}
  <details class="manage card">
    <summary>All chores ({state.all.length})</summary>
    <ul>
      {#each state.all as c (c.id)}
        <li>
          <span class="label">{c.title}</span>
          <span class="muted">{nameOf(c.person)} · {schedule(c)}</span>
          <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'remove', id: c.id })} aria-label={`Remove ${c.title}`}>Remove</button>
        </li>
      {/each}
    </ul>
  </details>
{/if}

<style>
  .cols { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); gap: 1.25rem; align-items: start; margin-bottom: 1.5rem; }
  .col { background: var(--card); border: 1px solid var(--border); border-top: 6px solid var(--c); border-radius: var(--radius); padding: 1.1rem 1.1rem 1.25rem; box-shadow: var(--shadow-sm); }
  .col header { display: flex; align-items: center; gap: .7rem; }
  .col h3 { margin: 0; flex: 1; font-size: 1.25rem; letter-spacing: -.02em; }
  .avatar { display: grid; place-items: center; flex: none; width: 2.5rem; height: 2.5rem; border-radius: 50%; background: var(--c); color: #fff; font-weight: 700; }
  .count { font-weight: 650; font-variant-numeric: tabular-nums; color: var(--muted); }
  .bar { height: .5rem; margin: .8rem 0 .5rem; border-radius: 999px; background: var(--card-2); overflow: hidden; }
  .bar span { display: block; height: 100%; border-radius: inherit; background: var(--c); transition: width .25s ease; }
  .empty { margin: .75rem 0 0; }
  ul { list-style: none; margin: 0; padding: 0; }
  .col li { display: flex; align-items: center; gap: .85rem; padding: .55rem 0; }
  .col li + li { border-top: 1px solid var(--border); }
  .label { min-width: 0; overflow-wrap: anywhere; font-size: 1.05rem; font-weight: 500; }
  .done .label { color: var(--muted); text-decoration: line-through; }
  .tick { display: grid; place-items: center; flex: none; width: 2.75rem; height: 2.75rem; margin: 0; padding: 0; border-radius: 50%; background: transparent; border: 2.5px solid var(--c); box-shadow: none; color: transparent; }
  .tick:hover:not(:disabled) { background: color-mix(in srgb, var(--c) 14%, transparent); filter: none; }
  .tick[aria-pressed="true"] { background: var(--c); color: #fff; }
  .tick svg { width: 1.4rem; height: 1.4rem; fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
  .add h3 { margin: 0 0 .85rem; font-size: 1.1rem; }
  .fields { display: flex; flex-wrap: wrap; gap: .75rem; align-items: end; }
  .fields > div { flex: 0 1 11rem; }
  .fields > .grow { flex: 1 1 14rem; }
  .fields button { width: auto; margin: 0; padding: .7rem 1.5rem; }
  .manage summary { cursor: pointer; font-weight: 650; }
  .manage ul { margin-top: .75rem; }
  .manage li { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .85rem; padding: .55rem 0; border-top: 1px solid var(--border); }
  .manage .label { flex: 1 1 10rem; font-size: 1rem; }
  .manage .muted { font-size: .88rem; }
  .small { width: auto; margin: 0; padding: .3rem .8rem; font-size: .85rem; }
  .card { margin-bottom: 1.25rem; }
</style>

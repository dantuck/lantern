<script lang="ts">
  import type { HList } from '../lib/lists';

  let { initial, demo = false }: { initial: HList[]; demo?: boolean } = $props();

  // svelte-ignore state_referenced_locally
  let lists = $state<HList[]>(initial);
  let error = $state('');
  let busy = $state(false);
  let confirming = $state<string | null>(null); // list id awaiting a second click on "Delete list"
  let newName = $state('');
  let drafts = $state<Record<string, string>>({});

  type Payload =
    | { action: 'add_list'; name: string }
    | { action: 'remove_list'; id: string }
    | { action: 'add_item'; listId: string; text: string }
    | { action: 'done'; id: string; done: boolean }
    | { action: 'remove_item'; id: string }
    | { action: 'clear_done'; listId: string };

  let demoSeq = 0;
  function applyLocal(ls: HList[], p: Payload): HList[] {
    switch (p.action) {
      case 'add_list': return [...ls, { id: `demo-l${++demoSeq}`, name: p.name, items: [] }];
      case 'remove_list': return ls.filter((l) => l.id !== p.id);
      case 'add_item': return ls.map((l) => (l.id === p.listId ? { ...l, items: [...l.items, { id: `demo-i${++demoSeq}`, text: p.text, done: false }] } : l));
      case 'done': return ls.map((l) => ({ ...l, items: l.items.map((i) => (i.id === p.id ? { ...i, done: p.done } : i)) }));
      case 'remove_item': return ls.map((l) => ({ ...l, items: l.items.filter((i) => i.id !== p.id) }));
      case 'clear_done': return ls.map((l) => (l.id === p.listId ? { ...l, items: l.items.filter((i) => !i.done) } : l));
    }
  }

  async function send(p: Payload): Promise<boolean> {
    if (busy) return false;
    busy = true; error = '';
    try {
      if (demo) { lists = applyLocal(lists, p); return true; }
      const res = await fetch('/api/lists', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (res.status === 409) { error = 'That list (or the number of lists) is full. Remove something first.'; return false; }
      if (!res.ok) { error = 'That did not save. Try again.'; return false; }
      lists = (await res.json()) as HList[];
      return true;
    } catch {
      error = 'Could not reach the dashboard. Check your connection.';
      return false;
    } finally {
      busy = false;
    }
  }

  async function addList(e: SubmitEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (name && (await send({ action: 'add_list', name }))) newName = '';
  }
  async function addItem(e: SubmitEvent, listId: string) {
    e.preventDefault();
    const text = (drafts[listId] ?? '').trim();
    if (text && (await send({ action: 'add_item', listId, text }))) drafts[listId] = '';
  }
  async function removeList(id: string) {
    if (confirming !== id) { confirming = id; return; }
    confirming = null;
    await send({ action: 'remove_list', id });
  }
</script>

{#if error}<p class="notice error" role="alert">{error}</p>{/if}

<div class="lists">
  {#each lists as l (l.id)}
    {@const open = l.items.filter((i) => !i.done)}
    {@const done = l.items.filter((i) => i.done)}
    <section class="list card" aria-label={l.name}>
      <header>
        <h3>{l.name}</h3>
        <span class="count">{open.length} to go</span>
      </header>
      {#if l.items.length === 0}<p class="empty">Nothing here yet.</p>{/if}
      <ul>
        {#each [...open, ...done] as i (i.id)}
          <li class:done={i.done}>
            <button type="button" class="tick" aria-pressed={i.done} aria-label={`${i.text}${i.done ? ', done' : ''}`} disabled={busy} onclick={() => send({ action: 'done', id: i.id, done: !i.done })}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
            </button>
            <span class="label">{i.text}</span>
            <button type="button" class="x" disabled={busy} aria-label={`Remove ${i.text}`} onclick={() => send({ action: 'remove_item', id: i.id })}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </li>
        {/each}
      </ul>
      <form class="adder" onsubmit={(e) => addItem(e, l.id)}>
        <label class="sr" for={`add-${l.id}`}>Add to {l.name}</label>
        <input id={`add-${l.id}`} bind:value={drafts[l.id]} maxlength="120" placeholder="Add an item" autocomplete="off" />
        <button type="submit" disabled={busy || !(drafts[l.id] ?? '').trim()}>Add</button>
      </form>
      <footer>
        {#if done.length > 0}<button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'clear_done', listId: l.id })}>Clear {done.length} done</button>{/if}
        <button type="button" class="ghost small danger-text" disabled={busy} onclick={() => removeList(l.id)} onblur={() => confirming === l.id && (confirming = null)}>
          {confirming === l.id ? 'Really delete?' : 'Delete list'}
        </button>
      </footer>
    </section>
  {/each}
</div>

<form class="new card" onsubmit={addList}>
  <h3>New list</h3>
  <div class="row">
    <div><label for="list-name">Name</label><input id="list-name" bind:value={newName} maxlength="60" required placeholder="Groceries" autocomplete="off" /></div>
    <button type="submit" disabled={busy || !newName.trim()}>Create list</button>
  </div>
</form>

<style>
  /* Masonry: cards of different heights pack into columns instead of leaving gaps under short ones. */
  .lists { column-width: 19rem; column-gap: 1.25rem; margin-bottom: 1.5rem; }
  .list { margin: 0; }
  header { display: flex; align-items: baseline; gap: .75rem; margin-bottom: .5rem; }
  h3 { margin: 0; flex: 1; font-size: 1.25rem; letter-spacing: -.02em; }
  .count { color: var(--muted); font-size: .9rem; font-weight: 600; }
  .empty { margin: .5rem 0; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { display: flex; align-items: center; gap: .8rem; padding: .45rem 0; }
  li + li { border-top: 1px solid var(--border); }
  .label { flex: 1; min-width: 0; overflow-wrap: anywhere; font-size: 1.05rem; font-weight: 500; }
  .done .label { color: var(--muted); text-decoration: line-through; }
  .tick { display: grid; place-items: center; flex: none; width: 2.75rem; height: 2.75rem; margin: 0; padding: 0; border-radius: 50%; background: transparent; border: 2.5px solid var(--accent); box-shadow: none; color: transparent; }
  .tick:hover:not(:disabled) { background: var(--accent-soft); filter: none; }
  .tick[aria-pressed="true"] { background: var(--accent); color: var(--accent-fg); }
  .tick svg { width: 1.3rem; height: 1.3rem; fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
  .x { display: grid; place-items: center; flex: none; width: 2.75rem; height: 2.75rem; margin: 0; padding: 0; border-radius: 50%; background: transparent; color: var(--muted); border: 0; box-shadow: none; }
  .x:hover:not(:disabled) { background: var(--card-2); color: var(--fg); filter: none; }
  .x svg { width: 1.1rem; height: 1.1rem; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
  .adder { display: flex; gap: .5rem; margin-top: .75rem; }
  .adder input { flex: 1; min-width: 0; }
  .adder button { width: auto; margin: 0; padding: .7rem 1.1rem; }
  footer { display: flex; flex-wrap: wrap; gap: .5rem; justify-content: flex-end; margin-top: .85rem; }
  .small { width: auto; margin: 0; padding: .35rem .85rem; font-size: .85rem; }
  @media (pointer: coarse) { .small { min-height: 2.75rem; padding-inline: 1rem; } }
  .danger-text { color: var(--danger); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  .new h3 { margin-bottom: .75rem; }
  .new .row button { align-self: end; }
  .card { margin-bottom: 1.25rem; }
  .lists .card { margin-bottom: 1.25rem; break-inside: avoid; }
</style>

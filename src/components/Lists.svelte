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

<div class="columns-[19rem] gap-x-5 mb-6">
  {#each lists as l (l.id)}
    {@const open = l.items.filter((i) => !i.done)}
    {@const done = l.items.filter((i) => i.done)}
    <section class="card break-inside-avoid" aria-label={l.name}>
      <header class="flex items-baseline gap-3 mb-2">
        <h3 class="m-0 flex-1 text-[1.25rem] tracking-[-.02em]">{l.name}</h3>
        <span class="text-muted text-[.9rem] font-semibold">{open.length} to go</span>
      </header>
      {#if l.items.length === 0}<p class="my-2 mx-0">Nothing here yet.</p>{/if}
      <ul class="list-none m-0 p-0">
        {#each [...open, ...done] as i (i.id)}
          <li class="flex items-center gap-[.8rem] py-[.45rem] [li+&]:[border-top:1px_solid_var(--border)]">
            <button type="button" class="tick size-11 [--tick-fg:var(--accent-fg)] [&_svg]:size-[1.3rem]" aria-pressed={i.done} aria-label={`${i.text}${i.done ? ', done' : ''}`} disabled={busy} onclick={() => send({ action: 'done', id: i.id, done: !i.done })}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
            </button>
            <span class="flex-1 min-w-0 [overflow-wrap:anywhere] text-[1.05rem] font-medium {i.done ? 'text-muted line-through' : ''}">{i.text}</span>
            <button type="button" class="icon-btn" disabled={busy} aria-label={`Remove ${i.text}`} onclick={() => send({ action: 'remove_item', id: i.id })}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </li>
        {/each}
      </ul>
      <form class="flex gap-2 mt-3" onsubmit={(e) => addItem(e, l.id)}>
        <label class="sr-only" for={`add-${l.id}`}>Add to {l.name}</label>
        <input class="flex-1 min-w-0" id={`add-${l.id}`} bind:value={drafts[l.id]} maxlength="120" placeholder="Add an item" autocomplete="off" />
        <button class="w-auto m-0 py-[.7rem] px-[1.1rem]" type="submit" disabled={busy || !(drafts[l.id] ?? '').trim()}>Add</button>
      </form>
      <footer class="flex flex-wrap gap-2 justify-end mt-[.85rem]">
        {#if done.length > 0}<button type="button" class="ghost small [&&&]:py-[.35rem] [&&&]:px-[.85rem] pointer-coarse:[&&&]:px-4" disabled={busy} onclick={() => send({ action: 'clear_done', listId: l.id })}>Clear {done.length} done</button>{/if}
        <button type="button" class="ghost small [&&]:text-danger [&&&]:py-[.35rem] [&&&]:px-[.85rem] pointer-coarse:[&&&]:px-4" disabled={busy} onclick={() => removeList(l.id)} onblur={() => confirming === l.id && (confirming = null)}>
          {confirming === l.id ? 'Really delete?' : 'Delete list'}
        </button>
      </footer>
    </section>
  {/each}
</div>

<form class="card mb-5" onsubmit={addList}>
  <h3 class="mt-0 mx-0 mb-3 text-[1.25rem] tracking-[-.02em]">New list</h3>
  <div class="row">
    <div><label for="list-name">Name</label><input id="list-name" bind:value={newName} maxlength="60" required placeholder="Groceries" autocomplete="off" /></div>
    <button class="self-end" type="submit" disabled={busy || !newName.trim()}>Create list</button>
  </div>
</form>

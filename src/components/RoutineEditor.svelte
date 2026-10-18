<script lang="ts">
  import { onDestroy } from 'svelte';
  import AddChore from './AddChore.svelte';
  import BonusEditor from './BonusEditor.svelte';
  import { describeSchedule, PERIOD_LABEL, sections, type ChoreItem, type Period, type Routine } from '../lib/choreTypes';
  import ItemEditor from './ItemEditor.svelte';

  /**
   * Everything a manager changes about one person's routine: the bonuses, each chore, and a form to add more.
   * `collapsible` lists each chore as one tappable row that opens its editor (one at a time), which suits a phone.
   */
  let { person, name, items, bonuses, day, busy, send, routines = [], collapsible = false }: {
    person: string | null; name: string; items: ChoreItem[]; bonuses: Record<Period, number>; day: string; busy: boolean; send: (payload: Record<string, unknown>) => Promise<boolean>; routines?: Routine[]; collapsible?: boolean;
  } = $props();

  let openId = $state<string | null>(null);

  // Removing hides the chore at once but only deletes it on the server after a few seconds, so Undo is a real undo.
  // Leaving the page (or collapsing this list) sends any waiting deletes straight away.
  const UNDO_MS = 5000;
  type Waiting = { c: ChoreItem; sent: boolean };
  let waiting = $state.raw<Waiting[]>([]);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const hidden = $derived(new Set(waiting.map((w) => w.c.id)));
  const groups = $derived(sections(items.filter((i) => !hidden.has(i.id))));
  const notices = $derived(waiting.filter((w) => !w.sent));
  const stop = (id: string) => { clearTimeout(timers.get(id)); timers.delete(id); };

  async function commit(id: string) {
    stop(id);
    if (!waiting.some((w) => w.c.id === id && !w.sent)) return;
    waiting = waiting.map((w) => (w.c.id === id ? { ...w, sent: true } : w));
    await send({ action: 'item_remove', id });
    waiting = waiting.filter((w) => w.c.id !== id); // if the delete failed, the chore simply shows again (the page shows the error)
  }
  function gone(c: ChoreItem) {
    openId = null;
    waiting = [...waiting, { c, sent: false }];
    timers.set(c.id, setTimeout(() => void commit(c.id), UNDO_MS));
  }
  const undo = (id: string) => { stop(id); waiting = waiting.filter((w) => w.c.id !== id); };
  onDestroy(() => { for (const w of waiting) void commit(w.c.id); });
</script>

{#if person !== null}
  <BonusEditor {person} {name} {bonuses} {send} class="mt-[.8rem]" />
{/if}

{#each groups as sec (sec.period)}
  {#if sec.period !== 'any' || groups.length > 1}<h4 class="mt-[1.1rem] mb-[.4rem] mx-0 text-[.95rem]">{PERIOD_LABEL[sec.period]}</h4>{/if}
  <ul class="list-none m-0 p-0">
    {#each sec.items as c (c.id)}
      {#if collapsible}
        <li class="[li+&]:[border-top:1px_solid_var(--border)]">
          <button type="button" class="routine-row" aria-expanded={openId === c.id} onclick={() => (openId = openId === c.id ? null : c.id)}>
            <span class="min-w-0 flex-1 [overflow-wrap:anywhere] text-[1.1rem] font-medium">{c.title}<span class="note block text-[.85rem]">{describeSchedule(c)}</span></span>
            <span class="text-[.9rem] [font-weight:650] text-[color:var(--c,var(--accent))] tabular-nums">+{c.points}</span>
            <span class="text-muted transition-transform {openId === c.id ? 'rotate-90' : ''}" aria-hidden="true">›</span>
          </button>
          {#if openId === c.id}
            <div class="edit-card mt-1"><ItemEditor {c} {day} {busy} {send} onremove={() => gone(c)} /></div>
          {/if}
        </li>
      {:else}
        <li class="edit-card">
          <ItemEditor {c} {day} {busy} {send} onremove={() => gone(c)} />
        </li>
      {/if}
    {/each}
  </ul>
{/each}

{#each notices as w (w.c.id)}
  <p class="notice flex-wrap items-center justify-between" role="status"><span>Removed <strong>{w.c.title}</strong>.</span> <button type="button" class="small" onclick={() => undo(w.c.id)}>Undo</button></p>
{/each}

<AddChore {person} {day} {busy} {send} {routines} />

<script lang="ts">
  import AddChore from './AddChore.svelte';
  import BonusEditor from './BonusEditor.svelte';
  import { describeSchedule, PERIOD_LABEL, sections, type ChoreItem, type Period } from '../lib/choreTypes';
  import ItemEditor from './ItemEditor.svelte';

  /**
   * Everything a manager changes about one person's routine: the bonuses, each chore, and a form to add more.
   * `collapsible` lists each chore as one tappable row that opens its editor (one at a time), which suits a phone.
   */
  let { person, name, items, bonuses, day, busy, send, collapsible = false }: {
    person: string | null; name: string; items: ChoreItem[]; bonuses: Record<Period, number>; day: string; busy: boolean; send: (payload: Record<string, unknown>) => Promise<boolean>; collapsible?: boolean;
  } = $props();

  let openId = $state<string | null>(null);
  const groups = $derived(sections(items));
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
            <div class="edit-card mt-1"><ItemEditor {c} {day} {busy} {send} onremove={() => (openId = null)} /></div>
          {/if}
        </li>
      {:else}
        <li class="edit-card">
          <ItemEditor {c} {day} {busy} {send} />
        </li>
      {/if}
    {/each}
  </ul>
{/each}

<AddChore {person} {day} {busy} {send} />

<script lang="ts">
  import FeatherIcon from './FeatherIcon.svelte';
  import { ownerKey, plural, type ChoreItem, type Owner, type Routine } from '../lib/choreTypes';
  import { toggleIn } from '../lib/arrays';

  /** Copies some of one person's chores onto other people's lists. Chores a person already has (same title) are left alone. */
  let { items, targets, routines, send, onclose }: {
    items: ChoreItem[]; targets: Owner[]; routines: Routine[]; send: (payload: Record<string, unknown>) => Promise<boolean>; onclose: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let chores = $state<string[]>(items.map((c) => c.id));
  let who = $state<string[]>([]);
  let working = $state(false);
  let result = $state('');

  const chosen = $derived(items.filter((c) => chores.includes(c.id)));
  const picked = $derived(targets.filter((t) => who.includes(ownerKey(t.id))));

  async function copy() {
    working = true;
    result = '';
    let skipped = 0;
    const adds = picked.flatMap((t) => {
      const have = new Set((routines.find((r) => r.person === t.id)?.items ?? []).map((i) => i.title.toLowerCase()));
      const fresh = chosen.filter((c) => !have.has(c.title.toLowerCase()));
      skipped += chosen.length - fresh.length;
      return fresh.map((c) => ({ person: t.id, title: c.title, points: c.points, period: c.period, days: c.days, onceDate: c.onceDate, everyWeeks: c.everyWeeks, weekAnchor: c.weekAnchor, untilDone: c.untilDone, keptPoints: c.keptPoints }));
    });
    const ok = adds.length === 0 || (await send({ action: 'items_add', items: adds }));
    working = false;
    result = ok ? `Copied ${plural(adds.length, 'chore')}${skipped > 0 ? `; ${skipped} already there` : ''}.` : 'Nothing was copied. See the message at the top of the page.';
  }
</script>

<div class="grid gap-3">
  <div class="grid gap-2">
    <span class="flex items-center justify-between gap-2"><span class="cap">Chores to copy</span>
      <button type="button" class="ghost small" onclick={() => (chores = chores.length === items.length ? [] : items.map((c) => c.id))}>{chores.length === items.length ? 'Clear' : 'Select all'}</button></span>
    <div class="flex flex-wrap gap-2">
      {#each items as c (c.id)}<button type="button" class="day-chip" aria-pressed={chores.includes(c.id)} onclick={() => (chores = toggleIn(chores, c.id))}>{c.title}</button>{/each}
    </div>
  </div>
  <div class="grid gap-2">
    <span class="cap">Copy to</span>
    <div class="flex flex-wrap gap-2">
      {#each targets as t (ownerKey(t.id))}
        {@const on = who.includes(ownerKey(t.id))}
        <button type="button" class="person-chip {on ? '' : 'opacity-60'}" style:--c={t.color} aria-pressed={on} onclick={() => (who = toggleIn(who, ownerKey(t.id)))}>
          <span class="avatar size-[1.6rem] text-[.78rem]" aria-hidden="true">{#if t.id === null}<FeatherIcon name="star" />{:else}{t.name.charAt(0).toUpperCase()}{/if}</span><span class="pr-[.7rem]">{t.name}</span>
        </button>
      {/each}
    </div>
  </div>
  {#if result}<p class="note m-0" role="status">{result}</p>{/if}
  <div class="flex justify-end gap-2">
    <button type="button" class="ghost small" onclick={onclose}>{result ? 'Done' : 'Cancel'}</button>
    <button type="button" class="small" disabled={working || chosen.length === 0 || picked.length === 0} onclick={copy}>{working ? 'Copying…' : `Copy ${chosen.length} to ${picked.length}`}</button>
  </div>
</div>

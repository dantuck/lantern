<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import Masonry from './Masonry.svelte';
  import { mediaQuery } from '../lib/media.svelte';
  import AddChore from './AddChore.svelte';
  import BonusEditor from './BonusEditor.svelte';
  import CopyChores from './CopyChores.svelte';
  import Panel from './Panel.svelte';
  import Sheet from './Sheet.svelte';
  import { describeSchedule, inRotation, isPastOnce, itemDueOnWeekday, PERIOD_LABEL, PERIODS, plural, ptsLabel, sections, WEEKDAY_SHORT, type ChoreItem, type Owner, type Period, type Routine } from '../lib/choreTypes';
  import { addDays, dayLabel, weekdayOf } from '../lib/dates';
  import ItemEditor from './ItemEditor.svelte';

  /**
   * Everything a manager changes about one person's routine: a summary header, a day filter, each chore as a read-only card
   * ("Edit" opens just that one; in a sheet on a phone), the all-done bonus beside each time of day, and tools to add or copy chores.
   */
  let { person, name, color = 'var(--accent)', items, bonuses, day, busy, send, routines = [], others = [] }: {
    person: string | null; name: string; color?: string; items: ChoreItem[]; bonuses: Record<Period, number>; day: string; busy: boolean; send: (payload: Record<string, unknown>) => Promise<boolean>; routines?: Routine[]; others?: Owner[];
  } = $props();

  let openId = $state<string | null>(null);
  /** Closes the open chore and returns focus to the button that opened it. */
  async function closeEdit() {
    const id = openId;
    openId = null;
    if (id) { await tick(); document.getElementById(`edit-chore-${id}`)?.focus(); }
  }
  let panel = $state<'add' | 'copy' | null>(null);
  let dayPick = $state<number | null>(null);
  let periodPick = $state<Period | 'all'>('all');

  // Phones get a bottom sheet for editing; wider screens edit in place.
  const phone = mediaQuery('(max-width: 39.999rem)');
  const narrow = $derived(phone.matches);

  // Removing hides the chore at once but only deletes it on the server after a few seconds, so Undo is a real undo.
  // Leaving the page (or switching person) sends any waiting deletes straight away.
  const UNDO_MS = 5000;
  type Waiting = { c: ChoreItem; sent: boolean };
  let waiting = $state.raw<Waiting[]>([]);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const hidden = $derived(new Set(waiting.map((w) => w.c.id)));
  const live = $derived(items.filter((i) => !hidden.has(i.id)));
  const notices = $derived(waiting.filter((w) => !w.sent));
  const stop = (id: string) => { clearTimeout(timers.get(id)); timers.delete(id); };

  const isPast = (c: ChoreItem) => isPastOnce(c, day);
  /** Whether a chore is on the schedule for a weekday (0 = Sunday); a one-off counts on the weekday of its date, and one that skips weeks only in the weeks it is on, unless that day has gone (it waits in the list to be used again). */
  const perDay = $derived(WEEKDAY_SHORT.map((_, d) => live.filter((c) => !isPast(c) && itemDueOnWeekday(c, d) && inRotation(c, day))));
  /** Chore points on the busiest day: what the most a person can earn from chores alone. */
  const dayPoints = $derived(perDay.map((cs) => cs.reduce((n, c) => n + c.points, 0)));
  const busiest = $derived(Math.max(0, ...dayPoints));
  const today = $derived(weekdayOf(day));
  const manyChores = $derived(live.length > 8);
  const shownItems = $derived(live.filter((c) => (dayPick === null || (!isPast(c) && itemDueOnWeekday(c, dayPick) && inRotation(c, day))) && (periodPick === 'all' || c.period === periodPick)));
  const groups = $derived(sections(shownItems));
  const openItem = $derived(live.find((c) => c.id === openId));

  /** Moves a one-off to another day, so a chore that came up once can be done again without retyping it. */
  const reuse = (c: ChoreItem, date: string) => send({ action: 'item_update', id: c.id, onceDate: date });

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

  // Skipping is saved at once, so its Undo simply puts the chore back; the notice goes away by itself.
  let skips = $state.raw<ChoreItem[]>([]);
  const skipTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const dismissSkip = (id: string) => { clearTimeout(skipTimers.get(id)); skipTimers.delete(id); skips = skips.filter((c) => c.id !== id); };
  async function skip(c: ChoreItem) {
    if (!(await send({ action: 'item_skip', id: c.id, skipped: true }))) return;
    skips = [...skips.filter((k) => k.id !== c.id), c];
    skipTimers.set(c.id, setTimeout(() => dismissSkip(c.id), UNDO_MS));
  }
  async function unskip(c: ChoreItem) { dismissSkip(c.id); await send({ action: 'item_skip', id: c.id, skipped: false }); }
  onDestroy(() => { for (const t of skipTimers.values()) clearTimeout(t); });
  const undo = (id: string) => { stop(id); waiting = waiting.filter((w) => w.c.id !== id); };
  onDestroy(() => { for (const w of waiting) void commit(w.c.id); });
</script>

{#snippet panelBody()}
  {#if panel === 'add'}
    <AddChore {person} {day} {busy} {send} {routines} />
    <div class="flex justify-end"><button type="button" class="small" onclick={() => (panel = null)}>Done</button></div>
  {:else if panel === 'copy'}
    <CopyChores items={live} targets={others} {routines} {send} onclose={() => (panel = null)} />
  {/if}
{/snippet}

<header class="flex flex-wrap items-center gap-3 mb-3">
  <span class="avatar size-11 text-[1.2rem]" style:--c={color} aria-hidden="true">{person === null ? '★' : name.charAt(0).toUpperCase()}</span>
  <div class="min-w-0 flex-[1_1_9rem]">
    <strong class="block text-[1.15rem] [overflow-wrap:anywhere]" style:color={color}>{name}</strong>
    <span class="note">{plural(live.length, 'chore')}{person !== null && busiest > 0 ? ` · up to ${ptsLabel(busiest)} a day` : ''}{person === null ? ' · no points' : ''}</span>
  </div>
  <div class="flex gap-2">
    {#if others.length > 0 && live.length > 0}<button type="button" class="ghost small" aria-expanded={panel === 'copy'} onclick={() => (panel = panel === 'copy' ? null : 'copy')}>Copy to…</button>{/if}
    <button type="button" class="small" aria-expanded={panel === 'add'} onclick={() => (panel = panel === 'add' ? null : 'add')}>+ Add chore</button>
  </div>
</header>

{#if panel !== null}
  <Panel title={panel === 'add' ? 'Add a chore' : `Copy ${name}'s chores`} onclose={() => (panel = null)}>{@render panelBody()}</Panel>
{/if}

{#if live.length > 0}
  <div class="grid gap-1 mb-3" role="group" aria-label="Show a day">
    <span class="cap">This week</span>
    <div class="grid grid-cols-7 gap-1 min-[40rem]:gap-2 max-w-[34rem]">
      {#each WEEKDAY_SHORT as d, i (i)}
        {@const n = perDay[i]!.length}
        <button type="button" aria-pressed={dayPick === i} aria-label={`${d}${i === today ? ' (today)' : ''}: ${plural(n, 'chore')}`}
          onclick={() => (dayPick = dayPick === i ? null : i)}
          class="relative grid justify-items-center gap-1 [&&]:m-0 [&&]:w-full [&&]:px-0 [&&]:pt-[.45rem] [&&]:pb-[.5rem] [&&]:min-h-0 rounded-[var(--radius-sm)] border border-solid shadow-none text-fg [&&:hover]:filter-none [&&:active]:transform-none transition-colors
          {dayPick === i ? 'bg-accent border-accent [&&]:text-white' : 'bg-card2 border-line [&&:hover]:bg-accent-soft'} {n === 0 && dayPick !== i ? 'opacity-55' : ''}">
          <span class="text-[.7rem] font-semibold uppercase tracking-[.06em] {dayPick === i ? '' : 'text-muted'}">{d}</span>
          <span class="text-[1.25rem] [font-weight:750] leading-none tabular-nums">{n}</span>
          {#if i === today}<span class="absolute top-[.3rem] right-[.3rem] size-[.4rem] rounded-full {dayPick === i ? 'bg-white' : 'bg-accent'}" aria-hidden="true"></span>{/if}
        </button>
      {/each}
    </div>
  </div>
  {#if manyChores}
    <div class="seg-group mb-3 justify-self-start max-[40rem]:flex max-[40rem]:justify-self-stretch" role="group" aria-label="Show a time of day">
      <button type="button" class="seg-btn" aria-pressed={periodPick === 'all'} onclick={() => (periodPick = 'all')}>All</button>
      {#each PERIODS as p (p)}<button type="button" class="seg-btn" aria-pressed={periodPick === p} onclick={() => (periodPick = p)}>{PERIOD_LABEL[p]}</button>{/each}
    </div>
  {/if}
{:else}
  <p class="note">No chores yet. Tap <strong>+ Add chore</strong> to start this list.</p>
{/if}

{#each groups as sec (sec.period)}
  <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-[1.1rem] mb-[.4rem]">
    <h4 class="m-0 text-[.95rem]">{PERIOD_LABEL[sec.period]} <span class="note">· {sec.items.length}</span></h4>
    {#if person !== null}<BonusEditor {person} {name} period={sec.period} bonus={bonuses[sec.period]} {busy} {send} />{/if}
  </div>
  <Masonry items={sec.items} key={(c) => c.id}>
    {#snippet row(c)}
      {@const inline = openId === c.id && !narrow}
      <li class="edit-card {inline ? '' : '!grid-cols-[minmax(0,1fr)_auto] items-center'} {isPast(c) && !inline ? 'opacity-70' : ''}">
        {#if inline}
          <ItemEditor {c} {day} {busy} {send} onremove={() => gone(c)} onclose={closeEdit} />
        {:else}
          <div class="min-w-0">
            <strong class="break-words">{c.title}</strong>
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
              <span class="pill"><span aria-hidden="true">★</span> +{ptsLabel(c.points)}</span>
              {#if c.onceDate !== null}
                <span class="note">Just once · {dayLabel(c.onceDate, day)}{isPast(c) ? ' (past)' : ''}</span>
              {:else}
                <span class="note">{describeSchedule(c)}</span>
              {/if}
            </div>
            {#if isPast(c)}
              <div class="flex flex-wrap items-center gap-2 mt-2">
                <span class="note">Do again:</span>
                <button type="button" class="ghost small m-0" disabled={busy} aria-label={`Do ${c.title} today`} onclick={() => reuse(c, day)}>Today</button>
                <button type="button" class="ghost small m-0" disabled={busy} aria-label={`Do ${c.title} tomorrow`} onclick={() => reuse(c, addDays(day, 1))}>Tomorrow</button>
                <button type="button" class="ghost small m-0" disabled={busy || openId !== null} onclick={() => (openId = c.id)}>Pick a day…</button>
              </div>
            {/if}
          </div>
          <div class="flex flex-wrap items-center justify-end gap-1">
            {#if c.due}
              <!-- Skipping hides a chore for today only; it is back on its normal schedule tomorrow. Removing for good is under Edit. -->
              <button type="button" class="ghost small m-0 pointer-coarse:min-h-11" disabled={busy || openId !== null} aria-label={c.skipped ? `Put ${c.title} back on today's list` : `Skip ${c.title} today`} onclick={() => (c.skipped ? send({ action: 'item_skip', id: c.id, skipped: false }) : skip(c))}>{c.skipped ? 'Put back' : 'Skip'}</button>
            {/if}
            <button type="button" id={`edit-chore-${c.id}`} class="small m-0 pointer-coarse:min-h-11 pointer-coarse:px-5" disabled={busy || openId !== null} aria-label={`Edit ${c.title}`} onclick={() => (openId = c.id)}>Edit</button>
          </div>
        {/if}
      </li>
    {/snippet}
  </Masonry>
{:else}
  {#if live.length > 0}<p class="note">Nothing matches that filter. <button type="button" class="link" onclick={() => { dayPick = null; periodPick = 'all'; }}>Show everything</button></p>{/if}
{/each}

{#if narrow && openItem}
  <Sheet title={`Edit ${openItem.title}`} onclose={closeEdit}>
    <ItemEditor c={openItem} {day} {busy} {send} onremove={() => gone(openItem)} onclose={closeEdit} />
  </Sheet>
{/if}

{#if notices.length > 0 || skips.length > 0}
  <!-- Pinned to the screen (not the end of a long list) so Undo is always in view. -->
  <div class="fixed z-40 left-1/2 bottom-[calc(5rem+env(safe-area-inset-bottom))] [translate:-50%_0] w-[min(32rem,calc(100vw-2rem))] grid gap-2 md:bottom-[max(1rem,env(safe-area-inset-bottom))] [body.has-rail_&]:md:left-[calc(50%+3rem)]">
    {#each skips as c (c.id)}
      <p class="notice m-0 flex-wrap items-center justify-between bg-card shadow-[var(--shadow-md)]" role="status"><span>Skipped <strong>{c.title}</strong> for today.</span> <button type="button" class="small" onclick={() => void unskip(c)}>Undo</button></p>
    {/each}
    {#each notices as w (w.c.id)}
      <p class="notice m-0 flex-wrap items-center justify-between bg-card shadow-[var(--shadow-md)]" role="status"><span>Removed <strong>{w.c.title}</strong>.</span> <button type="button" class="small" onclick={() => undo(w.c.id)}>Undo</button></p>
    {/each}
  </div>
{/if}

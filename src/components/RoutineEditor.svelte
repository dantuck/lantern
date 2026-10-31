<script lang="ts">
  import FeatherIcon from './FeatherIcon.svelte';
  import { onDestroy, tick } from 'svelte';
  import { mediaQuery } from '../lib/media.svelte';
  import { keep, text } from '../lib/choreClient';
  import AddChore from './AddChore.svelte';
  import CenteredPopover from './CenteredPopover.svelte';
  import BonusEditor from './BonusEditor.svelte';
  import CopyChores from './CopyChores.svelte';
  import DayChips from './DayChips.svelte';
  import InlineAddChore from './InlineAddChore.svelte';
  import Panel from './Panel.svelte';
  import Sheet from './Sheet.svelte';
  import Stepper from './Stepper.svelte';
  import { EVERY_DAY, inRotation, MAX_PERIOD_LABEL, isPastOnce, itemDueOnWeekday, normalizeDays, PERIOD_LABEL, PERIODS, plural, pointsOnWeekday, ptsLabel, toggleDay, WEEKDAY_SHORT, type ChoreItem, type Owner, type Period, type Routine } from '../lib/choreTypes';
  import { addDays, dayLabel } from '../lib/dates';
  import ItemEditor from './ItemEditor.svelte';

  /**
   * Everything a manager changes about one person's routine: a summary header, a day filter, each chore as a read-only card
   * ("Edit" opens just that one; in a sheet on a phone), the all-done bonus beside each time of day, and tools to add or copy chores.
   */
  let { person, name, color = 'var(--accent)', items, bonuses, day, busy, send, routines = [], others = [], labels = PERIOD_LABEL }: {
    labels?: Record<Period, string>; person: string | null; name: string; color?: string; items: ChoreItem[]; bonuses: Record<Period, number>; day: string; busy: boolean; send: (payload: Record<string, unknown>) => Promise<boolean>; routines?: Routine[]; others?: Owner[];
  } = $props();

  /** The time of day being renamed from its heading, and the name as typed. */
  let renaming = $state<Period | null>(null);
  let newName = $state('');
  async function rename(e: SubmitEvent) {
    e.preventDefault();
    if (renaming && (await send({ action: 'period_labels_set', labels: { [renaming]: newName.trim() } }))) renaming = null;
  }

  let openId = $state<string | null>(null);
  /** Closes the open chore and returns focus to the button that opened it. */
  async function closeEdit() {
    const id = openId;
    openId = null;
    if (id) { await tick(); document.getElementById(`edit-chore-${id}`)?.focus(); }
  }
  let copying = $state(false);
  /** The "add a chore" drawer, and what has been added since it opened (it stays open for the next one). */
  let adding = $state(false);
  let added = $state<string[]>([]);
  const openAdd = () => { added = []; adding = true; };
  async function sendAdd(payload: Record<string, unknown>): Promise<boolean> {
    const ok = await send(payload);
    if (ok && payload.action === 'item_add') added = [...added, String(payload.title)];
    return ok;
  }

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
  /** Chore points on each day; an until-done chore counts its points on its first day and its kept-up points after. */
  const dayPoints = $derived(perDay.map((cs, d) => cs.reduce((n, c) => n + pointsOnWeekday(c, d), 0)));
  const busiest = $derived(Math.max(0, ...dayPoints));
  // Every time of day gets a section, even an empty one, so a chore can be added straight into it.
  const groups = $derived(PERIODS.map((period) => ({ period, items: live.filter((i) => i.period === period) })));
  const openItem = $derived(live.find((c) => c.id === openId));

  /** Saves one change to a chore straight from its row. */
  const patch = (c: ChoreItem, changes: Record<string, unknown>) => send({ action: 'item_update', id: c.id, ...changes });
  const setDay = (c: ChoreItem, weekday: number) => {
    const next = toggleDay(c.days ?? EVERY_DAY, weekday);
    return next === 0 ? Promise.resolve(false) : patch(c, { days: normalizeDays(next) }); // the last day cannot be turned off
  };
  const setTitle = (c: ChoreItem, e: Event) => { const t = text(e); if (!t) { (e.currentTarget as HTMLInputElement).value = c.title; return; } if (t !== c.title) keep(e, patch(c, { title: t })); };

  let typing = $state(false); // a field has focus, so the round add button steps aside
  /** The planner's columns on a wide screen (chore, time of day, seven days, points, actions); on a phone each chore stacks in rows of two. */
  const COLS = 'min-[56rem]:grid min-[56rem]:grid-cols-[minmax(10rem,1fr)_9.5rem_repeat(7,2.1rem)_9.25rem_10rem]';
  const COLS_PHONE = 'grid-cols-[minmax(0,1fr)_9.25rem]';
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

<header class="flex flex-wrap items-center gap-3 mb-3">
  <span class="avatar size-11 text-[1.2rem]" style:--c={color} aria-hidden="true">{#if person === null}<FeatherIcon name="star" />{:else}{name.charAt(0).toUpperCase()}{/if}</span>
  <div class="min-w-0 flex-[1_1_9rem]">
    <strong class="block text-[1.15rem] [overflow-wrap:anywhere]" style:color={color}>{name}</strong>
    <span class="note">{plural(live.length, 'chore')}{person !== null && busiest > 0 ? ` · up to ${ptsLabel(busiest)} a day` : ''}{person === null ? ' · no points' : ''}</span>
  </div>
  {#if others.length > 0 && live.length > 0}<button type="button" class="ghost small" aria-expanded={copying} onclick={() => (copying = !copying)}>Copy to…</button>{/if}
  <button type="button" class="small" onclick={openAdd}><FeatherIcon name="plus" /> Add chore</button>
</header>

{#if copying}
  <Panel title={`Copy ${name}'s chores`} onclose={() => (copying = false)}><CopyChores items={live} targets={others} {routines} {send} onclose={() => (copying = false)} /></Panel>
{/if}

{#if adding}
  <Sheet title={`Add a chore for ${name}`} drawer onclose={() => (adding = false)}>
    <AddChore bare {person} {day} {busy} send={sendAdd} {routines} {labels} />
    {#if added.length > 0}
      <p class="note m-0 mt-3" role="status"><FeatherIcon name="check" /> Added {added.length === 1 ? added[0] : `${added.length} chores: ${added.slice(-3).join(', ')}`}</p>
    {/if}
    <button type="button" class="ghost w-full mt-3" onclick={() => (adding = false)}>{added.length > 0 ? 'Done' : 'Cancel'}</button>
  </Sheet>
{/if}

<!-- Typing in a field (the quick add, a title) hides the round button below, so it never sits over what is being edited. -->
<svelte:window onfocusin={(e) => (typing = e.target instanceof HTMLElement && e.target.matches('input, select, textarea'))} onfocusout={() => (typing = false)} />

<!-- On a phone the button in the header scrolls away, so a round one stays in reach above the tab bar. -->
{#if !adding && !typing}
  <button type="button" class="md:!hidden fixed z-30 right-4 bottom-[calc(5.2rem+env(safe-area-inset-bottom))] size-14 [&&]:p-0 [&&]:m-0 rounded-full shadow-[var(--shadow-md)] inline-flex items-center justify-center [&_svg]:size-6" aria-label={`Add a chore for ${name}`} onclick={openAdd}><FeatherIcon name="plus" /></button>
{/if}

{#if live.length === 0}
  <p class="note">No chores yet. Add one under a time of day to start {name}'s list.</p>
{/if}

{#each groups as sec (sec.period)}
  <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mt-4 mb-1 py-1 [border-bottom:2px_solid_var(--border)]">
    {#if renaming === sec.period}
      <form class="flex flex-wrap items-center gap-2" onsubmit={rename}>
        <input class="m-0 w-48" bind:value={newName} maxlength={MAX_PERIOD_LABEL} placeholder={PERIOD_LABEL[sec.period]} aria-label={`New name for ${labels[sec.period]}`} autocomplete="off" />
        <button type="submit" class="small" disabled={busy}>Save</button>
        <button type="button" class="ghost small" onclick={() => (renaming = null)}>Cancel</button>
      </form>
    {:else}
      <h4 class="m-0 text-[.95rem]">{labels[sec.period]} <span class="note">· {sec.items.length}</span>
        <button type="button" class="ghost small ml-1" disabled={busy} aria-label={`Rename ${labels[sec.period]}`} onclick={() => { newName = labels[sec.period]; renaming = sec.period; }}>Rename</button></h4>
    {/if}
    {#if person !== null && sec.items.length > 0}<BonusEditor {person} {name} period={sec.period} bonus={bonuses[sec.period]} {busy} {send} {labels} />{/if}
  </div>
  {#each sec.items as c (c.id)}
    {@const inline = openId === c.id && !narrow}
    <div class="grid {COLS_PHONE} {COLS} items-center gap-x-2 gap-y-2 py-2 [border-bottom:1px_solid_var(--border)] {isPast(c) ? 'opacity-70' : ''}">
      <input class="m-0 col-span-2 min-[56rem]:col-span-1 font-medium" value={c.title} data-v={c.title} maxlength="80" aria-label="Chore" autocomplete="off" onchange={(e) => setTitle(c, e)} />
      <select class="m-0" value={c.period} data-v={c.period} aria-label={`Time of day for ${c.title}`} onchange={(e) => keep(e, patch(c, { period: e.currentTarget.value }))}>
        {#each PERIODS as p (p)}<option value={p}>{labels[p]}</option>{/each}
      </select>
      {#if c.onceDate !== null}
        <div class="col-span-2 min-[56rem]:col-span-7 max-[56rem]:order-last flex flex-wrap items-center gap-x-2 gap-y-1">
          <span class="note">Just once · {dayLabel(c.onceDate, day)}{isPast(c) ? ' (past)' : ''}</span>
          {#if isPast(c)}
            <span class="note">Do again:</span>
            <button type="button" class="ghost small m-0" disabled={busy} aria-label={`Do ${c.title} today`} onclick={() => reuse(c, day)}>Today</button>
            <button type="button" class="ghost small m-0" disabled={busy} aria-label={`Do ${c.title} tomorrow`} onclick={() => reuse(c, addDays(day, 1))}>Tomorrow</button>
          {/if}
        </div>
      {:else}
        <DayChips class="col-span-2 grid grid-cols-7 gap-1 max-[56rem]:order-last min-[56rem]:contents" chip="[&&&]:w-full [&&&]:px-0 [&&&]:min-h-9" letters days={c.days ?? EVERY_DAY} disabled={busy} label={`Days for ${c.title}${c.everyWeeks > 1 ? `, every ${c.everyWeeks} weeks` : ''}`} onflip={(w) => setDay(c, w)} />
      {/if}
      {#if person === null}
        <span class="note text-center" title="Chores for Anyone earn no points">No points</span>
      {:else}
        <Stepper class="w-[9.25rem]" value={c.points} min={0} max={100} label={`Points for ${c.title}`} onchange={(n) => patch(c, { points: n })} />
      {/if}
      <div class="flex items-center justify-end gap-1 max-[56rem]:col-span-2 max-[56rem]:order-last">
        {#if c.due}
          <!-- Skipping hides a chore for today only; it is back on its normal schedule tomorrow. Removing for good is under More. -->
          <button type="button" class="ghost small m-0" disabled={busy || openId !== null} aria-label={c.skipped ? `Put ${c.title} back on today's list` : `Skip ${c.title} today`} onclick={() => (c.skipped ? send({ action: 'item_skip', id: c.id, skipped: false }) : skip(c))}>{c.skipped ? 'Put back' : 'Skip'}</button>
        {/if}
        <button type="button" id={`edit-chore-${c.id}`} class="ghost small m-0" disabled={busy || openId !== null} aria-label={`More for ${c.title}: repeat, date, remove`} onclick={() => (openId = c.id)}>More</button>
      </div>
      {#if inline}
        <CenteredPopover label={`Edit ${c.title}`} width={26} onclose={closeEdit}><ItemEditor {c} {day} {busy} {send} {labels} earns={person !== null} onremove={() => gone(c)} onclose={closeEdit} /></CenteredPopover>
      {/if}
    </div>
  {/each}
  <InlineAddChore {person} period={sec.period} label={labels[sec.period]} {day} {busy} send={sendAdd} />
{/each}

{#if narrow && openItem}
  <Sheet title={`Edit ${openItem.title}`} onclose={closeEdit}>
    <ItemEditor c={openItem} {day} {busy} {send} {labels} earns={person !== null} onremove={() => gone(openItem)} onclose={closeEdit} />
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

<div class="h-20 md:hidden" aria-hidden="true"></div>

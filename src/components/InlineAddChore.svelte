<script lang="ts">
  import CenteredPopover from './CenteredPopover.svelte';
  import DayChips from './DayChips.svelte';
  import OptionalToggle from './OptionalToggle.svelte';
  import RepeatOptions from './RepeatOptions.svelte';
  import Stepper from './Stepper.svelte';
  import { readAddDefaults, ScheduleDraft } from '../lib/addChoreDraft.svelte';
  import { flipDay, type Period } from '../lib/choreTypes';

  /**
   * A quick add under a time of day: type a name and press Enter. Points start at the last used in the full form (else 1), and the schedule is
   * every day, just once, or a repeat. Points and schedule stay as set for the next chore, so a run of similar ones needs no re-picking.
   */
  let { person, period, label, day, busy, send }: { person: string | null; period: Period; label: string; day: string; busy: boolean; send: (payload: Record<string, unknown>) => Promise<boolean> } = $props();

  let title = $state('');
  let points = $state(1);
  $effect(() => { points = readAddDefaults().points ?? 1; }); // read once on the client; storage is not reactive
  /** Every day needs nothing more; a single day or a custom repeat shows the date or weekdays. */
  const MODES = [['daily', 'Daily'], ['once', 'Once'], ['repeat', 'Repeat']] as const;
  let mode = $state<(typeof MODES)[number][0]>('daily');
  // svelte-ignore state_referenced_locally
  const draft = new ScheduleDraft(day);
  let more = $state(false);
  function pick(m: typeof mode) {
    mode = m;
    more = false;
    draft.once = m === 'once';
    if (m === 'daily') draft.resetRepeat();
  }
  let input = $state<HTMLInputElement>();

  async function add(e: SubmitEvent) {
    e.preventDefault();
    const t = title.trim();
    if (!t || busy) return;
    if (await send({ action: 'item_add', person, title: t, points: person === null ? 0 : points, period, optional: draft.optional, ...draft.schedule })) { title = ''; input?.focus(); } // stays focused for the next one
  }
</script>

<form class="grid gap-2 py-2" onsubmit={add}>
  <div class="flex flex-wrap items-center gap-2">
    <input class="m-0 min-w-[10rem] flex-[1_1_12rem]" bind:this={input} bind:value={title} maxlength="80" placeholder={`Add to ${label.toLowerCase()}`} aria-label={`New ${label.toLowerCase()} chore`} autocomplete="off" autocapitalize="sentences" enterkeyhint="done" />
    {#if mode === 'once'}
      <input class="m-0 w-auto" type="date" bind:value={draft.date} required aria-label={`Date for the new ${label.toLowerCase()} chore`} />
    {:else if mode === 'repeat'}
      <DayChips class="flex gap-2" chip="[&&&]:w-[2.1rem] [&&&]:px-0 [&&&]:min-h-9 [&&&]:shrink-0" letters days={draft.days} label={`Days for the new ${label.toLowerCase()} chore`} onflip={(w) => (draft.days = flipDay(draft.days, w))} />
    {/if}
    {#if person !== null}<Stepper class="w-[9rem]" bind:value={points} min={0} max={100} label={`Points for the new ${label.toLowerCase()} chore`} />{/if}
    {#if mode === 'repeat'}
      <button type="button" class="ghost small m-0" aria-expanded={more} aria-haspopup="dialog" onclick={() => (more = !more)}>More</button>
    {/if}
    <div class="seg-group [&&&]:flex-none" role="group" aria-label={`Schedule for the new ${label.toLowerCase()} chore`}>
      {#each MODES as [m, text] (m)}
        <button type="button" class="seg-btn [&&&]:min-h-9 [&&&]:min-w-0 [&&&]:px-[.6rem] [&&&]:text-[.85rem]" aria-pressed={mode === m} onclick={() => pick(m)}>{text}</button>
      {/each}
    </div>
    <button type="submit" class="small m-0" disabled={busy || !title.trim()}>Add</button>
  </div>
  {#if mode === 'repeat' && more}
    <CenteredPopover label={`More repeat options for the new ${label.toLowerCase()} chore`} onclose={() => (more = false)}>
      <div class="grid gap-2">
        <RepeatOptions bind:every={draft.every} bind:from={draft.from} bind:untilDone={draft.untilDone} bind:keptPoints={draft.kept} earns={person !== null} {day} subject={`the new ${label.toLowerCase()} chore`} />
        <OptionalToggle bind:optional={draft.optional} subject={`the new ${label.toLowerCase()} chore`} />
      </div>
    </CenteredPopover>
  {/if}
</form>

<script lang="ts">
  import { onMount } from 'svelte';
  import FeatherIcon from './FeatherIcon.svelte';
  import { closedPeriods, tally, holdingLabel, lockedPoints, onToday, PERIOD_LABEL, plural, ptsLabel, PERIODS, type ChoreState } from '../lib/choreTypes';
  import type { Person } from '../lib/people';

  /** The manager's landing page: what is left to set up, what needs them now, and how everyone's day is going. */
  let { chores, people, demo = false, busy = false, send, inboxHref, go, openChores }: {
    chores: ChoreState; people: Person[]; demo?: boolean; busy?: boolean; send: (payload: Record<string, unknown>) => Promise<boolean>; inboxHref: string; go: (tab: 'chores' | 'rewards' | 'people' | 'goals') => void; openChores: (person: string) => void;
  } = $props();

  const peopleHref = demo ? '/demo/admin#people' : '/admin#people';
  const personHref = (id: string) => `${demo ? '/demo/chores' : '/chores'}/${id}`;

  const JUMPS: [Parameters<typeof go>[0], string, string, string][] = [
    ['chores', 'Chores', 'check-circle', 'Routines and schedules'], ['rewards', 'Rewards', 'award', 'Prices and screen time'],
    ['people', 'People', 'star', 'Points, screen time, allowance'], ['goals', 'Goals', 'grid', 'Household targets'],
  ];

  // --- Setting up ---
  type Step = { title: string; note: string; done: boolean; optional?: boolean; cta: string; href?: string; tab?: 'chores' | 'rewards' | 'people' };
  const steps = $derived<Step[]>([
    { title: 'Add your people', note: 'Everyone who has chores or earns points.', done: people.length > 0, cta: 'Add people', href: peopleHref },
    { title: 'Give them chores', note: 'Pick a person, then add chores with points and a time of day.', done: chores.routines.some((r) => r.items.length > 0), cta: 'Add chores', tab: 'chores' },
    { title: 'Add rewards', note: 'What points can be spent on. Screen time is a reward too: give it minutes.', done: chores.rewards.length > 0, cta: 'Add rewards', tab: 'rewards' },
    { title: 'Name the times of day', note: 'Like "Before school" and "After school". Each one locks its own points until it is finished.', done: PERIODS.some((p) => chores.periodLabels[p] !== PERIOD_LABEL[p]), optional: true, cta: 'Rename', tab: 'chores' },
    { title: 'Set a daily screen time', note: 'Free time that comes back every day, on top of what points buy.', done: Object.keys(chores.allowance).length > 0, optional: true, cta: 'Set it', tab: 'people' },
  ]);
  const required = $derived(steps.filter((s) => !s.optional));
  const doneCount = $derived(steps.filter((s) => s.done).length);
  const ready = $derived(required.every((s) => s.done));

  const HIDE_KEY = 'lantern:setup-hidden';
  let hidden = $state(false);
  onMount(() => { try { hidden = localStorage.getItem(HIDE_KEY) === '1'; } catch { /* private window: shown */ } });
  const hide = () => { hidden = true; try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* not remembered */ } };
  const showGuide = $derived(!ready || (!hidden && doneCount < steps.length));

  // --- Today ---
  const closed = $derived(closedPeriods(chores.periodHours, chores.dayMs));
  const cards = $derived(people.map((p) => {
    const items = chores.routines.filter((r) => r.person === p.id).flatMap((r) => r.items);
    const today = items.filter(onToday);
    return {
      p, total: tally(today).total, done: tally(today).done, points: chores.balances[p.id] ?? 0, held: lockedPoints(items, closed),
      holding: holdingLabel(items, chores.periodLabels, closed), minutes: chores.minutes[p.id] ?? 0, timer: chores.timers[p.id] !== undefined && chores.timers[p.id]!.endsAt > chores.now,
    };
  }));

  // --- Optional chores ticked today ---
  // On the honor system nothing waits for a manager, but a tick that was not honest can be taken back here with one tap.
  const optionalTicks = $derived(people.flatMap((p) => chores.routines.filter((r) => r.person === p.id).flatMap((r) => r.items.filter((i) => i.optional && i.done && onToday(i)).map((item) => ({ item, person: p })))));

  // --- Needs you ---
  const reached = $derived(chores.goals.filter((g) => !g.claimed && g.progress >= g.target));
  const idle = $derived(chores.routines.some((r) => r.items.length > 0) ? people.filter((p) => !chores.routines.some((r) => r.person === p.id && r.items.length > 0)) : []);
  const needs = $derived(chores.pending.length + reached.length + idle.length);
</script>

{#if showGuide}
  <section class="card" aria-labelledby="setup-h">
    <div class="flex flex-wrap items-center justify-between gap-2 mb-1">
      <h2 class="m-0" id="setup-h">{ready ? 'Finish setting up' : 'Get set up'} <span class="note">{doneCount} of {steps.length}</span></h2>
      {#if ready}<button type="button" class="ghost small" onclick={hide}>Hide</button>{/if}
    </div>
    <div class="track h-2 mb-3" role="progressbar" aria-label="Setup progress" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount}><span class="fill bg-accent" style:width={`${(doneCount / steps.length) * 100}%`}></span></div>
    <ol class="plain-list grid gap-2">
      {#each steps as s (s.title)}
        <li class="flex items-center gap-3 py-2 px-3 rounded-[var(--radius-sm)] bg-card2 {s.done ? 'opacity-70' : ''}">
          <span class="flex-none inline-flex size-7 items-center justify-center rounded-full {s.done ? 'bg-accent text-white' : 'border border-line text-muted'}" aria-hidden="true">{#if s.done}<FeatherIcon name="check" />{/if}</span>
          <span class="min-w-0 flex-1"><strong class="block">{s.title}{#if s.optional}<span class="note"> · optional</span>{/if}</strong><span class="note block">{s.note}</span></span>
          {#if !s.done || s.optional}
            {#if s.href}<a class="small inline-flex items-center rounded-full border border-accent text-accent no-underline [font-weight:650]" href={s.href}>{s.cta}</a>
            {:else if s.tab}{@const t = s.tab}<button type="button" class="small ghost" onclick={() => go(t)}>{s.done ? 'Change' : s.cta}</button>{/if}
          {/if}
        </li>
      {/each}
    </ol>
  </section>
{/if}

<section class="card" aria-labelledby="needs-h">
  <h2 class="mt-0" id="needs-h">Needs you {#if needs > 0}<span class="count-badge font-semibold bg-accent text-white" aria-label={`${needs} things`}>{needs}</span>{/if}</h2>
  {#if needs === 0}
    <p class="note m-0"><FeatherIcon name="check-circle" /> Nothing needs you right now.</p>
  {:else}
    <ul class="plain-list grid gap-2">
      {#if chores.pending.length > 0}
        <li class="flex flex-wrap items-center gap-2"><span class="min-w-0 flex-1">{plural(chores.pending.length, 'reward request')} waiting for approval</span><a class="small inline-flex items-center rounded-full border border-accent text-accent no-underline [font-weight:650]" href={inboxHref}>Open inbox</a></li>
      {/if}
      {#each reached as g (g.id)}
        <li class="flex flex-wrap items-center gap-2"><span class="min-w-0 flex-1">Goal reached: <strong>{g.name}</strong></span><button type="button" class="small ghost" onclick={() => go('goals')}>Mark as enjoyed</button></li>
      {/each}
      {#each idle as p (p.id)}
        <li class="flex flex-wrap items-center gap-2"><span class="min-w-0 flex-1"><strong>{p.name}</strong> has no chores yet</span><button type="button" class="small ghost" onclick={() => openChores(p.id)}>Add chores</button></li>
      {/each}
    </ul>
  {/if}
</section>

{#if optionalTicks.length > 0}
  <section class="card" aria-labelledby="optional-h">
    <h2 class="mt-0 mb-1" id="optional-h">Optional chores ticked today</h2>
    <p class="note mt-0 mb-2">Nothing to approve. If one was not really done (no lunch box today), take it back and the points go with it.</p>
    <ul class="plain-list">
      {#each optionalTicks as t (t.item.id)}
        <li class="list-row">
          <span class="min-w-0 flex-1 [overflow-wrap:anywhere]"><strong style:color={t.person.color}>{t.person.name}</strong>: {t.item.title}{#if t.item.points > 0}<span class="note"> · +{t.item.points}</span>{/if}</span>
          <button type="button" class="ghost small w-auto m-0" disabled={busy} aria-label={`Take back ${t.item.title} for ${t.person.name}`} onclick={() => send({ action: 'item_skip', id: t.item.id, skipped: true })}>Not really done</button>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if cards.length > 0}
  <section class="card" aria-labelledby="today-h">
    <h2 class="mt-0" id="today-h">Today</h2>
    <ul class="plain-list grid gap-3 grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]">
      {#each cards as c (c.p.id)}
        <li class="edit-card" style:--c={c.p.color}>
          <div class="flex items-center justify-between gap-2">
            <a class="font-bold text-[color:var(--c)]" href={personHref(c.p.id)}>{c.p.name}</a>
            <span class="note tabular-nums whitespace-nowrap">{c.done}/{c.total} done</span>
          </div>
          <div class="track h-2" role="progressbar" aria-label={`${c.p.name}'s chores today`} aria-valuemin={0} aria-valuemax={c.total} aria-valuenow={c.done}><span class="fill bg-[var(--c)]" style:width={c.total ? `${(c.done / c.total) * 100}%` : '0%'}></span></div>
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="pill"><FeatherIcon name="star" /> {ptsLabel(c.points)}</span>
            {#if c.minutes > 0 || c.timer}<span class="pill"><FeatherIcon name="clock" /> {c.minutes} min{#if c.timer} · running{/if}</span>{/if}
          </div>
          {#if c.holding}<p class="note m-0"><FeatherIcon name="lock" /> {ptsLabel(c.held)} held until {c.holding} {c.holding.includes(' and ') ? 'are' : 'is'} done</p>{/if}
          <div class="flex flex-wrap justify-end gap-2">
            <button type="button" class="ghost small" onclick={() => openChores(c.p.id)}>Chores</button>
            <button type="button" class="ghost small" onclick={() => go('people')}>Points and time</button>
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<section class="card" aria-labelledby="go-h">
  <h2 class="mt-0" id="go-h">Jump to</h2>
  <ul class="plain-list grid gap-2 grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">
    {#each JUMPS as [tab, label, icon, note] (tab)}
      <li><button type="button" class="ghost w-full text-left grid gap-1 [&&]:m-0 [&&]:h-auto [&&]:py-3" onclick={() => go(tab)}><span class="inline-flex items-center gap-2 font-bold"><FeatherIcon name={icon} /> {label}</span><span class="note font-normal">{note}</span></button></li>
    {/each}
  </ul>
</section>

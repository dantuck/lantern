<script lang="ts">
  import { flushSync, tick } from 'svelte';
  import Masonry from './Masonry.svelte';
  import Sheet from './Sheet.svelte';
  import RoutineEditor from './RoutineEditor.svelte';
  import ConfirmButton from './ConfirmButton.svelte';
  import Stepper from './Stepper.svelte';
  import AllowanceForm from './AllowanceForm.svelte';
  import Disclosure from './Disclosure.svelte';
  import CostCalculator from './CostCalculator.svelte';
  import FeatherIcon from './FeatherIcon.svelte';
  import Switch from './Switch.svelte';
  import ManageOverview from './ManageOverview.svelte';
  import { toggleIn } from '../lib/arrays';
  import { clockOf, closedPeriods, HOURS_PERIODS, minuteOf, holdingLabel, LEDGER_LABEL, lockedPoints, MAX_PERIOD_LABEL, ownerKey, PERIOD_LABEL, PERIODS, periodRecord, ptsLabel, type ChoreItem, type ChoreState, type LedgerEntry, type Period, type Reward } from '../lib/choreTypes';
  import { chorePipe } from '../lib/chorePipe.svelte';
  import type { Person } from '../lib/people';

  let { initial, people, demo = false }: { initial: ChoreState; people: Person[]; demo?: boolean } = $props();

  // svelte-ignore state_referenced_locally
  let choreState = $state<ChoreState>(initial);
  // svelte-ignore state_referenced_locally
  const pipe = chorePipe(() => choreState, (s) => (choreState = s), demo);
  const busy = $derived(pipe.busy);
  const error = $derived(pipe.error);

  /** After a card closes, puts focus back on the button that opened it, so keyboard and screen-reader users keep their place. */
  const focusBack = async (id: string) => { await tick(); document.getElementById(id)?.focus(); };

  const TABS = [['overview', 'Overview'], ['chores', 'Chores'], ['rewards', 'Rewards'], ['people', 'People'], ['goals', 'Goals']] as const;
  type Tab = (typeof TABS)[number][0];
  /** Which section is on show. The address keeps it (#rewards), so links and reloads land on the same section. */
  let tab = $state<Tab>('overview');
  $effect(() => {
    const fromAddress = () => { const h = location.hash.slice(1) === 'points' ? 'people' : location.hash.slice(1); if (TABS.some(([id]) => id === h)) tab = h as Tab; };
    fromAddress();
    addEventListener('hashchange', fromAddress);
    return () => removeEventListener('hashchange', fromAddress);
  });
  /** Switches section with a cross-fade where the browser supports view transitions (and the person has not asked for less motion). */
  const swap = (t: Tab) => {
    if (typeof document.startViewTransition === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(() => flushSync(() => { tab = t; }));
    else tab = t;
  };
  const show = (t: Tab) => { swap(t); try { window.history.replaceState(null, '', `#${t}`); } catch { /* the section still changes */ } };

  const nameOf = (id: string | null) => (id ? people.find((p) => p.id === id)?.name ?? 'Unknown' : 'Anyone');

  const send = pipe.send;

  /** The people to manage chores for: each person, "Anyone", and anyone with chores who has since left the household. */
  const owners = $derived([
    ...people.map((p) => ({ id: p.id as string | null, name: p.name, color: p.color })),
    { id: null as string | null, name: 'Anyone', color: 'var(--accent)' },
    ...choreState.routines.filter((r) => r.person && !people.some((p) => p.id === r.person)).map((r) => ({ id: r.person, name: nameOf(r.person), color: 'var(--muted)' })),
  ]);
  /** Filters the people by name, or by a chore title (a match opens that person so the chore is in view). */
  let query = $state('');
  const q = $derived(query.trim().toLowerCase());
  const matches = (o: { id: string | null; name: string }) => !q || o.name.toLowerCase().includes(q) || itemsOf(o.id).some((c) => c.title.toLowerCase().includes(q));
  const shown = $derived(owners.filter(matches));
  /** The one person whose routine is on show, by id ("anyone" for no one). Empty until someone is picked, and again if the filter hides them. */
  let picked = $state('');
  // Kept for this tab's session so a refresh (or the page's own live update) lands on the same person.
  const PICKED_KEY = 'chore-manage-picked';
  let pickedLoaded = false; // not reactive: only gates the first write until the saved choice has been read
  $effect(() => {
    try { picked = sessionStorage.getItem(PICKED_KEY) ?? ''; } catch { /* nothing remembered */ }
    pickedLoaded = true;
  });
  $effect(() => {
    const p = picked;
    if (!pickedLoaded) return;
    try { sessionStorage.setItem(PICKED_KEY, p); } catch { /* not remembered */ }
  });
  const current = $derived(shown.find((o) => ownerKey(o.id) === picked));
  const itemsOf = (id: string | null): ChoreItem[] => choreState.routines.find((r) => r.person === id)?.items ?? [];
  /** Why a person's points are held back right now, or '' when none are. */
  const closed = $derived(closedPeriods(choreState.periodHours, choreState.dayMs));
  const holdingFor = (id: string) => holdingLabel(itemsOf(id), choreState.periodLabels, closed);
  const heldFor = (id: string) => lockedPoints(itemsOf(id), closed);
  const bonusesOf = (id: string | null) => choreState.routines.find((r) => r.person === id)?.bonuses ?? periodRecord(0);

  /** The names of the times of day as typed; saved with "Save names". A blank name goes back to the built-in one. */
  // svelte-ignore state_referenced_locally
  let names = $state<Record<Period, string>>({ ...initial.periodLabels });
  const namesChanged = $derived(PERIODS.some((p) => names[p].trim() !== choreState.periodLabels[p]));
  async function saveNames(e: SubmitEvent) {
    e.preventDefault();
    await send({ action: 'period_labels_set', labels: Object.fromEntries(PERIODS.map((p) => [p, names[p].trim()])) });
  }

  /** The hours of the times of day as typed (HH:MM, which is what a time field holds); saved with "Save hours". Midnight as an end means the end of the day. */
  // svelte-ignore state_referenced_locally
  let hours = $state(Object.fromEntries(HOURS_PERIODS.map((p) => [p, { from: clockOf(initial.periodHours[p]!.from), to: clockOf(initial.periodHours[p]!.to) }])) as Record<string, { from: string; to: string }>);
  const hoursValid = $derived(HOURS_PERIODS.every((p) => hours[p]!.from !== '' && hours[p]!.to !== '' && minuteOf(hours[p]!.to, true) > minuteOf(hours[p]!.from)));
  const hoursChanged = $derived(HOURS_PERIODS.some((p) => minuteOf(hours[p]!.from) !== choreState.periodHours[p]!.from || minuteOf(hours[p]!.to, true) !== choreState.periodHours[p]!.to));
  async function saveHours(e: SubmitEvent) {
    e.preventDefault();
    await send({ action: 'period_hours_set', hours: Object.fromEntries(HOURS_PERIODS.map((p) => [p, { from: minuteOf(hours[p]!.from), to: minuteOf(hours[p]!.to, true) }])) });
  }

  /** Who a reward's scope lets ask: everyone, or the people picked. */
  function scopeLabel(ids: string[] | null): string {
    if (ids === null) return 'Anyone can ask';
    const names = ids.map((id) => nameOf(id));
    return names.length > 0 ? `Only ${names.join(', ')}` : 'Nobody can ask yet (pick someone)';
  }

  /** The reward being added or edited in the sheet, as a draft that only saves on "Save" (`id` is set when editing). */
  type RewardDraft = { id?: string; name: string; description: string; cost: number; minutes: number; people: string[] | null; hidden: boolean };
  let rewardDraft = $state<RewardDraft | null>(null);
  const newReward = (): RewardDraft => ({ name: '', description: '', cost: 10, minutes: 0, people: null, hidden: false });
  const editReward = (r: Reward): RewardDraft => ({ id: r.id, name: r.name, description: r.description, cost: r.cost, minutes: r.minutes, people: r.people && [...r.people], hidden: r.hidden });
  const closeReward = () => { const id = rewardDraft?.id; rewardDraft = null; void focusBack(id ? `edit-reward-${id}` : 'add-reward'); };
  const dropReward = () => { const id = rewardDraft?.id; rewardDraft = null; if (id) void send({ action: 'reward_remove', id }); };
  async function saveRewardDraft(e: SubmitEvent) {
    e.preventDefault();
    const d = rewardDraft;
    if (!d || d.name.trim() === '') return;
    if (await send({ action: 'reward_save', ...(d.id ? { id: d.id } : {}), name: d.name.trim(), description: d.description.trim(), cost: d.cost, minutes: d.minutes, people: d.people, hidden: d.hidden })) closeReward();
  }

  /** The goal being added or edited in the sheet, as a draft that only saves on "Save" (`id` is set when editing; a claimed goal cannot change). */
  type GoalDraft = { id?: string; name: string; target: number; claimed: boolean };
  let goalDraft = $state<GoalDraft | null>(null);
  const closeGoal = () => { const id = goalDraft?.id; goalDraft = null; void focusBack(id ? `edit-goal-${id}` : 'add-goal'); };
  const dropGoal = () => { const id = goalDraft?.id; goalDraft = null; if (id) void send({ action: 'goal_remove', id }); };
  async function saveGoalDraft(e: SubmitEvent) {
    e.preventDefault();
    const d = goalDraft;
    if (!d || d.claimed || d.name.trim() === '') return;
    if (await send({ action: 'goal_save', ...(d.id ? { id: d.id } : {}), name: d.name.trim(), target: d.target })) closeGoal();
  }

  /** The person whose points or screen time is being adjusted; empty until "Adjust" is tapped on their card. */
  let adjPerson = $state('');
  let adjDelta = $state(5);
  let adjNote = $state('');
  const adjName = $derived(people.find((p) => p.id === adjPerson)?.name ?? '');

  let timeDelta = $state(15);
  /** What the open card adjusts: points, or minutes of screen time. */
  let adjKind = $state<'points' | 'time'>('points');
  /** Gives or takes points or screen-time minutes for the chosen person; the reason is cleared once it saves. */
  const delta = $derived(adjKind === 'points' ? adjDelta : timeDelta);
  async function adjust(e: SubmitEvent) {
    e.preventDefault();
    if (adjPerson && (await send({ action: adjKind === 'points' ? 'adjust' : 'adjust_time', person: adjPerson, delta, note: adjNote.trim() }))) { const id = adjPerson; adjNote = ''; adjPerson = ''; void focusBack(`adjust-${id}`); }
  }
  const giveLabel = (n: number, unit: string) => (n < 0 ? `Take ${-n} ${unit} from ${adjName}` : `Give ${n} ${unit} to ${adjName}`);

  /** Only the latest few point changes show until "Show all". */
  const RECENT_SHORT = 5;
  let showAllRecent = $state(false);
  const recentCount = $derived(choreState.recent.length);

  /** "Today", "Yesterday" or "Mon, Oct 20" for a point-history entry. */
  function dayLabel(at: number): string {
    const d = new Date(at), now = new Date(), y = new Date(now);
    y.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return 'Today';
    if (d.toDateString() === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  const timeOf = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  /** The recent point changes (newest first) grouped under their day. */
  const history = $derived.by(() => {
    const out: { label: string; entries: LedgerEntry[] }[] = [];
    for (const e of choreState.recent) {
      const label = dayLabel(e.at), last = out[out.length - 1];
      if (last && last.label === label) last.entries.push(e); else out.push({ label, entries: [e] });
    }
    return out;
  });
  const shownHistory = $derived.by(() => {
    if (showAllRecent) return history;
    let left = RECENT_SHORT;
    const out: typeof history = [];
    for (const g of history) { if (left <= 0) break; out.push({ label: g.label, entries: g.entries.slice(0, left) }); left -= g.entries.length; }
    return out;
  });
</script>

{#snippet help(id: string, text: string)}
  <Disclosure id={`help-${id}`} summary="How this works" class="mb-3"><p class="note mt-1 mb-0">{text}</p></Disclosure>
{/snippet}

{#if error}<p class="notice error sticky top-2 z-30" role="alert">{error}</p>{/if}
{#key pipe.saved}{#if pipe.saved > 0 && !error}<p class="notice toast" role="status">Saved</p>{/if}{/key}

<nav class="sticky top-0 z-20 pt-2 pb-2 bg-bg" aria-label="Manage sections">
  <div class="seg-group w-full max-[40rem]:flex min-[40rem]:w-auto overflow-x-auto">
    {#each TABS as [id, label] (id)}
      <button type="button" class="seg-btn [&[aria-current=true]]:bg-card [&[aria-current=true]]:text-accent [&[aria-current=true]]:shadow-[var(--shadow-sm)]" aria-current={tab === id ? 'true' : undefined} onclick={() => show(id)}>{label}</button>
    {/each}
  </div>
</nav>

{#if tab === 'overview'}
<div id="overview" class="grid gap-0">
  <ManageOverview chores={choreState} {people} {demo} {busy} {send} inboxHref={demo ? '/demo/inbox' : '/inbox'} go={show} openChores={(id) => { picked = ownerKey(id); show('chores'); }} />
</div>
{/if}

{#if tab === 'goals'}
<section class="card" id="goals">
  <div class="flex items-center justify-between gap-2 mb-1">
    <h2 class="m-0">Household goals</h2>
    <button type="button" id="add-goal" class="small" aria-haspopup="dialog" onclick={() => (goalDraft = { name: '', target: 100, claimed: false })}>+ Add goal</button>
  </div>
  {@render help('goals', 'A target everyone works toward together. Every point anyone earns counts, and spending points on personal rewards does not lower it. When a goal is reached, treat the household, then mark it as enjoyed.')}
  {#if choreState.goals.length === 0}<p class="note">No goals yet. Set a target the whole household works toward, like a family pizza night.</p>{/if}
  <ul class="plain-list grid gap-3 grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]">
    {#each choreState.goals as g (g.id)}

          <li class="edit-card [&&]:m-0 [&&]:content-between">
            <div class="flex items-start justify-between gap-2">
              <strong class="min-w-0 break-words">{g.name}</strong>
              <button type="button" id={`edit-goal-${g.id}`} class="small m-0 flex-none pointer-coarse:min-h-11 pointer-coarse:px-5" disabled={busy} aria-haspopup="dialog" aria-label={`Edit ${g.name}`} onclick={() => (goalDraft = { id: g.id, name: g.name, target: g.target, claimed: g.claimed })}>Edit</button>
            </div>
            <div class="track h-2 [&&]:bg-line" role="img" aria-label={`${g.progress} of ${g.target} points`}><span class="fill bg-accent" style:width={`${Math.min(100, (g.progress / g.target) * 100)}%`}></span></div>
            <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              {#if g.progress >= g.target}<span class="font-semibold text-accent whitespace-nowrap"><FeatherIcon name="star" /> Goal reached</span>
              {:else}<span class="note whitespace-nowrap"><FeatherIcon name="star" /> {g.progress} of {ptsLabel(g.target)} · {Math.floor((g.progress / g.target) * 100)}%</span>{/if}
              {#if g.claimed}<span class="pill">Enjoyed</span>
              {:else if g.progress >= g.target}<button type="button" class="small" disabled={busy} onclick={() => send({ action: 'goal_claim', id: g.id })}>Mark as enjoyed</button>{/if}
            </div>
          </li>
    {/each}
  </ul>
</section>
{/if}

{#if tab === 'chores'}
<section class="card" id="chores">
  <h2 class="mt-0">Chores</h2>
  <p class="note mt-0 mb-3">One routine for each person, split by time of day. Each chore has its own days, or can be a one-off. Chores are ticked off on the Chores page and start fresh every day they are scheduled. The all-done bonus is paid when every chore due in that time of day is ticked.</p>

  <Disclosure id="period-names" summary="Rename the times of day" class="mb-3">
    <form class="grid gap-3 mt-2 max-w-[34rem]" onsubmit={saveNames}>
      <p class="note m-0">Call them what suits your household, like "Before school" and "After school". Leave one blank for the usual name. Points earned in a time of day can be spent once every chore in it is done.</p>
      <div class="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-2">
        {#each PERIODS as p (p)}
          <label class="cap-field">{PERIOD_LABEL[p]} <input class="m-0" bind:value={names[p]} maxlength={MAX_PERIOD_LABEL} placeholder={PERIOD_LABEL[p]} autocomplete="off" /></label>
        {/each}
      </div>
      <span class="flex justify-end gap-2">
        <button type="submit" class="small" disabled={busy || !namesChanged}>Save names</button>
      </span>
    </form>
  </Disclosure>

  <Disclosure id="period-hours" summary="Set the hours of the times of day" class="mb-3">
    <form class="grid gap-3 mt-2 max-w-[34rem]" onsubmit={saveHours}>
      <p class="note m-0">Chores can be ticked only during their time of day, so evening chores wait until evening and a morning that is over can no longer be ticked. Managers can tick at any time. Points a missed time of day was holding become spendable once it is over. "Any time" chores have no hours.</p>
      <div class="grid gap-2">
        {#each HOURS_PERIODS as p (p)}
          <div class="flex flex-wrap items-end gap-2">
            <span class="w-24 pb-2">{choreState.periodLabels[p]}</span>
            <label class="cap-field">From <input class="m-0" type="time" bind:value={hours[p]!.from} required /></label>
            <label class="cap-field">Until <input class="m-0" type="time" bind:value={hours[p]!.to} required /></label>
          </div>
        {/each}
      </div>
      {#if !hoursValid}<p class="note m-0" role="alert">Each time of day has to end after it starts.</p>{/if}
      <span class="flex justify-end gap-2">
        <button type="submit" class="small" disabled={busy || !hoursChanged || !hoursValid}>Save hours</button>
      </span>
    </form>
  </Disclosure>

  <label class="cap-field max-w-[22rem] mb-3">Find a person or chore <input class="m-0" type="search" bind:value={query} maxlength="80" autocomplete="off" placeholder="Name or chore" /></label>
  <div class="flex flex-wrap gap-2 mb-3" role="group" aria-label="Whose chores">
    {#each shown as o (ownerKey(o.id))}
      {@const n = itemsOf(o.id).length}
      <button type="button" class="person-chip" style:--c={o.color} aria-pressed={current !== undefined && ownerKey(current.id) === ownerKey(o.id)} onclick={() => (picked = picked === ownerKey(o.id) ? '' : ownerKey(o.id))}>
        <span class="avatar size-[1.6rem] text-[.78rem]" aria-hidden="true">{#if o.id === null}<FeatherIcon name="star" />{:else}{o.name.charAt(0).toUpperCase()}{/if}</span><span>{o.name}</span><span class="note pr-[.7rem]">{n}</span>
      </button>
    {:else}
      <p class="note m-0">Nobody or no chore matches "{query.trim()}".</p>
    {/each}
  </div>
  {#if current}
    {#key ownerKey(current.id)}
      <RoutineEditor person={current.id} name={current.name} color={current.color} others={owners.filter((o) => ownerKey(o.id) !== ownerKey(current.id) && (o.id === null || people.some((p) => p.id === o.id)))} items={itemsOf(current.id)} bonuses={bonusesOf(current.id)} day={choreState.day} {busy} {send} routines={choreState.routines} labels={choreState.periodLabels} />
    {/key}
  {:else if shown.length > 0}
    <div class="grid justify-items-center gap-1 py-8 px-4 text-center rounded-[var(--radius-sm)] border border-dashed border-line bg-card2">
      <svg class="w-40 h-auto mb-1" viewBox="0 0 160 100" fill="none" aria-hidden="true">
        <rect x="52" y="30" width="56" height="62" rx="8" fill="var(--card)" stroke="var(--border)" stroke-width="2" />
        <rect x="68" y="25" width="24" height="10" rx="4" fill="var(--accent)" />
        <g stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
          <path d="M62 48l4 4 7-8" stroke="var(--accent)" /><path d="M80 49h20" stroke="var(--border)" />
          <path d="M62 64l4 4 7-8" stroke="var(--accent)" /><path d="M80 65h20" stroke="var(--border)" />
          <circle cx="68" cy="80" r="3.5" stroke="var(--border)" /><path d="M80 81h14" stroke="var(--border)" />
        </g>
        <circle cx="26" cy="62" r="17" fill="var(--accent)" opacity=".9" /><circle cx="20" cy="58" r="2" fill="#fff" /><circle cx="32" cy="58" r="2" fill="#fff" /><path d="M19 67q7 6 14 0" stroke="#fff" stroke-width="2.5" stroke-linecap="round" />
        <circle cx="134" cy="62" r="17" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2" /><circle cx="128" cy="58" r="2" fill="var(--accent)" /><circle cx="140" cy="58" r="2" fill="var(--accent)" /><path d="M127 67q7 6 14 0" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" />
        <circle cx="36" cy="26" r="11" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="2" /><circle cx="32" cy="24" r="1.5" fill="var(--accent)" /><circle cx="40" cy="24" r="1.5" fill="var(--accent)" /><path d="M31 30q5 4 10 0" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" />
        <path d="M122 18v10M117 23h10M146 34v6M143 37h6" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" />
      </svg>
      <strong class="text-[1.1rem]">Whose chores are we tidying up?</strong>
      <span class="note">Tap a name above to light up their routine.</span>
    </div>
  {/if}
</section>
{/if}

{#snippet drawerFooter(form: string, saveLabel: string, cannotSave: boolean, close: () => void, remove: (() => void) | undefined, removeLabel: string)}
  <div class="flex flex-wrap items-center justify-between gap-2">
    {#if remove}<ConfirmButton ariaLabel={removeLabel} disabled={busy} onconfirm={remove} />{/if}
    <span class="flex gap-2 ml-auto">
      <button type="button" class="ghost small" onclick={close}>Cancel</button>
      <button type="submit" {form} class="small" disabled={busy || cannotSave}>{saveLabel}</button>
    </span>
  </div>
{/snippet}

{#if goalDraft}
  {@const d = goalDraft}
  <Sheet title={d.id ? `Edit ${d.name.trim() || 'goal'}` : 'Add a goal'} drawer onclose={closeGoal}>
    <form id="goal-form" class="grid gap-3" onsubmit={saveGoalDraft}>
      <input class="m-0" bind:value={d.name} maxlength="60" placeholder="Goal, e.g. Family pizza night" aria-label="Goal" autocomplete="off" disabled={d.claimed} />
      <Stepper caption="Target points" bind:value={d.target} min={1} max={1000000} step={10} label="Target in points" />
    </form>
    {#snippet footer()}{@render drawerFooter('goal-form', d.id ? 'Save' : 'Add goal', d.claimed || d.name.trim() === '', closeGoal, d.id ? dropGoal : undefined, `Remove ${d.name.trim() || 'goal'}`)}{/snippet}
  </Sheet>
{/if}

{#snippet scope(ids: string[] | null, set: (ids: string[] | null) => void)}
  <div class="grid gap-2 flex-[1_1_100%]" role="group" aria-label="Who can ask">
    <span class="cap">Who can ask</span>
    <div class="seg-group justify-self-start max-[40rem]:justify-self-stretch">
      <button type="button" class="seg-btn" aria-pressed={ids === null} onclick={() => set(null)}>Everyone</button>
      <button type="button" class="seg-btn" aria-pressed={ids !== null} onclick={() => set(ids ?? [])}>Specific people</button>
    </div>
    {#if ids !== null}
      <div class="flex flex-wrap gap-2">
        {#each people as p (p.id)}
          {@const on = ids.includes(p.id)}
          <button type="button" class="person-chip {on ? '' : 'opacity-60'}" style:--c={p.color} aria-pressed={on} onclick={() => set(toggleIn(ids ?? [], p.id))}>
            <span class="avatar size-[1.6rem] text-[.78rem]" aria-hidden="true">{p.name.charAt(0).toUpperCase()}</span><span class="pr-[.7rem]">{p.name}</span>
          </button>
        {:else}
          <p class="note m-0">Add your household first.</p>
        {/each}
      </div>
      {#if ids.length === 0 && people.length > 0}<p class="note m-0">Pick at least one person, or nobody can ask.</p>{/if}
    {/if}
  </div>
{/snippet}

{#if tab === 'rewards'}
<section class="card" id="rewards">
  <div class="flex items-center justify-between gap-2 mb-1">
    <h2 class="m-0">Rewards</h2>
    <button type="button" id="add-reward" class="small" aria-haspopup="dialog" onclick={() => (rewardDraft = newReward())}>+ Add reward</button>
  </div>
  {@render help('rewards', 'What points can be spent on. Anyone can get a reward they can afford, unless you limit it to certain people, in which case only they see it. A reward with screen time is given at once, with nothing for you to approve; any other reward waits in the inbox, and nothing is deducted until you approve it. Points earned in a time of day (like before school) can only be spent once every chore in it is done.')}
  {#if choreState.rewards.length === 0}<p class="note">No rewards yet. Add something points can be spent on, like a movie night pick or extra screen time.</p>{/if}
  <ul class="plain-list grid gap-3 grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]">
    {#each choreState.rewards as r (r.id)}

          <li class="edit-card [&&]:m-0 !grid-cols-[minmax(0,1fr)_auto] items-center" class:opacity-60={r.hidden}>
            <div class="min-w-0">
              <strong class="break-words">{r.name}</strong>{#if r.hidden}<span class="note"> · Hidden</span>{/if}
              {#if r.description}<div class="note break-words">{r.description}</div>{/if}
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                <span class="note whitespace-nowrap"><FeatherIcon name="star" /> {ptsLabel(r.cost)}</span>
                {#if r.minutes > 0}<span class="pill"><FeatherIcon name="clock" /> +{r.minutes} min<span class="sr-only"> of screen time</span></span>{/if}
                <span class="note whitespace-nowrap">{r.minutes > 0 ? 'Given at once' : 'Needs your approval'}</span>
              </div>
              <div class="note">{scopeLabel(r.people)}</div>
            </div>
            <button type="button" id={`edit-reward-${r.id}`} class="small m-0 pointer-coarse:min-h-11 pointer-coarse:px-5" disabled={busy} aria-haspopup="dialog" aria-label={`Edit ${r.name}`} onclick={() => (rewardDraft = editReward(r))}>Edit</button>
          </li>
    {/each}
  </ul>
</section>
{/if}

{#if rewardDraft}
  {@const d = rewardDraft}
  <Sheet title={d.id ? `Edit ${d.name.trim() || 'reward'}` : 'Add a reward'} drawer onclose={closeReward}>
    <form id="reward-form" class="grid gap-3" novalidate onsubmit={saveRewardDraft}>
      <input class="m-0" bind:value={d.name} maxlength="60" placeholder="Reward, e.g. Movie night pick" aria-label="Reward" autocomplete="off" />
      <input class="m-0" bind:value={d.description} maxlength="200" placeholder="Description (optional)" aria-label="Description" autocomplete="off" />
      <Stepper caption="Cost (points)" bind:value={d.cost} min={1} max={100000} label="Cost in points" />
      <div title="Minutes of screen time it gives at once (0 for none)"><Stepper caption="Screen time it gives (min)" presets={[15, 30, 60]} bind:value={d.minutes} min={0} max={1440} step={5} label="Screen time minutes it gives (0 for none)" /></div>
    </form>
    <div class="grid gap-3 mt-3">
      <!-- Outside the form: a way to suggest a cost must never get in the way of saving. -->
      <CostCalculator routines={choreState.routines} {people} rewards={choreState.rewards} skip={d.id} minutes={d.minutes} cost={d.cost} apply={(n) => (d.cost = n)} />
      {@render scope(d.people, (ids) => (d.people = ids))}
      {#if d.id}
        <div class="flex items-center justify-between gap-3 pointer-coarse:min-h-11">
          <span id="reward-hidden">Hidden<span class="note block">Nobody can ask for it while it's on</span></span>
          <Switch checked={d.hidden} labelledby="reward-hidden" onchange={(on) => (d.hidden = on)} />
        </div>
      {/if}
    </div>
    {#snippet footer()}{@render drawerFooter('reward-form', d.id ? 'Save' : 'Add reward', d.name.trim() === '', closeReward, d.id ? dropReward : undefined, `Remove ${d.name.trim() || 'reward'}`)}{/snippet}
  </Sheet>
{/if}

{#if tab === 'people'}
<section class="card" id="people">
  <h2 class="mt-0">People</h2>
  {#if people.length === 0}
    <p class="note">Add the people in your household first, then you can hand out points. <a href={demo ? '/demo/admin#people' : '/admin#people'}>Add people</a>.</p>
  {:else}
    <Masonry items={people} key={(p) => p.id}>
      {#snippet row(p)}
        <li class="edit-card {adjPerson === p.id ? '' : '!grid-cols-[minmax(0,1fr)_auto] items-center'}" style:--c={p.color}>
          {#if adjPerson === p.id}
            <div class="flex items-center justify-between gap-2">
              <strong class="text-[color:var(--c)]">Adjust {p.name}</strong>
              <span class="note whitespace-nowrap"><FeatherIcon name="star" /> {choreState.balances[p.id] ?? 0}{#if choreState.minutes[p.id]} · <FeatherIcon name="clock" /> {choreState.minutes[p.id]} min{/if}</span>
            </div>
            <form class="grid gap-3" onsubmit={adjust}>
              <div class="seg-group justify-self-start max-[40rem]:justify-self-stretch">
                <button type="button" class="seg-btn" aria-pressed={adjKind === 'points'} onclick={() => (adjKind = 'points')}>Points</button>
                <button type="button" class="seg-btn" aria-pressed={adjKind === 'time'} onclick={() => (adjKind = 'time')}>Screen time</button>
              </div>
              <div class="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-2">
                {#if adjKind === 'points'}
                  <Stepper caption="Points" class="w-[9.75rem]" bind:value={adjDelta} min={-1000} max={1000} label="Points to add (negative to take away)" />
                {:else}
                  <Stepper caption="Minutes" presets={[15, 30, 60]} class="w-[9.75rem]" bind:value={timeDelta} min={-1440} max={1440} step={5} label="Minutes of screen time to add (negative to take away)" />
                {/if}
                <label class="cap-field">Reason <input class="m-0" bind:value={adjNote} maxlength="60" placeholder="Optional" aria-label="Reason" autocomplete="off" /></label>
              </div>
              <div class="flex flex-wrap items-center justify-end gap-2">
                <button type="button" class="ghost small" onclick={() => { adjPerson = ''; void focusBack(`adjust-${p.id}`); }}>Cancel</button>
                <button type="submit" class="small" disabled={busy || !delta}>{adjKind === 'points' ? giveLabel(adjDelta, 'points') : giveLabel(timeDelta, 'min')}</button>
              </div>
            </form>
          {:else}
            <div class="min-w-0">
              <strong class="text-[color:var(--c)]">{p.name}</strong>
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                <span class="pill"><FeatherIcon name="star" /> {ptsLabel(choreState.balances[p.id] ?? 0)}</span>
                {#if choreState.minutes[p.id]}<span class="pill"><FeatherIcon name="clock" /> {choreState.minutes[p.id]} min</span>{/if}
              </div>
              {#if holdingFor(p.id)}<p class="note m-0 mt-1"><FeatherIcon name="lock" /> {ptsLabel(heldFor(p.id))} held until {holdingFor(p.id)} {holdingFor(p.id).includes(' and ') ? 'are' : 'is'} done</p>{/if}
            </div>
            <button type="button" id={`adjust-${p.id}`} class="small m-0 pointer-coarse:min-h-11 pointer-coarse:px-5" disabled={busy || adjPerson !== ''} aria-label={`Adjust points or screen time for ${p.name}`} onclick={() => { adjPerson = p.id; adjNote = ''; }}>Adjust</button>
          {/if}
        </li>
      {/snippet}
    </Masonry>
  {/if}
  {#if people.length > 0}
    <h3 class="mt-6 mb-1 text-[1rem]">Daily screen time</h3>
    <p class="note mt-0 mb-2">Free time that comes back every day and is not saved up. It is separate from points: screen time bought with points is kept until used.</p>
    <ul class="plain-list grid gap-3 grid-cols-[repeat(auto-fill,minmax(17rem,1fr))]">
      {#each people as p (p.id)}
        <li class="edit-card" style:--c={p.color}>
          <strong class="text-[color:var(--c)]">{p.name}</strong>
          <AllowanceForm person={p.id} allowance={choreState.allowance[p.id]} buyCap={choreState.buyCap[p.id]} {busy} {send} />
        </li>
      {/each}
    </ul>
  {/if}
  {#if history.length > 0}
    <div class="flex items-center justify-between gap-2 mt-5">
      <h3 class="m-0 text-[.95rem]">Recent activity</h3>
      {#if recentCount > RECENT_SHORT}<button type="button" class="ghost small" aria-expanded={showAllRecent} onclick={() => (showAllRecent = !showAllRecent)}>{showAllRecent ? 'Show less' : `Show all ${recentCount}`}</button>{/if}
    </div>
    {#each shownHistory as day (day.label)}
      <div class="cap mt-2 mb-[.15rem]">{day.label}</div>
      <ul class="plain-list text-[.88rem]">
        {#each day.entries as e (e.id)}
          {@const who = people.find((p) => p.id === e.person)}
          <li class="flex items-baseline gap-2 py-[.2rem]" style:--c={who?.color ?? 'var(--muted)'}>
            <span class="size-2 flex-none self-center rounded-full bg-[var(--c)]" aria-hidden="true"></span>
            <span class="min-w-0 flex-1 [overflow-wrap:anywhere]"><span class="font-medium">{nameOf(e.person)}</span> <span class="note text-[.88rem]">{LEDGER_LABEL[e.kind]}{e.note ? `: ${e.note}` : ''}</span></span>
            <span class="note text-[.8rem] tabular-nums whitespace-nowrap">{timeOf(e.at)}</span>
            <strong class="w-9 text-right tabular-nums {e.delta < 0 ? 'text-danger' : 'text-accent'}">{e.delta > 0 ? '+' : ''}{e.delta}</strong>
          </li>
        {/each}
      </ul>
    {/each}
  {/if}
</section>
{/if}

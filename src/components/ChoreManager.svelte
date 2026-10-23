<script lang="ts">
  import { tick } from 'svelte';
  import Masonry from './Masonry.svelte';
  import Panel from './Panel.svelte';
  import RoutineEditor from './RoutineEditor.svelte';
  import ConfirmButton from './ConfirmButton.svelte';
  import Stepper from './Stepper.svelte';
  import { toggleIn } from '../lib/arrays';
  import { formatWhen, LEDGER_LABEL, ownerKey, periodRecord, ptsLabel, type ChoreItem, type ChoreState, type LedgerEntry, type Reward } from '../lib/choreTypes';
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

  const TABS = [['goals', 'Goals'], ['chores', 'Chores'], ['rewards', 'Rewards'], ['points', 'Points']] as const;
  type Tab = (typeof TABS)[number][0];
  /** Which section is on show. The address keeps it (#rewards), so links and reloads land on the same section. */
  let tab = $state<Tab>('chores');
  $effect(() => {
    const fromAddress = () => { const h = location.hash.slice(1); if (TABS.some(([id]) => id === h)) tab = h as Tab; };
    fromAddress();
    addEventListener('hashchange', fromAddress);
    return () => removeEventListener('hashchange', fromAddress);
  });
  const show = (t: Tab) => { tab = t; try { window.history.replaceState(null, '', `#${t}`); } catch { /* the section still changes */ } };

  /** Which "add" form is open: it opens beside the list on wide screens and in a sheet on phones. */
  let adding = $state<'goal' | 'reward' | null>(null);
  const closeAdd = (what: 'goal' | 'reward') => { adding = null; void focusBack(`add-${what}`); };

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
  const bonusesOf = (id: string | null) => choreState.routines.find((r) => r.person === id)?.bonuses ?? periodRecord(0);

  /** Who a reward's scope lets ask: everyone, or the people picked. */
  function scopeLabel(ids: string[] | null): string {
    if (ids === null) return 'Anyone can ask';
    const names = ids.map((id) => nameOf(id));
    return names.length > 0 ? `Only ${names.join(', ')}` : 'Nobody can ask yet (pick someone)';
  }

  let rewardName = $state('');
  let rewardScope = $state<string[] | null>(null);
  let rewardCost = $state(10);
  let rewardMinutes = $state(0);
  async function addReward(e: SubmitEvent) {
    e.preventDefault();
    if (await send({ action: 'reward_save', name: rewardName.trim(), cost: rewardCost, minutes: rewardMinutes, people: rewardScope })) { rewardName = ''; rewardScope = null; rewardMinutes = 0; closeAdd('reward'); }
  }

  /** The one goal or reward being edited, as a draft that only saves on "Save". Everything else stays a read-only summary. */
  type Edit = { id: string; name: string } & ({ kind: 'goal'; target: number } | { kind: 'reward'; cost: number; minutes: number; people: string[] | null; hidden: boolean });
  let edit = $state<Edit | null>(null);
  const startEdit = (r: Reward) => (edit = { kind: 'reward', id: r.id, name: r.name, cost: r.cost, minutes: r.minutes, people: r.people && [...r.people], hidden: r.hidden });
  const stopEdit = () => { if (!edit) return; const { kind, id } = edit; edit = null; void focusBack(`edit-${kind}-${id}`); };
  async function saveEdit(e: SubmitEvent) {
    e.preventDefault();
    if (!edit) return;
    const { id, name } = edit;
    const saved = await send(edit.kind === 'goal'
      ? { action: 'goal_save', id, name: name.trim(), target: edit.target }
      : { action: 'reward_save', id, name: name.trim(), cost: edit.cost, minutes: edit.minutes, people: edit.people, hidden: edit.hidden });
    if (saved) stopEdit();
  }

  let goalName = $state('');
  let goalTarget = $state(100);
  async function addGoal(e: SubmitEvent) {
    e.preventDefault();
    if (await send({ action: 'goal_save', name: goalName.trim(), target: goalTarget })) { goalName = ''; closeAdd('goal'); }
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
  <details id={`help-${id}`} class="group mb-3 text-[.9rem]">
    <summary class="flex w-fit cursor-pointer items-center gap-1 list-none text-muted min-h-8 pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden"><span class="inline-block text-[1.1rem] leading-none transition-transform group-open:rotate-90" aria-hidden="true">›</span>How this works</summary>
    <p class="note mt-1 mb-0">{text}</p>
  </details>
{/snippet}

{#if error}<p class="notice error sticky top-2 z-30" role="alert">{error}</p>{/if}
{#key pipe.saved}{#if pipe.saved > 0 && !error}<p class="notice toast" role="status">Saved</p>{/if}{/key}

{#if choreState.pending.length > 0}
  <section class="card" aria-labelledby="pending-h">
    <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
      <h2 class="m-0" id="pending-h">Waiting for approval <span class="inline-block min-w-[1.4rem] px-[.45rem] rounded-full bg-accent text-white text-[.85rem] font-semibold text-center align-middle">{choreState.pending.length}</span></h2>
      {#if choreState.pending.length > 1}<button type="button" class="small" disabled={busy} onclick={() => send({ action: 'decide_all' })}>Approve all that can be afforded</button>{/if}
    </div>
    <ul class="list-none m-0 p-0 grid gap-x-3 min-[40rem]:grid-cols-2 min-[64rem]:grid-cols-3">
      {#each choreState.pending as r (r.id)}
        {@const left = (choreState.balances[r.person] ?? 0) - r.cost}
        {@const who = people.find((p) => p.id === r.person)}
        <li class="edit-card" style:--c={who?.color ?? 'var(--muted)'}>
          <div><strong class="text-[color:var(--c)]">{nameOf(r.person)}</strong> <span class="note">asked for</span> <strong class="break-words">{r.rewardName}</strong></div>
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span class="pill"><span aria-hidden="true">★</span> {ptsLabel(r.cost)}</span>
            {#if r.minutes > 0}<span class="pill"><span aria-hidden="true">⏱</span> +{r.minutes} min<span class="sr-only"> of screen time</span></span>{/if}
          </div>
          <div class="note">{#if left < 0}<span class="text-danger">Not enough points now</span>{:else}{left} left after{/if} · {formatWhen(r.requestedAt)}</div>
          <div class="flex justify-end gap-2">
            <button type="button" class="ghost small" disabled={busy} onclick={() => send({ action: 'decide', id: r.id, approve: false })}>Deny</button>
            <button type="button" class="small" disabled={busy || left < 0} onclick={() => send({ action: 'decide', id: r.id, approve: true })}>Approve</button>
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

<nav class="sticky top-0 z-20 pt-2 pb-2 bg-bg" aria-label="Manage sections">
  <div class="seg-group w-full max-[40rem]:flex min-[40rem]:w-auto">
    {#each TABS as [id, label] (id)}
      <button type="button" class="seg-btn [&[aria-current=true]]:bg-card [&[aria-current=true]]:text-accent [&[aria-current=true]]:shadow-[var(--shadow-sm)]" aria-current={tab === id ? 'true' : undefined} onclick={() => show(id)}>{label}</button>
    {/each}
  </div>
</nav>

{#snippet editActions(removeLabel: string, remove: Record<string, unknown>, canSave: boolean)}
  <div class="flex flex-wrap items-center justify-between gap-2">
    <ConfirmButton ariaLabel={removeLabel} disabled={busy} onconfirm={() => { edit = null; send(remove); }} />
    <span class="flex gap-2">
      <button type="button" class="ghost small" onclick={stopEdit}>Cancel</button>
      <button type="submit" class="small" disabled={busy || !canSave}>Save</button>
    </span>
  </div>
{/snippet}

{#if tab === 'goals'}
<section class="card motion-safe:animate-[fade_.18s_ease-out]" id="goals">
  <div class="flex items-center justify-between gap-2 mb-1">
    <h2 class="m-0">Household goals</h2>
    <button type="button" id="add-goal" class="small" aria-expanded={adding === 'goal'} onclick={() => (adding = adding === 'goal' ? null : 'goal')}>+ Add goal</button>
  </div>
  {@render help('goals', 'A target everyone works toward together. Every point anyone earns counts, and spending points on personal rewards does not lower it. When a goal is reached, treat the household, then mark it as enjoyed.')}
  {#if adding === 'goal'}
    <Panel title="Add a goal" onclose={() => closeAdd('goal')}>{@render goalForm()}</Panel>
  {/if}
  {#if choreState.goals.length === 0}<p class="note">No goals yet. Set a target the whole household works toward, like a family pizza night.</p>{/if}
  <ul class="list-none m-0 p-0 grid gap-3 min-[40rem]:grid-cols-2 min-[64rem]:grid-cols-3 {edit ? 'items-start' : ''}">
    {#each choreState.goals as g (g.id)}

        {#if edit?.kind === 'goal' && edit.id === g.id}
          <li class="edit-card [&&]:m-0">
            <form class="grid gap-3" onsubmit={saveEdit}>
              <input class="m-0" bind:value={edit.name} maxlength="60" required aria-label="Goal" autocomplete="off" disabled={g.claimed} />
              <Stepper caption="Target points" bind:value={edit.target} min={1} max={1000000} step={10} label={`Target for ${g.name}`} />
              {@render editActions(`Remove ${g.name}`, { action: 'goal_remove', id: g.id }, !g.claimed && edit.name.trim() !== '')}
            </form>
          </li>
        {:else}
          <li class="edit-card [&&]:m-0 [&&]:content-between">
            <div class="flex items-start justify-between gap-2">
              <strong class="min-w-0 break-words">{g.name}</strong>
              <button type="button" id={`edit-goal-${g.id}`} class="small m-0 flex-none pointer-coarse:min-h-11 pointer-coarse:px-5" disabled={busy || edit !== null} aria-label={`Edit ${g.name}`} onclick={() => (edit = { kind: 'goal', id: g.id, name: g.name, target: g.target })}>Edit</button>
            </div>
            <div class="track h-2 [&&]:bg-line" role="img" aria-label={`${g.progress} of ${g.target} points`}><span class="fill bg-accent" style:width={`${Math.min(100, (g.progress / g.target) * 100)}%`}></span></div>
            <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
              {#if g.progress >= g.target}<span class="font-semibold text-accent whitespace-nowrap"><span aria-hidden="true">★</span> Goal reached</span>
              {:else}<span class="note whitespace-nowrap"><span aria-hidden="true">★</span> {g.progress} of {ptsLabel(g.target)} · {Math.floor((g.progress / g.target) * 100)}%</span>{/if}
              {#if g.claimed}<span class="pill">Enjoyed</span>
              {:else if g.progress >= g.target}<button type="button" class="small" disabled={busy} onclick={() => send({ action: 'goal_claim', id: g.id })}>Mark as enjoyed</button>{/if}
            </div>
          </li>
        {/if}
    {/each}
  </ul>
</section>
{/if}

{#if tab === 'chores'}
<section class="card motion-safe:animate-[fade_.18s_ease-out]" id="chores">
  <h2 class="mt-0">Chores</h2>
  <p class="note mt-0 mb-3">One routine for each person, split by time of day. Each chore has its own days, or can be a one-off. Chores are ticked off on the Chores page and start fresh every day they are scheduled. The all-done bonus is paid when every chore due in that time of day is ticked.</p>

  <label class="cap-field max-w-[22rem] mb-3">Find a person or chore <input class="m-0" type="search" bind:value={query} maxlength="80" autocomplete="off" placeholder="Name or chore" /></label>
  <div class="flex flex-wrap gap-2 mb-3" role="group" aria-label="Whose chores">
    {#each shown as o (ownerKey(o.id))}
      {@const n = itemsOf(o.id).length}
      <button type="button" class="person-chip" style:--c={o.color} aria-pressed={current !== undefined && ownerKey(current.id) === ownerKey(o.id)} onclick={() => (picked = picked === ownerKey(o.id) ? '' : ownerKey(o.id))}>
        <span class="avatar size-[1.6rem] text-[.78rem]" aria-hidden="true">{o.id === null ? '★' : o.name.charAt(0).toUpperCase()}</span><span>{o.name}</span><span class="note pr-[.7rem]">{n}</span>
      </button>
    {:else}
      <p class="note m-0">Nobody or no chore matches "{query.trim()}".</p>
    {/each}
  </div>
  {#if current}
    {#key ownerKey(current.id)}
      <RoutineEditor person={current.id} name={current.name} color={current.color} others={owners.filter((o) => ownerKey(o.id) !== ownerKey(current.id) && (o.id === null || people.some((p) => p.id === o.id)))} items={itemsOf(current.id)} bonuses={bonusesOf(current.id)} day={choreState.day} {busy} {send} routines={choreState.routines} />
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

{#snippet goalForm()}
  <form class="grid grid-cols-2 gap-3" onsubmit={addGoal}>
            <input class="m-0 col-span-2" bind:value={goalName} maxlength="60" required placeholder="New goal, e.g. Family pizza night" aria-label="New goal" autocomplete="off" />
            <Stepper caption="Target points" class="col-span-2" bind:value={goalTarget} min={1} max={1000000} step={10} label="Target in points" />
            <span class="col-span-2 flex justify-end gap-2">
              <button type="button" class="ghost small" onclick={() => closeAdd('goal')}>Cancel</button>
              <button type="submit" class="small" disabled={busy || !goalName.trim()}>Add goal</button>
            </span>
          </form>
{/snippet}

{#snippet rewardForm()}
  <form class="grid grid-cols-2 gap-3" onsubmit={addReward}>
            <input class="m-0 col-span-2" bind:value={rewardName} maxlength="60" required placeholder="New reward, e.g. Movie night pick" aria-label="New reward" autocomplete="off" />
            <Stepper caption="Cost (points)" bind:value={rewardCost} min={1} max={100000} label="Cost in points" />
            <Stepper caption="Screen time (min)" bind:value={rewardMinutes} min={0} max={1440} step={5} label="Screen time minutes it adds (0 for none)" />
            <div class="col-span-2">{@render scope(rewardScope, (ids) => (rewardScope = ids))}</div>
            <span class="col-span-2 flex justify-end gap-2">
              <button type="button" class="ghost small" onclick={() => closeAdd('reward')}>Cancel</button>
              <button type="submit" class="small" disabled={busy || !rewardName.trim()}>Add reward</button>
            </span>
          </form>
{/snippet}

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
<section class="card motion-safe:animate-[fade_.18s_ease-out]" id="rewards">
  <div class="flex items-center justify-between gap-2 mb-1">
    <h2 class="m-0">Rewards</h2>
    <button type="button" id="add-reward" class="small" aria-expanded={adding === 'reward'} onclick={() => (adding = adding === 'reward' ? null : 'reward')}>+ Add reward</button>
  </div>
  {@render help('rewards', 'What points can be spent on. Anyone can ask for a reward they can afford, unless you limit it to certain people, in which case only they see it; nothing is deducted until you approve it, in the waiting list at the top of this page (or on the Chores page).')}
  {#if adding === 'reward'}
    <Panel title="Add a reward" onclose={() => closeAdd('reward')}>{@render rewardForm()}</Panel>
  {/if}
  {#if choreState.rewards.length === 0}<p class="note">No rewards yet. Add something points can be spent on, like a movie night pick or extra screen time.</p>{/if}
  <ul class="list-none m-0 p-0 grid gap-3 min-[40rem]:grid-cols-2 min-[64rem]:grid-cols-3 {edit ? 'items-start' : ''}">
    {#each choreState.rewards as r (r.id)}

        {#if edit?.kind === 'reward' && edit.id === r.id}
          <li class="edit-card [&&]:m-0">
            <form class="grid gap-3" onsubmit={saveEdit}>
              <div class="grid gap-2">
                <input class="m-0" bind:value={edit.name} maxlength="60" required aria-label="Reward" autocomplete="off" />
                <div class="grid grid-cols-2 gap-2">
                  <Stepper caption="Cost (points)" bind:value={edit.cost} min={1} max={100000} label={`Cost of ${r.name}`} />
                  <div title="Minutes of screen time it adds to the bank (0 for none)"><Stepper caption="Screen time (min)" bind:value={edit.minutes} min={0} max={1440} step={5} label={`Screen time minutes for ${r.name}`} /></div>
                </div>
              </div>
              {@render scope(edit.people, (ids) => { if (edit?.kind === 'reward') edit.people = ids; })}
              <div class="flex items-center justify-between gap-3 pointer-coarse:min-h-11">
                <span id={`hide-${r.id}`}>Hidden<span class="note block">Nobody can ask for it while it's on</span></span>
                <button type="button" role="switch" aria-checked={edit.hidden} aria-labelledby={`hide-${r.id}`} class="relative box-border flex-none [&&]:m-0 [&&]:p-0 [&&]:h-7 [&&]:min-h-0 [&&]:w-12 rounded-full border-0 shadow-none transition-colors {edit.hidden ? 'bg-accent' : 'bg-line'} [&&:hover]:filter-none [&&:active]:transform-none" onclick={() => { if (edit?.kind === 'reward') edit.hidden = !edit.hidden; }}>
                  <span class="absolute top-[3px] left-[3px] size-[22px] rounded-full bg-white shadow-sm transition-transform {edit.hidden ? 'translate-x-5' : ''}"></span>
                </button>
              </div>
              {@render editActions(`Remove ${r.name}`, { action: 'reward_remove', id: r.id }, edit.name.trim() !== '')}
            </form>
          </li>
        {:else}
          <li class="edit-card [&&]:m-0 !grid-cols-[minmax(0,1fr)_auto] items-center" class:opacity-60={r.hidden}>
            <div class="min-w-0">
              <strong class="break-words">{r.name}</strong>{#if r.hidden}<span class="note"> · Hidden</span>{/if}
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                <span class="note whitespace-nowrap"><span aria-hidden="true">★</span> {ptsLabel(r.cost)}</span>
                {#if r.minutes > 0}<span class="pill"><span aria-hidden="true">⏱</span> +{r.minutes} min<span class="sr-only"> of screen time</span></span>{/if}
              </div>
              <div class="note">{scopeLabel(r.people)}</div>
            </div>
            <button type="button" id={`edit-reward-${r.id}`} class="small m-0 pointer-coarse:min-h-11 pointer-coarse:px-5" disabled={busy || edit !== null} aria-label={`Edit ${r.name}`} onclick={() => startEdit(r)}>Edit</button>
          </li>
        {/if}
    {/each}
  </ul>
</section>
{/if}

{#if tab === 'points'}
<section class="card motion-safe:animate-[fade_.18s_ease-out]" id="points">
  <h2 class="mt-0">Points</h2>
  {#if people.length === 0}
    <p class="note">Add the people in your household first, then you can hand out points. <a href={demo ? '/demo/admin#people' : '/admin#people'}>Add people</a>.</p>
  {:else}
    <Masonry items={people} key={(p) => p.id}>
      {#snippet row(p)}
        <li class="edit-card {adjPerson === p.id ? '' : '!grid-cols-[minmax(0,1fr)_auto] items-center'}" style:--c={p.color}>
          {#if adjPerson === p.id}
            <div class="flex items-center justify-between gap-2">
              <strong class="text-[color:var(--c)]">Adjust {p.name}</strong>
              <span class="note whitespace-nowrap">★ {choreState.balances[p.id] ?? 0}{#if choreState.minutes[p.id]} · ⏱ {choreState.minutes[p.id]} min{/if}</span>
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
                  <Stepper caption="Minutes" class="w-[9.75rem]" bind:value={timeDelta} min={-1440} max={1440} step={5} label="Minutes of screen time to add (negative to take away)" />
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
                <span class="pill"><span aria-hidden="true">★</span> {ptsLabel(choreState.balances[p.id] ?? 0)}</span>
                {#if choreState.minutes[p.id]}<span class="pill"><span aria-hidden="true">⏱</span> {choreState.minutes[p.id]} min</span>{/if}
              </div>
            </div>
            <button type="button" id={`adjust-${p.id}`} class="small m-0 pointer-coarse:min-h-11 pointer-coarse:px-5" disabled={busy || adjPerson !== ''} aria-label={`Adjust points or screen time for ${p.name}`} onclick={() => { adjPerson = p.id; adjNote = ''; }}>Adjust</button>
          {/if}
        </li>
      {/snippet}
    </Masonry>
  {/if}
  {#if history.length > 0}
    <div class="flex items-center justify-between gap-2 mt-5">
      <h3 class="m-0 text-[.95rem]">Recent activity</h3>
      {#if recentCount > RECENT_SHORT}<button type="button" class="ghost small" aria-expanded={showAllRecent} onclick={() => (showAllRecent = !showAllRecent)}>{showAllRecent ? 'Show less' : `Show all ${recentCount}`}</button>{/if}
    </div>
    {#each shownHistory as day (day.label)}
      <div class="cap mt-2 mb-[.15rem]">{day.label}</div>
      <ul class="list-none m-0 p-0 text-[.88rem]">
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

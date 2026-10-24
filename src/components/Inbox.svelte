<script lang="ts">
  import { formatWhen, ptsLabel, type ChoreState } from '../lib/choreTypes';
  import { chorePipe } from '../lib/chorePipe.svelte';
  import type { InboxEntry } from '../lib/inbox';
  import type { Person } from '../lib/people';

  let { initial, people, entries, seenAt, demo = false }: { initial: ChoreState; people: Person[]; entries: InboxEntry[]; seenAt: number; demo?: boolean } = $props();

  // svelte-ignore state_referenced_locally
  let choreState = $state<ChoreState>(initial);
  const pipe = chorePipe(() => choreState, (s) => (choreState = s), demo);
  const busy = $derived(pipe.busy);
  const error = $derived(pipe.error);
  const send = pipe.send;
  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? 'Unknown';
</script>

{#if error}<p class="notice error sticky top-2 z-30" role="alert">{error}</p>{/if}

<section class="card" aria-labelledby="waiting-h">
  <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
    <h2 class="m-0" id="waiting-h">Waiting for approval {#if choreState.pending.length > 0}<span class="count-badge font-semibold bg-accent text-white">{choreState.pending.length}</span>{/if}</h2>
    {#if choreState.pending.length > 1}<button type="button" class="small" disabled={busy} onclick={() => send({ action: 'decide_all' })}>Approve all that can be afforded</button>{/if}
  </div>
  {#if choreState.pending.length === 0}
    <p class="note m-0">Nothing is waiting. Reward requests show up here.</p>
  {:else}
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
  {/if}
</section>

<section class="card" aria-labelledby="activity-h">
  <h2 id="activity-h">Activity</h2>
  {#if entries.length === 0}
    <p class="note m-0">Nothing yet. Reward requests and screen time timers are listed here for two weeks.</p>
  {:else}
    <ul class="list-none m-0 p-0">
      {#each entries as e (e.id)}
        <li class="list-row">
          <span class="min-w-0 flex-1 [overflow-wrap:anywhere]">
            <a class="font-medium" href={e.path}>{e.headline}</a>{#if e.createdAt > seenAt} <span class="pill">New</span>{/if}
            <span class="note block">{e.detail} · {formatWhen(e.createdAt)}</span>
          </span>
        </li>
      {/each}
    </ul>
  {/if}
</section>

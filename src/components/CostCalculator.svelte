<script lang="ts">
  import FeatherIcon from './FeatherIcon.svelte';
  import { canAsk, daysToEarn, FAR_DAYS, plural, ptsLabel, reachLadder, reachOf, suggestedCost, typicalDailyPoints, type Reward, type Routine } from '../lib/choreTypes';
  import type { Person } from '../lib/people';

  /** Helps a manager price a reward with one tap: by how many days of chores it should take to earn, or, for screen time, by minutes per point. */
  let { routines, people, rewards, skip, minutes, cost, apply }: { routines: Routine[]; people: Person[]; rewards: Reward[]; skip?: string | undefined; minutes: number; cost: number; apply: (cost: number) => void } = $props();

  const DAYS = [1, 2, 3, 5, 7, 14];
  const RATES = [1, 2, 3, 5, 10]; // minutes of screen time for each point

  const earners = $derived(people.map((p) => ({ p, n: typicalDailyPoints(routines.find((r) => r.person === p.id)) })).filter((e) => e.n > 0));
  let who = $state(''); // a person id, or '' for the household's average
  const perDay = $derived(who ? earners.find((e) => e.p.id === who)?.n ?? 0 : earners.reduce((n, e) => n + e.n, 0) / (earners.length || 1));
  // A reward with screen time is priced by the minute; otherwise by effort. Follows the minutes until a manager picks a side.
  let picked = $state<boolean | null>(null);
  const byTime = $derived(picked ?? minutes > 0);
  const options = $derived(byTime
    ? RATES.map((r) => ({ key: r, label: `${r} min per point`, cost: suggestedCost({ minutes, minutesPerPoint: r }) }))
    : DAYS.map((d) => ({ key: d, label: d === 1 ? '1 day' : d === 7 ? '1 week' : d === 14 ? '2 weeks' : `${d} days`, cost: suggestedCost({ perDay, days: d }) })));
  /** The rewards already on offer to compare with (not the one being edited), of the same kind as the one being priced, cheapest first. */
  const others = $derived(rewards.filter((r) => r.id !== skip && (r.minutes > 0) === byTime && (!who || canAsk(r, who))));
  // What the child can reach: the ladder of quick wins to big goals, from the rewards they can already ask for (hidden ones are paused, so they do not count).
  const ladder = $derived(reachLadder(others.filter((r) => !r.hidden).map((r) => r.cost), perDay));
  const days = $derived(Math.round(daysToEarn(cost, perDay) * 10) / 10);
  const farOff = $derived(reachOf(cost, perDay) === 'far');
  /** How a reward sits against the chores: days of a typical day's points, or minutes for what it costs. */
  const sizeOf = (r: Reward) => (byTime ? `${r.minutes} min` : perDay > 0 ? `about ${Math.round((r.cost / perDay) * 10) / 10} days` : '');
  const blocked = $derived(byTime ? minutes <= 0 : earners.length === 0);
</script>

<section class="grid gap-3 rounded-[var(--radius)] border border-solid border-line bg-card2 p-3" aria-label="Help me estimate a cost">
  <div class="flex flex-wrap items-center justify-between gap-2">
    <strong>Help me estimate a cost</strong>
    <div class="seg-group max-[40rem]:w-full" role="group" aria-label="Price by">
      <button type="button" class="seg-btn" aria-pressed={!byTime} onclick={() => (picked = false)}>Effort</button>
      <button type="button" class="seg-btn" aria-pressed={byTime} onclick={() => (picked = true)}>Screen time</button>
    </div>
  </div>
  {#if blocked}
    <p class="note m-0">{byTime ? 'Set the screen time above first, then pick a rate.' : 'Give someone chores with points first, then this can work out how long a reward takes to earn.'}</p>
  {:else}
    {#if !byTime}
      <label class="cap-field">How long it should take, going by
        <select class="m-0" bind:value={who} aria-label="Whose points to go by">
          <option value="">Everyone on average</option>
          {#each earners as e (e.p.id)}<option value={e.p.id}>{e.p.name}</option>{/each}
        </select>
      </label>
      <p class="note m-0">They earn about {ptsLabel(Math.round(perDay))} on a typical day. Tap how long the reward should take to earn.</p>
    {:else}
      <p class="note m-0">For {plural(minutes, 'minute')} of screen time. Tap how many minutes each point should buy.</p>
    {/if}
    <div class="grid grid-cols-[repeat(auto-fill,minmax(7rem,1fr))] gap-2" role="group" aria-label="Suggested costs">
      {#each options as o (o.key)}
        <button type="button" class="ghost m-0 grid gap-0 justify-items-center py-2 pointer-coarse:min-h-11" aria-pressed={cost === o.cost} onclick={() => apply(o.cost)}>
          <strong><FeatherIcon name="star" /> {o.cost}</strong>
          <span class="note">{o.label}</span>
        </button>
      {/each}
    </div>
    {#if !byTime && perDay > 0}
      <div class="grid gap-2" role="group" aria-label={who ? 'What they can reach' : 'What the household can reach'}>
        <span class="cap">Always something in reach</span>
        {#each ladder as step (step.id)}
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span>{step.label} <span class="note">· within {step.within} days · {step.count === 0 ? 'none yet' : plural(step.count, 'reward')}</span></span>
            {#if step.count === 0}<button type="button" class="small m-0" aria-pressed={cost === step.cost} onclick={() => apply(step.cost)}>Make it <FeatherIcon name="star" /> {step.cost}</button>{:else}<FeatherIcon name="check" />{/if}
          </div>
        {/each}
        <p class="note m-0" class:text-danger={farOff} role="status">
          {#if farOff}At <FeatherIcon name="star" /> {cost} it takes about {days} days, which may feel out of reach. Under {FAR_DAYS} days keeps it worth saving for.
          {:else}At <FeatherIcon name="star" /> {cost} it takes about {plural(days, 'day')} of chores.{/if}
        </p>
      </div>
    {/if}
    {#if others.length > 0}
      <div class="grid gap-1" role="group" aria-label="Your other rewards">
        <span class="cap">Your other {byTime ? 'screen time ' : ''}rewards: tap to charge the same</span>
        {#each others as r (r.id)}
          <button type="button" class="ghost m-0 flex items-center justify-between gap-2 text-left pointer-coarse:min-h-11" aria-pressed={cost === r.cost} onclick={() => apply(r.cost)}>
            <span class="min-w-0 break-words">{r.name}{#if r.hidden}<span class="note"> · Hidden</span>{/if}</span>
            <span class="note whitespace-nowrap"><FeatherIcon name="star" /> {r.cost}{#if sizeOf(r)}{` · ${sizeOf(r)}`}{/if}</span>
          </button>
        {/each}
      </div>
    {:else}
      <p class="note m-0">No other {byTime ? 'screen time ' : ''}rewards to compare with yet.</p>
    {/if}
  {/if}
</section>

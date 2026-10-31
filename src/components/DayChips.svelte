<script lang="ts">
  import { hasDay, WEEKDAY_SHORT } from '../lib/choreTypes';

  /** One toggle per weekday for a chore's days. The last day on cannot be turned off. `onflip` gets the weekday (0 is Monday); `letters` shows just the first letter. */
  let { days, onflip, label, disabled = false, letters = false, class: cls = 'grid grid-cols-7 gap-1', chip = '[&&&]:w-full [&&&]:px-0' }: { days: number; onflip: (weekday: number) => void; label: string; disabled?: boolean; letters?: boolean; class?: string; chip?: string } = $props();
</script>

<div class={cls} role="group" aria-label={label}>
  {#each WEEKDAY_SHORT as d, i (i)}
    {@const on = hasDay(days, i)}
    <button type="button" class="day-chip {chip}" aria-pressed={on} aria-label={letters ? d : undefined} disabled={disabled || (on && days === 1 << i)} onclick={() => onflip(i)}>{letters ? d.charAt(0) : d}</button>
  {/each}
</div>

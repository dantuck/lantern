<script lang="ts">
  /** Marks a chore as optional: it only counts when ticked. `subject` names the chore for screen readers. */
  let { optional = $bindable(false), subject = '' }: { optional?: boolean; subject?: string } = $props();
</script>

<label class="flex items-center gap-2"><input class="m-0 w-auto" type="checkbox" bind:checked={optional} aria-label={subject ? `Optional for ${subject}` : 'Optional'} />Optional, only counts when ticked</label>
{#if optional}<p class="note m-0 text-[.85rem]">For a chore that is only needed some days, like a lunch box. It is on the list every day it is scheduled; if it is ticked it pays its points, and if not it holds nothing back and the all-done bonus does not wait for it. A manager can take back a tick that was not honest with Skip.</p>{/if}

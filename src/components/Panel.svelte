<script lang="ts">
  import type { Snippet } from 'svelte';
  import Sheet from './Sheet.svelte';
  import { mediaQuery } from '../lib/media.svelte';

  /** A form panel: a bottom sheet on phones, a card beside the list on wider screens. */
  let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } = $props();
  const phone = mediaQuery('(max-width: 39.999rem)');
</script>

{#if phone.matches}
  <Sheet {title} {onclose}>{@render children()}</Sheet>
{:else}
  <div class="edit-card max-w-[28rem] mb-3">{@render children()}</div>
{/if}

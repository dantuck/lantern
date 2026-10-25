<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';
  import { mediaQuery } from '../lib/media.svelte';

  /**
   * A card list in 1, 2 or 3 columns. Each item stays in its own column (item 1 left, 2 middle, 3 right, 4 left again…),
   * so opening one card to edit only moves the cards under it, never ones in other columns.
   */
  let { items, key, row }: { items: T[]; key: (item: T) => string; row: Snippet<[T]> } = $props();

  const two = mediaQuery('(min-width: 40rem)');
  const three = mediaQuery('(min-width: 64rem)');
  const cols = $derived(three.matches ? 3 : two.matches ? 2 : 1);
  const lanes = $derived.by(() => {
    const out: T[][] = Array.from({ length: cols }, () => []);
    items.forEach((item, i) => out[i % cols]!.push(item));
    return out;
  });
</script>

<div class="flex items-start gap-3">
  {#each lanes as lane, c (c)}
    <ul class="plain-list min-w-0 flex-1">
      {#each lane as item (key(item))}{@render row(item)}{/each}
    </ul>
  {/each}
</div>

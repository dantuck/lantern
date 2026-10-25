<script lang="ts">
  import type { Snippet } from 'svelte';

  /** A "› Summary" line that opens to reveal more: the one collapsible the manager screens share. */
  let { summary, id, open = false, class: klass = '', children }: { summary: string; id?: string; open?: boolean; class?: string; children: Snippet } = $props();
</script>

<details {id} class="group text-[.9rem] {klass}" {open}>
  <summary class="flex w-fit cursor-pointer items-center gap-1 list-none text-muted min-h-8 pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden"><span class="inline-block text-[1.1rem] leading-none transition-transform group-open:rotate-90" aria-hidden="true">›</span>{summary}</summary>
  {@render children()}
</details>

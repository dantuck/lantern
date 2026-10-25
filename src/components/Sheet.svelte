<script lang="ts">
  import type { Snippet } from 'svelte';
  import { mediaQuery } from '../lib/media.svelte';

  /**
   * A modal panel that slides up from the bottom of a phone screen, so editing keeps the list behind it in place. Closes on Escape, the ✕, or a tap outside.
   * With `drawer`, a wider screen gets it as a panel against the right edge instead.
   */
  let { title, onclose, children, drawer = false }: { title: string; onclose: () => void; children: Snippet; drawer?: boolean } = $props();
  const wide = mediaQuery('(min-width: 40rem)');
  const side = $derived(drawer && wide.matches);

  let dlg = $state<HTMLDialogElement>();
  $effect(() => {
    dlg?.showModal(); // removing the dialog from the page later closes it without an event
    dlg?.focus(); // not the ✕, which would otherwise be the first thing focused
  });
</script>

<dialog tabindex="-1" class={side ? 'shelf' : 'sheet'} bind:this={dlg} aria-label={title}
  {onclose} onclick={(e) => e.target === dlg && dlg?.close()}>
  <header class="dialog-head relative justify-between {side ? '' : 'pt-6'}">
    {#if !side}<span class="absolute top-2 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-line" aria-hidden="true"></span>{/if}
    <h3 class="[&&]:m-0 text-[1.1rem] tracking-[-.02em]">{title}</h3>
    <button type="button" class="icon-btn" aria-label="Close" onclick={() => dlg?.close()}>✕</button>
  </header>
  <div class="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{@render children()}</div>
</dialog>

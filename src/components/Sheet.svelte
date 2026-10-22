<script lang="ts">
  import type { Snippet } from 'svelte';

  /** A modal panel that slides up from the bottom of a phone screen, so editing keeps the list behind it in place. Closes on Escape, the ✕, or a tap outside. */
  let { title, onclose, children }: { title: string; onclose: () => void; children: Snippet } = $props();

  let dlg = $state<HTMLDialogElement>();
  $effect(() => {
    dlg?.showModal(); // removing the dialog from the page later closes it without an event
    dlg?.focus(); // not the ✕, which would otherwise be the first thing focused
  });
</script>

<dialog tabindex="-1" class="sheet" bind:this={dlg} aria-label={title}
  {onclose} onclick={(e) => e.target === dlg && dlg?.close()}>
  <header class="dialog-head relative justify-between pt-6">
    <span class="absolute top-2 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-line" aria-hidden="true"></span>
    <h3 class="[&&]:m-0 text-[1.1rem] tracking-[-.02em]">{title}</h3>
    <button type="button" class="icon-btn" aria-label="Close" onclick={() => dlg?.close()}>✕</button>
  </header>
  <div class="p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">{@render children()}</div>
</dialog>

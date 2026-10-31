<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * A panel in the middle of the screen, over a dimmed page, for options that would otherwise push the list down. It is a popover, so it sits in the top layer
   * (a scrolling card cannot clip it) and closes on an outside click or Escape, calling `onclose`. It never grows past the screen: taller content scrolls inside it.
   */
  let { label, width = 24, onclose, children }: { label: string; width?: number; onclose: () => void; children: Snippet } = $props();

  let panel = $state<HTMLDivElement>();
  $effect(() => {
    try { panel?.showPopover(); } catch { /* no popover support: it shows in place */ }
  });
</script>

<!-- Popovers are centred by the browser (fixed, inset 0, auto margins); the width and height only keep it on screen, with dvh so a phone's keyboard and toolbars are allowed for. -->
<div bind:this={panel} popover="auto" role="dialog" aria-label={label} style:width={`min(${width}rem, calc(100vw - 1.5rem))`} ontoggle={(e) => { if (e.newState === 'closed') onclose(); }}
  class="p-3 overflow-auto max-h-[calc(100dvh-1.5rem)] text-fg rounded-[var(--radius-sm)] border border-solid border-line bg-card shadow-[var(--shadow-md)] [&::backdrop]:bg-black/40">
  {@render children()}
</div>

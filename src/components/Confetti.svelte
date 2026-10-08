<script lang="ts">
  // A short burst of confetti, in the person's colour plus a few festive ones. Remount (via {#key}) to replay.
  // It removes itself once the last piece has landed.
  import { onMount } from 'svelte';

  let { color = 'var(--accent)', size = 'big' }: { color?: string; size?: 'big' | 'small' } = $props();
  let gone = $state(false);
  onMount(() => { const t = setTimeout(() => (gone = true), 3600); return () => clearTimeout(t); });

  const PALETTE = ['#f59e0b', '#ec4899', '#22c55e', '#3b82f6', '#a855f7'];
  const pieces = Array.from({ length: size === 'big' ? 48 : 18 }, (_, i) => ({
    x: Math.round((Math.random() - 0.5) * 100), // vw drift from centre
    r: Math.round(360 + Math.random() * 720), // total spin, degrees
    d: (1.6 + Math.random() * 1.2).toFixed(2), // fall time, seconds
    delay: (Math.random() * 0.35).toFixed(2),
    left: Math.round(10 + Math.random() * 80), // start position, vw
    c: i % 3 === 0 ? color : PALETTE[i % PALETTE.length]!,
    round: i % 4 === 0,
  }));
</script>

{#if !gone}
<div class="confetti" aria-hidden="true">
  {#each pieces as p, i (i)}
    <span class="confetti-bit" class:round={p.round} style:--x="{p.x}vw" style:--r="{p.r}deg" style:--d="{p.d}s" style:--delay="{p.delay}s" style:left="{p.left}vw" style:background={p.c}></span>
  {/each}
</div>
{/if}

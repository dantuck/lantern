<script lang="ts">
  import { iconMarkup } from '../lib/icons';

  /** A Feather icon (src/lib/icons.ts) for Svelte components, which cannot use Icon.astro. Decorative: put the meaning in text. */
  let { name, class: klass = '' }: { name: string; class?: string } = $props();
</script>

<svg class="icon {klass}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{@html iconMarkup(name)}</svg>

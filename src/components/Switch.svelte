<script lang="ts">
  /** An on/off switch (role="switch") with a sliding knob. `labelledby` is the id of the text that names it. */
  let { checked, labelledby, onchange, disabled = false }: { checked: boolean; labelledby: string; onchange: (next: boolean) => void; disabled?: boolean } = $props();
</script>

<button type="button" role="switch" aria-checked={checked} aria-labelledby={labelledby} {disabled} class="relative box-border flex-none [&&]:m-0 [&&]:p-0 [&&]:h-7 [&&]:min-h-0 [&&]:w-12 rounded-full border-0 shadow-none transition-colors {checked ? 'bg-accent' : 'bg-line'} [&&:hover]:filter-none [&&:active]:transform-none" onclick={() => onchange(!checked)}>
  <span class="absolute top-[3px] left-[3px] size-[22px] rounded-full bg-white shadow-sm transition-transform {checked ? 'translate-x-5' : ''}"></span>
</button>

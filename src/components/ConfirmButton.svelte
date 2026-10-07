<script lang="ts">
  /** A destructive button that asks on the second tap: the first turns it into "Sure?", which fades back after a few seconds. */
  let { label = 'Remove', ariaLabel, disabled = false, onconfirm }: { label?: string; ariaLabel: string; disabled?: boolean; onconfirm: () => void } = $props();

  let armed = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const disarm = () => { armed = false; clearTimeout(timer); };
  function tap() {
    if (armed) { disarm(); onconfirm(); return; }
    armed = true;
    timer = setTimeout(disarm, 4000);
  }
</script>

<button type="button" class="small {armed ? 'danger' : 'ghost'}" {disabled} aria-label={armed ? `Confirm: ${ariaLabel}` : ariaLabel} onclick={tap} onblur={disarm}>{armed ? 'Sure?' : label}</button>

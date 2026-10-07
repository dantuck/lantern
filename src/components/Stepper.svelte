<script lang="ts">
  /** A number field with big − and + buttons (44px, easy to hit on a phone) around a typeable value.
   *  Bind `value` in a form, or pass `onchange` to save: taps are gathered for a moment and sent once, and the value goes back if the save fails. */
  let { value = $bindable(0), min = 0, max = 1000, step = 1, label, caption, class: klass = '', onchange }: {
    value?: number; min?: number; max?: number; step?: number; label: string; caption?: string; class?: string; onchange?: (n: number) => Promise<boolean> | boolean | void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let cur = $state(value); // what is shown; `value` stays what the parent holds (saved) until it updates
  let draft = $state(String(value));
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => { cur = value; draft = String(value); }); // follows the parent

  const clamp = (n: number) => Math.min(max, Math.max(min, Number.isFinite(n) ? n : 0));

  async function flush() {
    if (!onchange || cur === value) return;
    const ok = await onchange(cur);
    if (ok === false) { cur = value; draft = String(value); }
  }
  function set(n: number, soon: boolean) {
    cur = clamp(n);
    draft = String(cur);
    if (!onchange) value = cur;
    clearTimeout(timer);
    if (soon) timer = setTimeout(flush, 600); else void flush();
  }
  /** Sends a tap that is still waiting for its pause: used when the page is left or this field goes away. */
  const flushNow = () => { clearTimeout(timer); void flush(); };
  $effect(() => flushNow);

  const nudge = (dir: 1 | -1) => set((Number(draft) || 0) + dir * step, true);
</script>

<svelte:window onpagehide={flushNow} />
<div class="grid gap-1 m-0 {klass}">
  {#if caption}<span class="cap">{caption}</span>{/if}
  <div class="grid grid-cols-[2.75rem_minmax(3rem,1fr)_2.75rem] items-stretch gap-1" role="group" aria-label={label}>
    <button type="button" class="ghost stepper-btn" aria-label={`Decrease ${label}`} disabled={cur <= min} onclick={() => nudge(-1)}>&minus;</button>
    <input class="stepper-in" type="number" {min} {max} {step} value={draft} oninput={(e) => (draft = e.currentTarget.value)} aria-label={label} onchange={() => set(Number(draft), false)} onfocus={(e) => e.currentTarget.select()} />
    <button type="button" class="ghost stepper-btn" aria-label={`Increase ${label}`} disabled={cur >= max} onclick={() => nudge(1)}>+</button>
  </div>
</div>

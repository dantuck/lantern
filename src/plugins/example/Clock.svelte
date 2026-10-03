<script lang="ts">
  let { generatedAt }: { generatedAt: number } = $props();
  let now = $state(new Date());
  $effect(() => {
    const t = setInterval(() => (now = new Date()), 1000);
    return () => clearInterval(t);
  });
</script>

<p class="clock" aria-live="off">{now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}</p>
<p class="muted">Data generated {new Date(generatedAt).toLocaleTimeString()}</p>

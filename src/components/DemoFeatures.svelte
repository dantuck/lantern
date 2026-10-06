<script lang="ts">
  import { DEMO_FEATURES, readOff, writeOff } from '../lib/demoFeatures';

  let off = $state<string[]>([]);
  $effect(() => { off = readOff(); });

  function toggle(id: string) {
    off = off.includes(id) ? off.filter((x) => x !== id) : [...off, id];
    writeOff(off);
  }
</script>

<table>
  <thead><tr><th>Name</th><th>Type</th><th>Status</th><th></th></tr></thead>
  <tbody>
    {#each DEMO_FEATURES as f (f.id)}
      {@const isOff = off.includes(f.id)}
      <tr>
        <td>{f.name}</td>
        <td><span class="badge">{f.kind}</span></td>
        <td>{#if isOff}<span class="muted">off</span>{:else}on{/if}</td>
        <td><div class="actions">
          <button type="button" class={isOff ? 'ghost' : 'danger'} onclick={() => toggle(f.id)} aria-label={`${isOff ? 'Turn on' : 'Turn off'} ${f.name}`}>{isOff ? 'Turn on' : 'Turn off'}</button>
        </div></td>
      </tr>
    {/each}
  </tbody>
</table>
<p class="muted hint">Try it: turn something off and it disappears from the side bar and the dashboard. In the demo this is remembered in this browser only.</p>

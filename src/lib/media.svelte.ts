/** A reactive media-query match; call from component setup. */
export function mediaQuery(query: string): { readonly matches: boolean } {
  let matches = $state(false);
  $effect(() => {
    const m = matchMedia(query);
    const sync = () => (matches = m.matches);
    sync();
    m.addEventListener('change', sync);
    return () => m.removeEventListener('change', sync);
  });
  return { get matches() { return matches; } };
}

// Keeps <details id="..."> sections open or shut as the person left them when the page is reloaded. Per tab and per page, so it
// is forgotten when the tab closes. (A live refresh, scripts/refresh.ts, restores them itself.) Sections without an id are not tracked.
const KEY = `lantern:open:${location.pathname}`;
const store = (() => { try { return window.sessionStorage; } catch { return null; } })();

const read = (): Record<string, boolean> => {
  try { return JSON.parse(store?.getItem(KEY) ?? '{}') as Record<string, boolean>; } catch { return {}; }
};

for (const [id, open] of Object.entries(read())) {
  const d = document.getElementById(id);
  if (d instanceof HTMLDetailsElement) d.open = open === true;
}

// `toggle` does not bubble, so listen in the capture phase.
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (!(d instanceof HTMLDetailsElement) || !d.id) return;
  try { store?.setItem(KEY, JSON.stringify({ ...read(), [d.id]: d.open })); } catch { /* not remembered */ }
}, { capture: true });

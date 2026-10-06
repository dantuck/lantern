/** The demo's stand-in for Admin's on/off switches: kept in this browser only, never sent anywhere. */
export const DEMO_FEATURES = [
  { id: 'calendar', name: 'Calendar', kind: 'Widget' },
  { id: 'mealq', name: 'Meal plan', kind: 'Widget' },
  { id: 'chores', name: 'Chores', kind: 'Built in' },
  { id: 'lists', name: 'Lists', kind: 'Built in' },
] as const;

const KEY = 'demo-off';
const known = new Set<string>(DEMO_FEATURES.map((f) => f.id));

export function readOff(): string[] {
  try { return (localStorage.getItem(KEY) ?? '').split(' ').filter((id) => known.has(id)); } catch { return []; }
}

/** Saves the list and sets `data-demo-off` on <html>, which the stylesheet uses to hide things. */
export function writeOff(ids: string[]) {
  const off = ids.filter((id) => known.has(id));
  try { off.length ? localStorage.setItem(KEY, off.join(' ')) : localStorage.removeItem(KEY); } catch {}
  if (off.length) document.documentElement.setAttribute('data-demo-off', off.join(' '));
  else document.documentElement.removeAttribute('data-demo-off');
}

// Light / dark / system switch. "system" removes the override so the CSS media query decides.
type Choice = 'light' | 'dark' | 'system';
const root = document.documentElement;
const LABELS: Record<Choice, string> = { system: 'match system', light: 'light', dark: 'dark' };
const themeColors = { light: '#c2570a', dark: '#12100d' };

const read = (): Choice => {
  try {
    const t = localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') return t;
  } catch {}
  return 'system';
};

function apply(choice: Choice) {
  try {
    if (choice === 'system') { delete root.dataset.theme; localStorage.removeItem('theme'); }
    else { root.dataset.theme = choice; localStorage.setItem('theme', choice); }
  } catch {}
  const dark = choice === 'dark' || (choice === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? themeColors.dark : themeColors.light);
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-theme-cycle]')) {
    b.dataset.state = choice;
    b.setAttribute('aria-label', `Theme: ${LABELS[choice]}. Click to change.`);
  }
}

apply(read());
const ORDER: Choice[] = ['system', 'light', 'dark'];
document.addEventListener('click', (e) => {
  if ((e.target as Element).closest('[data-theme-cycle]')) apply(ORDER[(ORDER.indexOf(read()) + 1) % ORDER.length]!);
});
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => read() === 'system' && apply('system'));

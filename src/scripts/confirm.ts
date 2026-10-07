// Two conveniences for forms, both optional: without JavaScript every form still posts straight through.
//  1. A button with data-confirm="..." asks first, in a modal dialog (large tap targets, works on tablets).
//  2. A form with data-keep-scroll comes back to where it was after the redirect, with the same sections open.
const KEY = 'lantern:keep-scroll';
const store = (() => { try { return window.sessionStorage; } catch { return null; } })();

// --- Restore position after a keep-scroll form was submitted ---------------------------------------------------
try {
  const saved = store?.getItem(KEY);
  if (saved) {
    store?.removeItem(KEY);
    const { path, y, open } = JSON.parse(saved) as { path: string; y: number; open: string[] };
    if (path === location.pathname) {
      for (const id of open) (document.getElementById(id) as HTMLDetailsElement | null)?.setAttribute('open', '');
      if (!location.hash) requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }
} catch { /* a bad value just means we stay at the top */ }

function remember(form: HTMLFormElement) {
  if (!form.closest('[data-keep-scroll]')) return;
  const open = [...document.querySelectorAll<HTMLDetailsElement>('details[id][open]')].map((d) => d.id);
  try { store?.setItem(KEY, JSON.stringify({ path: location.pathname, y: window.scrollY, open })); } catch { /* ignore */ }
}

// --- Confirmation dialog ---------------------------------------------------------------------------------------
let dialog: HTMLDialogElement | null = null;
function ask(message: string, ok: string): Promise<boolean> {
  if (!dialog) {
    dialog = document.createElement('dialog');
    dialog.className = 'confirm';
    dialog.innerHTML = '<form method="dialog"><p class="confirm-msg"></p><div class="confirm-btns"><button class="ghost" value="no" autofocus>Cancel</button><button class="danger" value="yes"></button></div></form>';
    document.body.appendChild(dialog);
  }
  const d = dialog;
  d.querySelector('.confirm-msg')!.textContent = message;
  d.querySelector<HTMLButtonElement>('button.danger')!.textContent = ok;
  return new Promise((resolve) => {
    d.addEventListener('close', () => resolve(d.returnValue === 'yes'), { once: true });
    d.returnValue = 'no';
    d.showModal();
  });
}

document.addEventListener('submit', (e) => {
  const form = e.target as HTMLFormElement;
  const btn = (e as SubmitEvent).submitter as HTMLElement | null;
  const message = btn?.dataset.confirm;
  if (!message || form.dataset.confirmed) { remember(form); return; }
  e.preventDefault();
  void ask(message, btn.dataset.confirmLabel || btn.textContent?.trim() || 'Confirm').then((yes) => {
    if (!yes) return;
    form.dataset.confirmed = '1';
    remember(form);
    form.requestSubmit(btn as HTMLButtonElement);
  });
});

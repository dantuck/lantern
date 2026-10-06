// Runs before first paint so a saved light/dark choice never flashes the other theme. No saved choice = follow the system.
try {
  var t = localStorage.getItem('theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
} catch (e) {}

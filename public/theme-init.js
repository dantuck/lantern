// Runs before first paint so a saved light/dark choice (and wall-display mode) never flashes the other look. No saved theme = follow the system.
try {
  var t = localStorage.getItem('theme');
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  if (localStorage.getItem('wall') === '1') document.documentElement.setAttribute('data-wall', '');
  var o = localStorage.getItem('demo-off');
  if (o && /^[a-z ]{1,60}$/.test(o)) document.documentElement.setAttribute('data-demo-off', o);
} catch (e) {}

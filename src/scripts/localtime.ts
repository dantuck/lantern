// Server renders UTC; show the viewer's local time instead. Runs again after a page refresh swaps in new content.
function localize() {
  for (const t of document.querySelectorAll<HTMLTimeElement>('time[datetime]')) {
    const d = new Date(t.dateTime);
    if (!Number.isNaN(d.getTime())) t.textContent = d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  }
}
localize();
addEventListener('lantern:refreshed', localize);

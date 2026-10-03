// Server renders UTC; show the viewer's local time instead.
for (const t of document.querySelectorAll<HTMLTimeElement>('time[datetime]')) {
  const d = new Date(t.dateTime);
  if (!Number.isNaN(d.getTime())) t.textContent = d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

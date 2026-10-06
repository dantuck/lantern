-- The household's people, managed by a manager on the Admin page (see src/lib/peopleStore.ts).
-- While this table is empty the `people` list in dashboard.config.ts is used, so existing setups keep working.
-- `id` is a slug of the first name and never changes on rename: chore lists and points refer to it (not a foreign key).
-- `match` is a JSON array of words that put a calendar event on this person's calendar.
CREATE TABLE people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  match TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

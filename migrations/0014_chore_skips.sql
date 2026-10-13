-- A manager can skip a person's chore for a single day, such as "bins" when they are away. A skipped chore is left out of that
-- day's list, its points and its all-done bonus; the next day it is back on its normal schedule. Like chore_checks, one row per
-- chore per day, and old rows are pruned as new ones are written (see src/lib/chores.ts).
CREATE TABLE chore_skips (
  item_id TEXT NOT NULL REFERENCES chore_items(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  skipped_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, day)
);

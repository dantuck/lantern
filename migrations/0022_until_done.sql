-- A repeating chore can be "until done": it shows on each of its days until it is ticked, and from then until the week ends it
-- leaves the to-do list and pays `kept_points` for each remaining scheduled day. Ticking it still pays `points`, once. Whether it is
-- finished is just a chore_checks row in the current Sunday-to-Saturday week, so nothing else is stored. Existing chores are unchanged.
ALTER TABLE chore_items ADD COLUMN until_done INTEGER NOT NULL DEFAULT 0 CHECK (until_done IN (0, 1));
ALTER TABLE chore_items ADD COLUMN kept_points INTEGER NOT NULL DEFAULT 0 CHECK (kept_points BETWEEN 0 AND 100);

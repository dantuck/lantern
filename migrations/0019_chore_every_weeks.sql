-- A repeating chore can skip weeks: every 2nd, 3rd or 4th week on its chosen weekdays. `week_anchor` is the Sunday that starts
-- the first week it is on; it is only set when `every_weeks` is more than 1. Existing chores keep repeating every week.
ALTER TABLE chore_items ADD COLUMN every_weeks INTEGER NOT NULL DEFAULT 1 CHECK (every_weeks BETWEEN 1 AND 4);
ALTER TABLE chore_items ADD COLUMN week_anchor TEXT;

-- The first day an "until done" chore counts ticks from. Turning "until finished" on, or changing its days or weeks, sets it to that
-- day, so a tick made earlier in the week is not read as the chore having been finished. NULL counts every tick.
ALTER TABLE chore_items ADD COLUMN until_done_from TEXT;

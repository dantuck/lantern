-- A chore can have its own weekdays inside its list, such as "take out the bins" on Tuesdays in a daily routine.
-- NULL means it follows the list's schedule. Otherwise bit N is set for weekday N (0 = Sunday), as for lists, and the chore
-- shows only on days its list is also scheduled. Ignored on one-off lists, whose date already decides the day.
ALTER TABLE chore_items ADD COLUMN days INTEGER CHECK (days IS NULL OR days BETWEEN 1 AND 127);

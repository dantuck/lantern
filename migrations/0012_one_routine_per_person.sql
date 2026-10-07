-- One routine per person, divided by time of day. A chore now carries its own time of day (`period`), weekdays (`days`, NULL =
-- every day) and an optional one-off date (`once_date`, which wins over `days`), where before these belonged to its list. Each
-- person (and "Anyone") keeps a single row in chore_lists, which only says who the chores are for; its name, period, days,
-- once_date and bonus columns are no longer used.
ALTER TABLE chore_items ADD COLUMN period TEXT NOT NULL DEFAULT 'any' CHECK (period IN ('morning','afternoon','evening','any'));
ALTER TABLE chore_items ADD COLUMN once_date TEXT;

-- A list that ran on no days could never show or be ticked, so its chores go.
DELETE FROM chore_items WHERE list_id IN (SELECT id FROM chore_lists WHERE days = 0 AND once_date IS NULL);

-- Each chore takes its list's time of day, date and weekdays (its own, else the list's).
UPDATE chore_items SET
  period = (SELECT l.period FROM chore_lists l WHERE l.id = chore_items.list_id),
  once_date = (SELECT l.once_date FROM chore_lists l WHERE l.id = chore_items.list_id);
UPDATE chore_items SET days = CASE
  WHEN once_date IS NOT NULL THEN NULL
  ELSE NULLIF(COALESCE(days, (SELECT l.days FROM chore_lists l WHERE l.id = chore_items.list_id)), 127)
END;

-- The all-done bonus is now per person and time of day. Lists that shared both add up.
CREATE TABLE chore_bonus (
  person TEXT NOT NULL,
  period TEXT NOT NULL CHECK (period IN ('morning','afternoon','evening','any')),
  bonus INTEGER NOT NULL CHECK (bonus BETWEEN 1 AND 1000),
  PRIMARY KEY (person, period)
);
INSERT INTO chore_bonus (person, period, bonus)
SELECT person, period, MIN(total, 1000)
FROM (SELECT person, period, SUM(bonus) AS total FROM chore_lists WHERE person IS NOT NULL AND bonus > 0 GROUP BY person, period);

-- Bonuses already paid are keyed by person, time of day and day, so today's is not paid twice. Where two lists now share a key
-- the older entry keeps its old key and stays as history.
UPDATE OR IGNORE reward_ledger SET ref = (
  SELECT l.person || ':' || l.period || ':' || substr(reward_ledger.ref, length(l.id) + 2)
  FROM chore_lists l WHERE reward_ledger.ref LIKE l.id || ':%'
)
WHERE kind = 'bonus' AND ref IS NOT NULL AND EXISTS (SELECT 1 FROM chore_lists l WHERE reward_ledger.ref LIKE l.id || ':%' AND l.person IS NOT NULL);

-- Rewards are limited to people instead of lists. A scoped reward whose lists belonged to nobody still reaches nobody.
CREATE TABLE reward_people (
  reward_id TEXT NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  person TEXT NOT NULL,
  PRIMARY KEY (reward_id, person)
);
INSERT INTO reward_people (reward_id, person)
SELECT DISTINCT rl.reward_id, l.person FROM reward_lists rl JOIN chore_lists l ON l.id = rl.list_id WHERE l.person IS NOT NULL;
DROP TABLE reward_lists;

-- Merge every person's lists into the oldest one.
UPDATE chore_items SET list_id = (
  SELECT k.id FROM chore_lists k
  WHERE COALESCE(k.person, '') = (SELECT COALESCE(l.person, '') FROM chore_lists l WHERE l.id = chore_items.list_id)
  ORDER BY k.created_at, k.id LIMIT 1
);
DELETE FROM chore_lists WHERE id <> (
  SELECT k.id FROM chore_lists k WHERE COALESCE(k.person, '') = COALESCE(chore_lists.person, '') ORDER BY k.created_at, k.id LIMIT 1
);
CREATE UNIQUE INDEX chore_lists_person ON chore_lists (COALESCE(person, ''));

-- A reward can be limited to certain chore lists: only the people those lists belong to can ask for it (see src/lib/rewards.ts).
-- `scoped` = 0 means everyone. `scoped` = 1 with no rows left (for example the lists were deleted) means nobody, so deleting a
-- list can never quietly open a reward up to the whole household.
ALTER TABLE rewards ADD COLUMN scoped INTEGER NOT NULL DEFAULT 0 CHECK (scoped IN (0, 1));

CREATE TABLE reward_lists (
  reward_id TEXT NOT NULL REFERENCES rewards(id) ON DELETE CASCADE,
  list_id TEXT NOT NULL REFERENCES chore_lists(id) ON DELETE CASCADE,
  PRIMARY KEY (reward_id, list_id)
);

-- Household goals: a target the whole household works toward together. Progress is not stored; it is the points anyone has
-- earned (every positive entry in reward_ledger) since `starts_at`, so spending points on personal rewards never lowers it.
-- A manager marks a reached goal as claimed once the household has had its reward.
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  target INTEGER NOT NULL CHECK (target BETWEEN 1 AND 1000000),
  starts_at INTEGER NOT NULL,
  claimed_at INTEGER,
  created_at INTEGER NOT NULL
);

-- A hidden reward stays on the manager's page but cannot be asked for, so it can be paused without deleting it.
ALTER TABLE rewards ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1));

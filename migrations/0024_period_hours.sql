-- When each time of day runs, in minutes after local midnight. A chore in a time of day can be ticked only inside its hours (managers
-- can always). A time of day with no row keeps its built-in hours (see src/lib/choreTypes.ts); "any" has none.
CREATE TABLE period_hours (
  period TEXT PRIMARY KEY CHECK (period IN ('morning','afternoon','evening')),
  from_min INTEGER NOT NULL CHECK (from_min BETWEEN 0 AND 1439),
  to_min INTEGER NOT NULL CHECK (to_min BETWEEN 1 AND 1440),
  CHECK (to_min > from_min)
);

-- Household names for the times of day a routine is split into. A manager can rename "Morning", "Afternoon" and "Evening" (to
-- "Before school", "After school", and so on); a time of day with no row here keeps its built-in name (see src/lib/choreTypes.ts).
CREATE TABLE period_labels (
  period TEXT PRIMARY KEY CHECK (period IN ('morning','afternoon','evening','any')),
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 24)
);

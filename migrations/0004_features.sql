-- Which widgets and built-in features a manager has switched off. A feature with no row is on, so this table starts empty
-- and everything keeps working until someone turns something off (see src/lib/features.ts).
CREATE TABLE feature_flags (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
  changed_at INTEGER NOT NULL
);

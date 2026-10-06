-- Chores and shared lists. Written by signed-in household members (see src/lib/chores.ts, src/lib/lists.ts).
-- `person` is a person id from dashboard.config.ts (NULL = anyone); it is not a foreign key because people live in config.
CREATE TABLE chores (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  person TEXT,
  repeat TEXT NOT NULL CHECK (repeat IN ('daily','weekly','once')),
  weekday INTEGER CHECK (weekday BETWEEN 0 AND 6),
  due_date TEXT,
  created_at INTEGER NOT NULL
);

-- One row per chore per day it was ticked off. Un-ticking deletes the row.
CREATE TABLE chore_done (
  chore_id TEXT NOT NULL REFERENCES chores(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  done_at INTEGER NOT NULL,
  PRIMARY KEY (chore_id, day)
);

CREATE TABLE lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE list_items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  done_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX list_items_list ON list_items(list_id);

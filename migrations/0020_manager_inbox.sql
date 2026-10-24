-- The managers' inbox: a household-wide feed of what happened (a reward was asked for, a screen time timer started or stopped).
-- Waiting approvals are not stored here; the inbox reads them live from `redemptions`, so they can never go stale.
CREATE TABLE inbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  headline TEXT NOT NULL,
  detail TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX inbox_created ON inbox (created_at);

-- When each manager last opened the inbox. Anything newer is unread for them.
CREATE TABLE inbox_seen (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  seen_at INTEGER NOT NULL
);

-- Temporary manager access on a member's device. A manager approves from their own device; the member's session is then
-- "elevated" for a short while. `elevated_by` is the approving manager, whose standing is re-checked on every request.
ALTER TABLE sessions ADD COLUMN elevated_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE sessions ADD COLUMN elevated_until INTEGER;

-- A device asking for that approval. One per session; the short code only tells a manager which device they are approving,
-- and is useless without a manager's own signed-in session, so it is not hashed.
CREATE TABLE elevation_requests (
  session_hash TEXT PRIMARY KEY REFERENCES sessions(id_hash) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL
);

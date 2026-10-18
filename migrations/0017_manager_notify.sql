-- What each manager wants to be told about, and how. Everything is off until a manager turns it on, so nothing changes for an existing household.
-- `rewards_*`: someone asks to spend points. `timers_*`: a screen time timer is started, extended or stopped. `_email` and `_push` pick the channel.
CREATE TABLE manager_notify (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rewards_email INTEGER NOT NULL DEFAULT 0,
  rewards_push INTEGER NOT NULL DEFAULT 0,
  timers_email INTEGER NOT NULL DEFAULT 0,
  timers_push INTEGER NOT NULL DEFAULT 0
);

-- The devices a manager has allowed push notifications on. Separate from push_subscriptions, which follow a household person, not a login.
CREATE TABLE manager_push (
  endpoint TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (endpoint, user_id)
);

-- Screen time timers. Spending screen time starts a countdown for that person, kept here so every device sees the same one and so a
-- timer stopped early can hand back the minutes it did not use. One timer per person: using more time while one runs extends it.
-- `from_bank` and `from_allowance` remember where the minutes came from (the day's allowance, or the bank) and `day` which household
-- day the allowance part belongs to, so stopping early gives the bank back first (it keeps) and then the allowance (it does not).
-- `notified_at` is set once the "time is up" push alert has been sent, so it goes out only once.
CREATE TABLE screentime_timers (
  person TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  minutes INTEGER NOT NULL,
  from_bank INTEGER NOT NULL DEFAULT 0,
  from_allowance INTEGER NOT NULL DEFAULT 0,
  day TEXT NOT NULL,
  notified_at INTEGER
);
CREATE INDEX screentime_timers_ends ON screentime_timers(ends_at);

-- The sound each person's iPad (or any device) plays when their time is up. Unset means the default chime.
CREATE TABLE screentime_sound (
  person TEXT PRIMARY KEY,
  sound TEXT NOT NULL
);

-- Optional "time is up" alerts, delivered as web push through the browser's own push service. A device subscribes for a person.
-- Only used when the host has set the VAPID keys (see docs/setup-guide.md); the table stays empty otherwise.
CREATE TABLE push_subscriptions (
  endpoint TEXT NOT NULL,
  person TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (endpoint, person)
);
CREATE INDEX push_subscriptions_person ON push_subscriptions(person);

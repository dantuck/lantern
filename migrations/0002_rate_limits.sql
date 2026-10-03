-- Fixed-window counters, keyed by SHA-256 of the subject (IP or email) so no PII is stored.
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

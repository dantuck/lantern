-- The most screen time a person can buy with points in one day, set by a manager. A person with no row has no limit.
CREATE TABLE screentime_buy_cap (
  person TEXT PRIMARY KEY,
  minutes INTEGER NOT NULL CHECK (minutes BETWEEN 1 AND 1440)
);
-- Bought-today sums read the day's 'earn' entries.
CREATE INDEX screentime_ledger_kind_at ON screentime_ledger(kind, at);

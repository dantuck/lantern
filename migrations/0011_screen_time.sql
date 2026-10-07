-- Screen time bank. A reward can carry `minutes`; approving a request for it adds them to the person's bank. Spending them
-- ("use") and a manager's hand adjustments are entries too, so the balance is the sum of `delta`, as with points. The app only
-- keeps the count: honouring it on the device is up to the household.
ALTER TABLE rewards ADD COLUMN minutes INTEGER NOT NULL DEFAULT 0 CHECK (minutes BETWEEN 0 AND 1440);
ALTER TABLE redemptions ADD COLUMN minutes INTEGER NOT NULL DEFAULT 0;

CREATE TABLE screentime_ledger (
  id TEXT PRIMARY KEY,
  person TEXT NOT NULL,
  delta INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('earn','use','adjust')),
  ref TEXT,
  note TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL,
  UNIQUE (kind, ref)
);
CREATE INDEX screentime_ledger_person ON screentime_ledger(person);

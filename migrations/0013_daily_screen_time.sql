-- A base daily screen time allowance per person, on top of the minutes they earn. It is not banked: whatever is left at the end of
-- the day is gone. `weekend_minutes` NULL means weekends are the same as other days; Saturday and Sunday count as the weekend.
-- Spending uses the day's allowance first, then the bank. Each use records how much came from the allowance (`allowance_used`)
-- and on which household day, so what is left today is the allowance minus the sum for that day. `delta` stays the minutes taken
-- from the bank, so the bank is still the sum of `delta`.
CREATE TABLE screentime_allowance (
  person TEXT PRIMARY KEY,
  weekday_minutes INTEGER NOT NULL DEFAULT 0 CHECK (weekday_minutes BETWEEN 0 AND 1440),
  weekend_minutes INTEGER CHECK (weekend_minutes IS NULL OR weekend_minutes BETWEEN 0 AND 1440)
);
ALTER TABLE screentime_ledger ADD COLUMN day TEXT;
ALTER TABLE screentime_ledger ADD COLUMN allowance_used INTEGER NOT NULL DEFAULT 0;

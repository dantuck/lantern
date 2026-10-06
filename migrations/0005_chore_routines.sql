-- Chore lists ("routines") managed by managers, and a points-and-rewards ledger. Replaces the flat `chores` table from
-- 0003: each chore now belongs to a list, and the list carries the owner and the schedule (see src/lib/chores.ts).
-- A chore list is due on a day when `once_date` equals it, or (with no `once_date`) when bit N of `days` is set for
-- that weekday (0 = Sunday). Ticks are stored per day, so every routine starts fresh each morning.
CREATE TABLE chore_lists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  person TEXT,
  period TEXT NOT NULL DEFAULT 'any' CHECK (period IN ('morning','afternoon','evening','any')),
  days INTEGER NOT NULL DEFAULT 127 CHECK (days BETWEEN 0 AND 127),
  once_date TEXT,
  bonus INTEGER NOT NULL DEFAULT 0 CHECK (bonus BETWEEN 0 AND 1000),
  created_at INTEGER NOT NULL
);

CREATE TABLE chore_items (
  id TEXT PRIMARY KEY,
  list_id TEXT NOT NULL REFERENCES chore_lists(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0 CHECK (points BETWEEN 0 AND 100),
  created_at INTEGER NOT NULL
);
CREATE INDEX chore_items_list ON chore_items(list_id);

CREATE TABLE chore_checks (
  item_id TEXT NOT NULL REFERENCES chore_items(id) ON DELETE CASCADE,
  day TEXT NOT NULL,
  done_at INTEGER NOT NULL,
  PRIMARY KEY (item_id, day)
);

-- Carry the old chores over: one list per owner and schedule, keeping each chore's id so today's ticks survive.
INSERT INTO chore_lists (id, name, person, days, once_date, created_at)
SELECT 'legacy-' || MIN(rowid),
       CASE repeat WHEN 'daily' THEN 'Daily chores' WHEN 'weekly' THEN 'Weekly chores' ELSE 'One-off chores' END,
       person,
       CASE repeat WHEN 'weekly' THEN 1 << weekday ELSE 127 END,
       CASE repeat WHEN 'once' THEN due_date END,
       MIN(created_at)
FROM chores GROUP BY person, repeat, weekday, due_date;

INSERT INTO chore_items (id, list_id, title, points, created_at)
SELECT c.id,
       'legacy-' || (SELECT MIN(g.rowid) FROM chores g WHERE g.person IS c.person AND g.repeat = c.repeat AND g.weekday IS c.weekday AND g.due_date IS c.due_date),
       c.title, 0, c.created_at
FROM chores c;

INSERT INTO chore_checks (item_id, day, done_at) SELECT chore_id, day, done_at FROM chore_done;

DROP TABLE chore_done;
DROP TABLE chores;

-- Things a manager offers in exchange for points.
CREATE TABLE rewards (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cost INTEGER NOT NULL CHECK (cost BETWEEN 1 AND 100000),
  created_at INTEGER NOT NULL
);

-- Every change to a person's points. The balance is the sum of `delta`. `ref` makes the automatic entries
-- idempotent: one 'chore' entry per chore per day, one 'bonus' per list per day, one 'redeem' per approved request.
CREATE TABLE reward_ledger (
  id TEXT PRIMARY KEY,
  person TEXT NOT NULL,
  delta INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('chore','bonus','redeem','adjust')),
  ref TEXT,
  note TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL,
  UNIQUE (kind, ref)
);
CREATE INDEX reward_ledger_person ON reward_ledger(person);

-- A request to spend points. Nothing is deducted until a manager approves it. The reward's name and cost are
-- copied so the history still reads correctly after a reward is edited or removed.
CREATE TABLE redemptions (
  id TEXT PRIMARY KEY,
  person TEXT NOT NULL,
  reward_name TEXT NOT NULL,
  cost INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
  requested_at INTEGER NOT NULL,
  decided_at INTEGER
);
CREATE INDEX redemptions_status ON redemptions(status);

-- A reward can carry a short description under its name. A request copies it, like the name, so the manager's inbox still reads
-- correctly after the reward is edited or removed.
ALTER TABLE rewards ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE redemptions ADD COLUMN reward_description TEXT NOT NULL DEFAULT '';

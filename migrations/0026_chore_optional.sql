-- An optional chore (a lunch box, say) is on the list every scheduled day, but only counts when it is ticked: left undone it holds no
-- points back and is not needed for the all-done bonus. A manager can take back a tick that was not honest (Skip today).
ALTER TABLE chore_items ADD COLUMN optional INTEGER NOT NULL DEFAULT 0 CHECK (optional IN (0, 1));

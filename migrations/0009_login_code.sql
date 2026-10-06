-- A sign-in token can also be completed by typing a short code, so the emailed message can be read on another device.
-- Only a hash of the code is stored. A code is guessable in principle, so `attempts` burns it after a few wrong tries.
ALTER TABLE login_tokens ADD COLUMN code_hash TEXT;
ALTER TABLE login_tokens ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;

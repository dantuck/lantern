-- A member invite can carry a one-time sign-in link. Only the SHA-256 of the link token is stored, and the link
-- has its own, shorter expiry than the invitation itself. Manager invites never get a link.
ALTER TABLE invites ADD COLUMN link_hash TEXT;
ALTER TABLE invites ADD COLUMN link_expires_at INTEGER;
CREATE UNIQUE INDEX invites_link_hash ON invites(link_hash) WHERE link_hash IS NOT NULL;

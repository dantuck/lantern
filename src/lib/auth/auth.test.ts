import { describe, expect, it } from 'vitest';
import { randomToken, sha256Hex, normalizeEmail, isPlausibleEmail } from './crypto';
import {
  DAY, SESSION_ABSOLUTE_TTL, SESSION_IDLE_TTL, isSessionValid, slideExpiry, needsTouch,
} from './policy';

describe('crypto', () => {
  it('generates distinct 256-bit tokens', () => {
    const a = randomToken(), b = randomToken();
    expect(a).toHaveLength(64);
    expect(a).not.toBe(b);
  });
  it('hashes deterministically', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('normalizes and validates email', () => {
    expect(normalizeEmail('  Mom@Example.COM ')).toBe('mom@example.com');
    expect(isPlausibleEmail('a@b.co')).toBe(true);
    expect(isPlausibleEmail('nope')).toBe(false);
  });
});

describe('session policy', () => {
  const created = 1_000_000;
  const base = { createdAt: created, lastSeen: created, expiresAt: created + SESSION_IDLE_TTL, revokedAt: null };
  it('is valid inside idle window', () => expect(isSessionValid(base, created + DAY)).toBe(true));
  it('expires after idle window', () => expect(isSessionValid(base, base.expiresAt)).toBe(false));
  it('rejects revoked sessions', () => expect(isSessionValid({ ...base, revokedAt: created + 1 }, created + 2)).toBe(false));
  it('enforces the absolute cap even if expiry slid past it', () => {
    const s = { ...base, expiresAt: created + SESSION_ABSOLUTE_TTL + DAY };
    expect(isSessionValid(s, created + SESSION_ABSOLUTE_TTL)).toBe(false);
  });
  it('slides expiry but never past the cap', () => {
    expect(slideExpiry(created, created + DAY)).toBe(created + DAY + SESSION_IDLE_TTL);
    expect(slideExpiry(created, created + 80 * DAY)).toBe(created + SESSION_ABSOLUTE_TTL);
  });
  it('throttles touches', () => {
    expect(needsTouch(base, created + 1000)).toBe(false);
    expect(needsTouch(base, created + DAY)).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { redirectTarget } from '../src/lib/origin';

const app = 'https://lantern.example.com';
describe('redirectTarget', () => {
  it('sends a retired host to the same path on APP_ORIGIN', () => {
    expect(redirectTarget(new URL('https://old.example.com/chores?x=1'), app, 'old.example.com')).toBe('https://lantern.example.com/chores?x=1');
  });
  it('ignores the primary host, unlisted hosts, and missing config', () => {
    expect(redirectTarget(new URL('https://lantern.example.com/'), app, 'lantern.example.com')).toBeNull();
    expect(redirectTarget(new URL('https://other.example.com/'), app, 'old.example.com')).toBeNull();
    expect(redirectTarget(new URL('https://old.example.com/'), app, undefined)).toBeNull();
    expect(redirectTarget(new URL('https://old.example.com/'), 'http://bad', 'old.example.com')).toBeNull();
  });
});

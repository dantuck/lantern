import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from './d1shim';
import { hit, LIMITS } from '../src/lib/rateLimit';
import { ResendMailer, selectMailer, loginEmail, ConsoleMailer } from '../src/lib/mailer';
import { isPublicPath, isSameOrigin, securityHeaders, withSecurityHeaders } from '../src/lib/http';

describe('rate limit', () => {
  let db: D1Database;
  beforeEach(() => { db = createTestDb(); });
  const lim = { max: 3, windowMs: 1000 };

  it('allows up to max then blocks, per subject', async () => {
    for (let i = 0; i < 3; i++) expect(await hit(db, 'a', lim, 5000)).toBe(true);
    expect(await hit(db, 'a', lim, 5001)).toBe(false);
    expect(await hit(db, 'b', lim, 5001)).toBe(true);
  });
  it('resets after the window', async () => {
    for (let i = 0; i < 4; i++) await hit(db, 'a', lim, 5000);
    expect(await hit(db, 'a', lim, 6001)).toBe(true);
  });
  it('does not store the raw subject', async () => {
    await hit(db, 'victim@example.com', LIMITS.loginEmailPerIp, 1);
    const row = await db.prepare('SELECT key FROM rate_limits').first<{ key: string }>();
    expect(row!.key).not.toContain('victim');
  });
});

describe('mailer', () => {
  it('posts to Resend with bearer auth and fails loudly on errors', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    await new ResendMailer('k', 'A <a@x.dev>', f as never).send({ to: 't@x.dev', subject: 's', text: 't', html: 'h' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer k');
    expect(JSON.parse(init.body as string).to).toEqual(['t@x.dev']);
    const bad = vi.fn(async () => new Response('no', { status: 422 }));
    await expect(new ResendMailer('k', 'f', bad as never).send({ to: 't', subject: '', text: '', html: '' })).rejects.toThrow('422');
  });
  it('fails closed in production without a key, falls back to console in dev', () => {
    expect(selectMailer({ MAIL_FROM: 'f' }, false)).toBeNull();
    expect(selectMailer({ MAIL_FROM: 'f' }, true)).toBeInstanceOf(ConsoleMailer);
    expect(selectMailer({ MAIL_FROM: 'f', RESEND_API_KEY: 'k' }, false)).toBeInstanceOf(ResendMailer);
  });
  it('puts the link in both bodies', () => {
    const m = loginEmail('https://x.dev/auth/verify#token=abc', '12345678');
    expect(m.text).toContain('#token=abc');
    expect(m.html).toContain('#token=abc');
    expect(m.text).toContain('1234 5678');
    expect(m.html).toContain('1234 5678');
  });
});

describe('http policy', () => {
  it('is default-deny with a small public allowlist', () => {
    for (const p of ['/login', '/auth/verify', '/auth/confirm', '/auth/code', '/auth/request', '/sw.js', '/manifest.webmanifest', '/icons/a.png', '/_astro/x.js'])
      expect(isPublicPath(p), p).toBe(true);
    for (const p of ['/', '/admin', '/api/plugins/calendar/data', '/auth/logout', '/p/calendar', '/login/..', '/loginx'])
      expect(isPublicPath(p), p).toBe(false);
  });
  it('requires a matching Origin on unsafe requests', () => {
    const url = new URL('https://fam.example/auth/logout');
    const req = (origin?: string) => new Request(url, { method: 'POST', headers: origin ? { origin } : {} });
    expect(isSameOrigin(req('https://fam.example'), url)).toBe(true);
    expect(isSameOrigin(req('https://evil.example'), url)).toBe(false);
    expect(isSameOrigin(req(), url)).toBe(false);
  });
  it('sets hardened headers and defaults to no-store', () => {
    const res = withSecurityHeaders(new Response('x'), true);
    expect(res.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    expect(res.headers.get('Content-Security-Policy')).not.toContain('unsafe-inline"');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    // Must stay same-origin: 'no-referrer' makes browsers send `Origin: null` on same-origin POSTs and breaks every form.
    expect(res.headers.get('Referrer-Policy')).toBe('same-origin');
    expect(securityHeaders(false)['Content-Security-Policy']).toBeUndefined();
  });
});

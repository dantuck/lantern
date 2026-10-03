import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestDb } from './d1shim';
import { safeAppOrigin } from '../src/lib/origin';
import { AUDIT_RETENTION_MS, runMaintenance } from '../src/lib/maintenance';
import { LIMITS, hit } from '../src/lib/rateLimit';
import { audit, createInvite, resolveLoginUser, listPendingInvites } from '../src/lib/auth/users';
import { createSession, validateSession } from '../src/lib/auth/sessions';
import { issueLoginToken } from '../src/lib/auth/loginTokens';
import { DAY, SESSION_IDLE_TTL } from '../src/lib/auth/policy';

describe('safeAppOrigin (fail closed)', () => {
  it('accepts a bare https origin in production', () => {
    expect(safeAppOrigin('https://family.example.org', false)).toBe('https://family.example.org');
    expect(safeAppOrigin('https://family.example.org/', false)).toBe('https://family.example.org');
  });
  it.each([
    ['undefined', undefined], ['empty', ''], ['garbage', 'not a url'],
    ['http in prod', 'http://family.example.org'],
    ['localhost in prod', 'https://localhost'], ['dev default in prod', 'http://localhost:4321'], ['127.0.0.1', 'https://127.0.0.1'],
    ['path', 'https://family.example.org/app'], ['query', 'https://family.example.org/?x=1'], ['hash', 'https://family.example.org/#x'],
    ['credentials', 'https://user:pw@family.example.org'], ['javascript scheme', 'javascript:alert(1)'],
  ])('rejects %s in production', (_n, v) => expect(safeAppOrigin(v as string | undefined, false)).toBeNull());
  it('allows http only for localhost in dev', () => {
    expect(safeAppOrigin('http://localhost:4321', true)).toBe('http://localhost:4321');
    expect(safeAppOrigin('http://family.example.org', true)).toBeNull();
  });
});

describe('login rate limits cannot be used to lock someone out', () => {
  let db: D1Database;
  beforeEach(() => { db = createTestDb(); });
  it("a stranger exhausting their own allowance for an address does not touch the real user's", async () => {
    const T = 1_000_000;
    const email = 'mom@example.com';
    // The attacker (IP A) hammers the address.
    const results: boolean[] = [];
    for (let i = 0; i < 6; i++) results.push(await hit(db, `login:email-ip:${email}|203.0.113.9`, LIMITS.loginEmailPerIp, T + i));
    expect(results).toEqual([true, true, true, false, false, false]);
    // The real user (IP B) is unaffected.
    expect(await hit(db, `login:email-ip:${email}|198.51.100.7`, LIMITS.loginEmailPerIp, T + 10)).toBe(true);
  });
  it('the address-wide backstop still stops a distributed flood', async () => {
    const out: boolean[] = [];
    for (let i = 0; i < 32; i++) out.push(await hit(db, 'login:email:victim@example.com', LIMITS.loginEmailTotal, 5 + i));
    expect(out.filter(Boolean)).toHaveLength(30);
  });
});

describe('maintenance', () => {
  const T0 = 1_800_000_000_000;
  let db: D1Database;
  const count = async (table: string) => (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())!.n;
  beforeEach(() => { db = createTestDb(); });

  it('removes expired data and keeps live data', async () => {
    const m = (await resolveLoginUser(db, 'mom@example.com', { bootstrapEmail: 'mom@example.com', now: T0 - 100 * DAY }))!;
    // sessions: one live, one long expired, one long revoked
    const live = await createSession(db, m.id, 'live', T0);
    await createSession(db, m.id, 'expired', T0 - SESSION_IDLE_TTL - 10 * DAY);
    const rev = await createSession(db, m.id, 'revoked', T0 - 60 * DAY);
    await db.prepare("UPDATE sessions SET revoked_at = ? WHERE device_label = 'revoked'").bind(T0 - 45 * DAY).run();
    void rev;
    // login tokens: one fresh, one expired
    await issueLoginToken(db, m.id, T0);
    await issueLoginToken(db, m.id, T0 - 3 * DAY);
    // invites: old used, old expired, fresh pending
    await createInvite(db, m, 'old1@example.com', 'member', T0 - 90 * DAY);
    await createInvite(db, m, 'fresh@example.com', 'member', T0);
    // audit: ancient + recent
    await audit(db, m.id, 'ancient', undefined, T0 - AUDIT_RETENTION_MS - DAY);
    await audit(db, m.id, 'recent', undefined, T0 - DAY);
    // rate limit rows: stale + fresh
    await hit(db, 'old', LIMITS.loginIp, T0 - 3 * DAY);
    await hit(db, 'new', LIMITS.loginIp, T0);

    await runMaintenance(db, T0);

    expect(await count('sessions')).toBe(1);
    expect((await validateSession(db, live.id, T0 + 1000))?.user.id).toBe(m.id);
    expect(await count('login_tokens')).toBe(1);
    expect((await listPendingInvites(db, T0)).map((i) => i.email)).toEqual(['fresh@example.com']);
    expect(await count('invites')).toBe(1);
    expect((await db.prepare('SELECT event FROM audit_log WHERE event IN (?, ?)').bind('ancient', 'recent').all<{ event: string }>()).results.map((r) => r.event)).toEqual(['recent']);
    expect(await count('rate_limits')).toBe(1);
  });
  it('is idempotent and safe on an empty database', async () => {
    await runMaintenance(db, T0);
    await runMaintenance(db, T0);
    expect(await count('sessions')).toBe(0);
  });
});

import { clearCookie, cookieOptions } from '../src/lib/auth/cookies';
describe('cookie clearing', () => {
  it('re-sends the full __Host- attribute set, because browsers ignore deletions without Secure', () => {
    const calls: unknown[][] = [];
    clearCookie({ set: (...a: unknown[]) => void calls.push(a) } as never, '__Host-session');
    expect(calls).toHaveLength(1);
    const [name, value, opts] = calls[0] as [string, string, Record<string, unknown>];
    expect([name, value]).toEqual(['__Host-session', '']);
    expect(opts).toMatchObject({ path: '/', secure: true, httpOnly: true, sameSite: 'lax', maxAge: 0 });
    expect((opts.expires as Date).getTime()).toBe(0);
    expect(opts).not.toHaveProperty('domain'); // __Host- forbids Domain
  });
  it('session and nonce cookies are host-only, HttpOnly, Secure, Lax', () => {
    expect(cookieOptions(60)).toEqual({ path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 60 });
  });
});

import { updateUser, listUsers } from '../src/lib/auth/users';
describe('last-manager protection holds under concurrency', () => {
  const T = 1_800_000_000_000;
  async function twoManagers() {
    const db = createTestDb();
    const a = (await resolveLoginUser(db, 'a@example.com', { bootstrapEmail: 'a@example.com', now: T }))!;
    await createInvite(db, a, 'b@example.com', 'manager', T);
    const b = (await resolveLoginUser(db, 'b@example.com', { now: T }))!;
    return { db, a, b };
  }
  const activeManagers = async (db: D1Database) => (await listUsers(db)).filter((u) => u.role === 'manager' && u.disabledAt === null).length;

  it('two managers demoting each other at once cannot leave zero managers', async () => {
    const { db, a, b } = await twoManagers();
    const results = await Promise.all([updateUser(db, a, b.id, { role: 'member' }, T + 1), updateUser(db, b, a.id, { role: 'member' }, T + 1)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.find((r) => !r.ok)).toEqual({ ok: false, error: 'last_manager' });
    expect(await activeManagers(db)).toBe(1);
  });
  it('two managers disabling each other at once cannot leave zero managers', async () => {
    const { db, a, b } = await twoManagers();
    const results = await Promise.all([updateUser(db, a, b.id, { disabled: true }, T + 1), updateUser(db, b, a.id, { disabled: true }, T + 1)]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(await activeManagers(db)).toBe(1);
  });
  it('a manager demoting themselves while another manager disables them cannot strand the household', async () => {
    const { db, a, b } = await twoManagers();
    await Promise.all([updateUser(db, a, a.id, { role: 'member' }, T + 1), updateUser(db, b, a.id, { disabled: true }, T + 1), updateUser(db, a, b.id, { role: 'member' }, T + 1)]);
    expect(await activeManagers(db)).toBeGreaterThanOrEqual(1);
  });
  it('still allows legitimate changes', async () => {
    const { db, a, b } = await twoManagers();
    expect(await updateUser(db, a, b.id, { role: 'member' }, T + 1)).toEqual({ ok: true });
    expect(await updateUser(db, a, b.id, { role: 'manager' }, T + 2)).toEqual({ ok: true });
    expect(await updateUser(db, a, b.id, { disabled: true }, T + 3)).toEqual({ ok: true });
    expect(await updateUser(db, a, b.id, { disabled: false }, T + 4)).toEqual({ ok: true });
  });
});

import { readBodyText, readForm, readJson } from '../src/lib/http';
import { flashFor, MESSAGES } from '../src/lib/messages';
import { guardedFetch } from '../src/plugins/fetchPolicy';
import { revokeAllForUser, revokeSession, listSessions } from '../src/lib/auth/sessions';
import { listAudit } from '../src/lib/auth/admin';

/** A request whose body arrives in chunks with NO Content-Length, like a chunked upload. */
const chunked = (parts: string[]) =>
  new Request('https://fam.example/x', {
    method: 'POST',
    body: new ReadableStream({ start(c) { for (const p of parts) c.enqueue(new TextEncoder().encode(p)); c.close(); } }),
    // @ts-expect-error duplex is required by Node for streaming bodies
    duplex: 'half',
  });

describe('bounded body reading', () => {
  it('reads bodies at or under the cap, across chunks', async () => {
    expect(await readBodyText(chunked(['ab', 'cd']), 4)).toBe('abcd');
    expect(await readBodyText(new Request('https://x.example', { method: 'POST' }), 4)).toBe('');
  });
  it('refuses an oversized chunked body even though it has no Content-Length', async () => {
    const req = chunked(['aaaa', 'bbbb', 'cccc']);
    expect(req.headers.get('content-length')).toBeNull();
    expect(await readBodyText(req, 6)).toBeNull();
  });
  it('refuses on a declared length without reading the body', async () => {
    const req = new Request('https://x.example', { method: 'POST', body: 'x', headers: { 'content-length': '99999' } });
    expect(await readBodyText(req, 100)).toBeNull();
  });
  it('parses forms and JSON, and distinguishes too-large (null) from malformed (undefined)', async () => {
    expect((await readForm(chunked(['email=a%40b.co&x=1']), 100))!.get('email')).toBe('a@b.co');
    expect(await readForm(chunked(['email=' + 'a'.repeat(500)]), 100)).toBeNull();
    expect(await readJson(chunked(['{"token":"t"}']), 100)).toEqual({ token: 't' });
    expect(await readJson(chunked(['{nope']), 100)).toBeUndefined();
    expect(await readJson(chunked(['{"token":"' + 'a'.repeat(500) + '"}']), 100)).toBeNull();
  });
});

describe('flash messages', () => {
  it('resolves known codes and nothing else, including prototype member names', () => {
    expect(flashFor('invite_sent')).toBe(MESSAGES.invite_sent);
    for (const bad of [null, '', 'nope', 'constructor', '__proto__', 'toString', 'hasOwnProperty', '<script>'])
      expect(flashFor(bad), String(bad)).toBeUndefined();
  });
});

describe('guardedFetch redirects', () => {
  const sig = new AbortController().signal;
  it('never follows a redirect for a non-GET request, even to an allowed host', async () => {
    const base = vi.fn(async () => new Response(null, { status: 307, headers: { location: '/elsewhere' } }));
    const f = guardedFetch({ hosts: ['a.example.com'], methods: ['GET', 'POST'] }, sig, base as never);
    await expect(f('https://a.example.com/token', { method: 'POST', body: 'x=1' })).rejects.toThrow(/redirect on non-GET/);
    expect(base).toHaveBeenCalledTimes(1); // the body was not replayed anywhere
  });
});

describe('session revocation audits itself', () => {
  const T = 1_800_000_000_000;
  it('records who revoked whose session, for managers and members alike', async () => {
    const db = createTestDb();
    const m = (await resolveLoginUser(db, 'mom@example.com', { bootstrapEmail: 'mom@example.com', now: T }))!;
    await createInvite(db, m, 'kid@example.com', 'member', T);
    const kid = (await resolveLoginUser(db, 'kid@example.com', { now: T }))!;
    await createSession(db, kid.id, 'phone', T);
    await createSession(db, kid.id, 'laptop', T);
    const [first, second] = (await listSessions(db, kid.id, T)).map((s) => s.id_hash);

    expect(await revokeSession(db, kid, first!, T + 1)).toBe(true);   // self
    expect(await revokeSession(db, m, second!, T + 2)).toBe(true);    // manager revoking someone else's
    expect(await revokeSession(db, kid, first!, T + 3)).toBe(false);  // already revoked: no audit entry
    const entries = (await listAudit(db, 20)).filter((e) => e.event === 'session.revoked');
    expect(entries.map((e) => [e.actorEmail, JSON.parse(e.detail!).self])).toEqual([['mom@example.com', false], ['kid@example.com', true]]);
  });
  it('records signing out other devices', async () => {
    const db = createTestDb();
    const m = (await resolveLoginUser(db, 'mom@example.com', { bootstrapEmail: 'mom@example.com', now: T }))!;
    await revokeAllForUser(db, m.id, 'keep', T);
    expect((await listAudit(db, 5)).map((e) => e.event)).toContain('session.revoked_others');
  });
});

describe('updateUser on unknown targets', () => {
  it('reports not_found without touching anything', async () => {
    const db = createTestDb();
    const m = (await resolveLoginUser(db, 'mom@example.com', { bootstrapEmail: 'mom@example.com', now: 1 }))!;
    expect(await updateUser(db, m, 'no-such-id', { disabled: true }, 2)).toEqual({ ok: false, error: 'not_found' });
  });
});

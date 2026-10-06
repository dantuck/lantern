import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import {
  assessLogin, authHint, backupFileName, checkMigrationSeal, compareVersions, diffMigrations, entriesBetween, parseAppliedMigrations,
  parseChangelog, sha256,
} from '../scripts/lib/update-helpers.mjs';

const CHANGELOG = `# Changelog
## [Unreleased]
- wip
## [0.3.0] - 2026-12-01
### Added
- c
### Action required
- do x
## [0.2.0] - 2026-11-01
- b
## [0.1.0] - 2026-10-06
- a
`;

describe('versions and changelog', () => {
  it('compares plain x.y.z numerically, not as strings', () => {
    expect(compareVersions('0.10.0', '0.9.0')).toBeGreaterThan(0);
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(() => compareVersions('1.0', '1.0.0')).toThrow();
    expect(() => compareVersions('1.0.0-beta', '1.0.0')).toThrow();
  });
  it('parses sections and ignores Unreleased when selecting', () => {
    const e = parseChangelog(CHANGELOG);
    expect(e.map((x) => x.version)).toEqual([null, '0.3.0', '0.2.0', '0.1.0']);
    expect(e[1]!.body).toContain('Action required');
  });
  it('returns entries after the last deploy up to this version, newest first', () => {
    const e = parseChangelog(CHANGELOG);
    expect(entriesBetween(e, '0.1.0', '0.3.0').map((x: { version?: string | null }) => x.version)).toEqual(['0.3.0', '0.2.0']);
    expect(entriesBetween(e, '0.2.0', '0.2.0')).toEqual([]);
    expect(entriesBetween(e, '0.1.0', '0.2.0').map((x: { version?: string | null }) => x.version)).toEqual(['0.2.0']);
    expect(entriesBetween(e, null, '0.3.0').map((x: { version?: string | null }) => x.version)).toEqual(['0.3.0']);
  });
});

describe('migration state', () => {
  it('finds pending migrations and ones the checkout does not know', () => {
    expect(diffMigrations(['0001_a.sql', '0002_b.sql', '0003_c.sql'], ['0001_a.sql'])).toEqual({ pending: ['0002_b.sql', '0003_c.sql'], unknown: [] });
    expect(diffMigrations(['0001_a.sql'], ['0001_a.sql', '0002_z.sql'])).toEqual({ pending: [], unknown: ['0002_z.sql'] });
  });
  it('parses wrangler d1 execute --json output', () => {
    expect(parseAppliedMigrations('[{"results":[{"name":"0001_a.sql"},{"name":"0002_b.sql"}],"success":true}]')).toEqual(['0001_a.sql', '0002_b.sql']);
    expect(parseAppliedMigrations('[{"results":[],"success":true}]')).toEqual([]);
  });
  it('names backups safely and sortably', () => {
    expect(backupFileName('family-dashboard', new Date('2026-10-06T12:34:56.789Z'))).toBe('family-dashboard-2026-10-06T12-34-56-789Z.sql');
  });
});

describe('migration seal', () => {
  const files = ['0001_a.sql', '0002_b.sql'];
  const contents: Record<string, string> = { '0001_a.sql': 'CREATE TABLE a(x);', '0002_b.sql': 'CREATE TABLE b(x);' };
  const manifest = Object.fromEntries(files.map((f) => [f, sha256(contents[f]!)]));
  it('accepts sealed, contiguous migrations', () => expect(checkMigrationSeal(files, contents, manifest)).toEqual([]));
  it('rejects an edited migration', () => {
    expect(checkMigrationSeal(files, { ...contents, '0001_a.sql': 'DROP TABLE a;' }, manifest).join()).toMatch(/immutable/);
  });
  it('rejects unsealed, gapped, badly named and vanished migrations', () => {
    expect(checkMigrationSeal([...files, '0003_c.sql'], { ...contents, '0003_c.sql': 'x' }, manifest).join()).toMatch(/not sealed/);
    expect(checkMigrationSeal(['0001_a.sql', '0003_c.sql'], { ...contents, '0003_c.sql': 'x' }, { ...manifest, '0003_c.sql': sha256('x') }).join()).toMatch(/gaps/);
    expect(checkMigrationSeal(['init.sql'], { 'init.sql': 'x' }, { 'init.sql': sha256('x') }).join()).toMatch(/name must look like/);
    expect(checkMigrationSeal(['0001_a.sql'], contents, manifest).join()).toMatch(/missing/);
  });
});

describe('the real repository', () => {
  it('has every shipped migration sealed and unmodified', () => {
    const names = readdirSync('migrations').filter((f) => f.endsWith('.sql'));
    const contents = Object.fromEntries(names.map((f) => [f, readFileSync(`migrations/${f}`, 'utf8')]));
    const manifest = JSON.parse(readFileSync('scripts/migrations.manifest.json', 'utf8'));
    expect(checkMigrationSeal(names, contents, manifest)).toEqual([]);
  });
  it('has a changelog entry for the current package version', () => {
    const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
    const entries = parseChangelog(readFileSync('CHANGELOG.md', 'utf8'));
    expect(entries.map((e) => e.version)).toContain(version);
  });
});

describe('Cloudflare login check', () => {
  const who = (o: unknown) => JSON.stringify(o);
  it('accepts a login that includes the pinned account', () => {
    expect(assessLogin(who({ loggedIn: true, accounts: [{ id: 'a1', name: 'Home' }, { id: 'a2', name: 'Work' }] }), 'a2')).toEqual({ state: 'ok', accountName: 'Work' });
  });
  it('tells logged out, wrong account and unreadable output apart', () => {
    expect(assessLogin(who({ loggedIn: false }), 'a1')).toEqual({ state: 'logged_out' });
    expect(assessLogin(who({ loggedIn: true, accounts: [{ id: 'a9', name: 'Other' }] }), 'a1')).toEqual({ state: 'wrong_account', names: ['Other'] });
    expect(assessLogin('not json', 'a1')).toEqual({ state: 'unreadable' });
  });
  it('recognises credential errors from Wrangler, and only those', () => {
    expect(authHint('The given account is not valid or is not authorized to access this service [code: 7403]')).toContain('wrangler whoami');
    expect(authHint('Authentication error [code: 10000]')).toContain('CLOUDFLARE_API_TOKEN');
    expect(authHint('no such table: d1_migrations')).toBeNull();
  });
});

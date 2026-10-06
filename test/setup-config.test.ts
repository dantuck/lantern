import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  applyDashboardValues, applyWranglerValues, checkAccountId, defaultSender, checkEmail, checkHostname, checkTimeZone,
  nodeVersionOk, parseDatabaseId, readWranglerValues,
} from '../scripts/lib/setup-config.mjs';

const wrangler = readFileSync('wrangler.template.jsonc', 'utf8');
const dashboard = readFileSync('dashboard.config.example.ts', 'utf8');
const base = { hostname: 'dash.family.org', mailFrom: 'Family Dashboard <login@family.org>' };
const ACCOUNT = 'd98b487290d020c718e6a96224e44260';
const DB = '0b2a1c3e-1111-4222-8333-444455556666';

describe('setup input checks', () => {
  it('accepts real hostnames and rejects placeholders, schemes, IPs and workers.dev', () => {
    expect(checkHostname('Dash.Family.org ')).toBeNull();
    for (const bad of ['https://dash.family.org', 'dash.family.org/x', 'dash.family.org:8080', 'localhost', '10.0.0.1',
      'dashboard.example.com', 'x.workers.dev', '', 'a..b.com']) expect(checkHostname(bad), bad).not.toBeNull();
  });
  it('validates email, time zone and ids', () => {
    expect(checkEmail('mom@family.org')).toBeNull();
    for (const bad of ['mom', 'a b@c.d', '<x>@y.z', '']) expect(checkEmail(bad), bad).not.toBeNull();
    expect(checkTimeZone('America/Chicago')).toBeNull();
    expect(checkTimeZone('Mars/Base')).not.toBeNull();
    expect(checkAccountId(ACCOUNT)).toBeNull();
    expect(checkAccountId('nope')).not.toBeNull();
  });
  it('requires Node 22.12 or newer, as Astro does', () => {
    for (const ok of ['22.12.0', 'v22.12.1', '22.13.0', '24.15.0', '23.0.0']) expect(nodeVersionOk(ok), ok).toBe(true);
    for (const bad of ['20.19.0', '22.11.9', '22.0.0', 'v18.0.0', 'x']) expect(nodeVersionOk(bad), bad).toBe(false);
  });
  it('keeps package.json engines in step with the setup check', () => {
    expect(JSON.parse(readFileSync('package.json', 'utf8')).engines.node).toBe('>=22.12.0');
    expect(JSON.parse(readFileSync('node_modules/astro/package.json', 'utf8')).engines.node).toBe('>=22.12.0');
  });
  it('suggests login@<hostname> and never guesses a parent domain', () => {
    expect(defaultSender('dash.family.org', undefined)).toBe('login@dash.family.org');
    expect(defaultSender('dash.family.co.uk', undefined)).toBe('login@dash.family.co.uk'); // not login@co.uk
    expect(defaultSender('family.org', 'Family Dashboard <login@example.com>')).toBe('login@family.org');
  });
  it('keeps the sender already configured when setup is re-run', () => {
    expect(defaultSender('dash.family.org', 'Family Dashboard <hello@mail.family.org>')).toBe('hello@mail.family.org');
    expect(defaultSender('dash.family.org', 'mom@family.org')).toBe('mom@family.org');
    expect(defaultSender('dash.family.org', 'garbage')).toBe('login@dash.family.org');
  });
  it('parses the database id from wrangler output', () => {
    expect(parseDatabaseId(`{\n "binding": "DB",\n "database_name": "family-dashboard",\n "database_id": "${DB}"\n}`)).toBe(DB);
    expect(parseDatabaseId('error')).toBeNull();
  });
});

describe('wrangler.jsonc edits', () => {
  it('sets hostname, origin, sender, database and account, keeping comments', () => {
    const out = applyWranglerValues(wrangler, { ...base, databaseId: DB, accountId: ACCOUNT });
    expect(out).toContain('"pattern": "dash.family.org"');
    expect(out).toContain('"APP_ORIGIN": "https://dash.family.org"');
    expect(out).toContain('"MAIL_FROM": "Family Dashboard <login@family.org>"');
    expect(out).toContain(`"database_id": "${DB}"`);
    expect(out).toContain(`"account_id": "${ACCOUNT}"`);
    expect(out).toContain('// Reachable ONLY on your own domain');
    expect(out).not.toContain('example.com');
    expect(out).not.toContain('localhost');
  });
  it('is idempotent and round-trips through readWranglerValues', () => {
    const once = applyWranglerValues(wrangler, { ...base, databaseId: DB, accountId: ACCOUNT });
    expect(applyWranglerValues(once, { ...base, databaseId: DB, accountId: ACCOUNT })).toBe(once);
    expect(readWranglerValues(once)).toEqual({ hostname: 'dash.family.org', mailFrom: base.mailFrom, databaseId: DB, databaseName: 'family-dashboard', accountId: ACCOUNT });
  });
  it('leaves values containing $ patterns intact', () => {
    const out = applyWranglerValues(wrangler, { hostname: 'a.b.org', mailFrom: 'Me $& $1 <x@b.org>' });
    expect(out).toContain('"MAIL_FROM": "Me $& $1 <x@b.org>"');
  });
  it('fails loudly when the file does not look like the template', () => {
    expect(() => applyWranglerValues('{}', base)).toThrow(/routes\[0\]\.pattern/);
  });
});

describe('dashboard.config.ts edits', () => {
  it('sets the time zone and MealQ host', () => {
    const out = applyDashboardValues(dashboard, { timeZone: 'America/Chicago', useCalendar: true, useMealq: true, mealqHost: 'api.mealq.app' });
    expect(out).not.toContain('America/New_York');
    expect(out).toContain("apiHost: 'api.mealq.app'");
  });
  it('drops widgets the household does not use', () => {
    const out = applyDashboardValues(dashboard, { timeZone: 'America/Chicago', useCalendar: false, useMealq: false });
    expect(out).not.toContain("id: 'calendar'");
    expect(out).not.toContain("id: 'mealq'");
    expect(out).toContain('showExample');
  });
});

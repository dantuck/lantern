import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { applyWranglerValues } from '../scripts/lib/setup-config.mjs';
import { compareVersions } from '../scripts/lib/update-helpers.mjs';
import {
  checkBackups, checkDeployed, checkMigrations, checkNode, checkSecrets, checkUsers, checkWranglerConfig, latestBackup,
  parseSecretList, requiredSecrets,
} from '../scripts/lib/doctor-checks.mjs';

const template = readFileSync('wrangler.template.jsonc', 'utf8');
const good = applyWranglerValues(template, {
  hostname: 'dash.family.org', mailFrom: 'Family Dashboard <login@family.org>',
  databaseId: '0b2a1c3e-1111-4222-8333-444455556666', accountId: 'd98b487290d020c718e6a96224e44260',
});
const levels = (fs: { level: string }[]) => fs.map((f) => f.level);
const fails = (fs: { level: string; msg: string }[]) => fs.filter((f) => f.level === 'fail').map((f) => f.msg);

describe('doctor: settings', () => {
  it('passes a configured install', () => {
    expect(levels(checkWranglerConfig(good))).not.toContain('fail');
    expect(levels(checkWranglerConfig(good))).not.toContain('warn');
  });
  it('fails the untouched template, naming each placeholder', () => {
    const f = fails(checkWranglerConfig(template)).join('|');
    expect(f).toMatch(/hostname/);
    expect(f).toMatch(/APP_ORIGIN/);
    expect(f).toMatch(/MAIL_FROM/);
    expect(f).toMatch(/account_id/);
    expect(f).toMatch(/database_id/);
  });
  it('catches an origin that does not match the hostname', () => {
    const bad = good.replace('"https://dash.family.org"', '"https://other.family.org"');
    expect(fails(checkWranglerConfig(bad)).join()).toMatch(/APP_ORIGIN/);
  });
  it('warns when logging is on or metrics are not switched off', () => {
    const logs = good.replace('"observability": { "enabled": false }', '"observability": { "enabled": true }');
    expect(checkWranglerConfig(logs).some((f) => f.level === 'warn' && /logging/.test(f.msg))).toBe(true);
    const metrics = good.replace('"send_metrics": false', '"send_metrics": true');
    expect(checkWranglerConfig(metrics).some((f) => f.level === 'warn' && /metrics/.test(f.msg))).toBe(true);
  });
  it('checks the Node version', () => {
    expect(levels(checkNode('24.1.0'))).toEqual(['ok']);
    expect(levels(checkNode('20.0.0'))).toEqual(['fail']);
  });
});

describe('doctor: secrets', () => {
  const sources = Object.fromEntries(readdirSync('src/plugins').filter((d) => !d.endsWith('.md') && !d.endsWith('.ts'))
    .map((d) => [d, readFileSync(`src/plugins/${d}/plugin.ts`, 'utf8')]));
  const config = readFileSync('dashboard.config.example.ts', 'utf8');

  it('derives required secrets from the enabled widgets, reading the real plugin files', () => {
    const r = requiredSecrets(config, sources);
    expect(r.required).toEqual(['GOOGLE_CALENDAR_ID', 'GOOGLE_SERVICE_ACCOUNT_JSON', 'MEALQ_API_TOKEN', 'RESEND_API_KEY']);
    expect(r.enabled).toEqual(['calendar', 'mealq']); // the dev-only example widget is not counted
    expect(r.unknown).toEqual([]);
  });
  it('only needs Resend when no widget is enabled, and flags unknown widgets', () => {
    expect(requiredSecrets('plugins: []', sources).required).toEqual(['RESEND_API_KEY']);
    expect(requiredSecrets("plugins: [{ id: 'nope' }]", sources).unknown).toEqual(['nope']);
  });
  it('reports missing secrets with the command to set each', () => {
    const f = checkSecrets({ required: ['RESEND_API_KEY', 'MEALQ_API_TOKEN'], present: ['RESEND_API_KEY'], hasUsers: true });
    expect(fails(f)[0]).toMatch(/MEALQ_API_TOKEN/);
    expect((f[0] as { fix?: string }).fix).toContain('npx wrangler secret put MEALQ_API_TOKEN');
  });
  it('treats the bootstrap secret by whether anyone has signed in', () => {
    const req = ['RESEND_API_KEY'];
    expect(levels(checkSecrets({ required: req, present: ['RESEND_API_KEY', 'BOOTSTRAP_MANAGER_EMAIL'], hasUsers: false }))).toEqual(['ok', 'ok']);
    expect(levels(checkSecrets({ required: req, present: ['RESEND_API_KEY', 'BOOTSTRAP_MANAGER_EMAIL'], hasUsers: true }))).toEqual(['ok', 'warn']);
    expect(levels(checkSecrets({ required: req, present: ['RESEND_API_KEY'], hasUsers: false }))).toEqual(['ok', 'fail']);
    expect(levels(checkSecrets({ required: req, present: ['RESEND_API_KEY'], hasUsers: true }))).toEqual(['ok']);
  });
  it('flags the retired household secret', () => {
    const f = checkSecrets({ required: ['RESEND_API_KEY'], present: ['RESEND_API_KEY', 'MEALQ_HOUSEHOLD_ID'], hasUsers: true });
    expect(f.some((x: { level: string; msg: string }) => x.level === 'warn' && /MEALQ_HOUSEHOLD_ID/.test(x.msg))).toBe(true);
  });
  it('parses secret names only', () => {
    expect(parseSecretList('[{"name":"A","type":"secret_text"},{"name":"B","type":"secret_text"}]')).toEqual(['A', 'B']);
  });
});

describe('doctor: database, backups, releases', () => {
  it('judges members and managers', () => {
    expect(levels(checkUsers({ total: 0, managers: 0 }))).toEqual(['ok']);
    expect(levels(checkUsers({ total: 3, managers: 1 }))).toEqual(['ok']);
    expect(levels(checkUsers({ total: 3, managers: 0 }))).toEqual(['fail']);
  });
  it('judges migrations', () => {
    expect(levels(checkMigrations({ pending: [], unknown: [] }))).toEqual(['ok']);
    expect(levels(checkMigrations({ pending: ['0003_x.sql'], unknown: [] }))).toEqual(['warn']);
    expect(levels(checkMigrations({ pending: [], unknown: ['0009_y.sql'] }))).toEqual(['fail']);
  });
  it('finds the newest backup and warns when there is none or it is old', () => {
    const names = ['family-dashboard-2026-07-01T00-00-00-000Z.sql', 'family-dashboard-2026-10-06T15-03-49-983Z.sql', 'notes.txt'];
    expect(latestBackup(names)).toBe(Date.parse('2026-10-06T15:03:49.983Z'));
    const now = Date.parse('2026-10-08T00:00:00Z');
    expect(levels(checkBackups(names, now))).toEqual(['ok']);
    expect(levels(checkBackups([], now))).toEqual(['warn']);
    expect(levels(checkBackups(['family-dashboard-2026-01-01T00-00-00-000Z.sql'], now))).toEqual(['warn']);
  });
  it('compares this checkout with the last deploy', () => {
    const r = { version: '0.1.0', deployedAt: 'x' };
    const run = (version: string, recorded: typeof r | null) => levels(checkDeployed({ recorded, version, versionCompare: compareVersions }));
    expect(run('0.1.0', r)).toEqual(['ok']);
    expect(run('0.2.0', r)).toEqual(['warn']);
    expect(run('0.0.9', r)).toEqual(['warn']);
    expect(run('0.1.0', null)).toEqual(['warn']);
  });
});

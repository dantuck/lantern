#!/usr/bin/env node
// Read-only health check of your install, run on YOUR machine:
//
//   npm run doctor               checks config, Cloudflare login, secrets, database and backups
//   npm run doctor -- --offline  only the checks that need no network (config, Node, local files)
//
// It changes nothing, prints secret NAMES but never values, and talks only to your own Cloudflare account through wrangler.
// Exit code is 1 if anything is broken (✗), 0 otherwise; warnings (!) are worth reading but do not fail.
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIVACY_ENV } from './lib/privacy-env.mjs';
import { readWranglerValues, checkAccountId, checkDatabaseId } from './lib/setup-config.mjs';
import { compareVersions, diffMigrations, parseAppliedMigrations } from './lib/update-helpers.mjs';
import {
  checkBackups, checkDeployed, checkMigrations, checkNode, checkSecrets, checkUsers, checkWranglerConfig, parseSecretList, requiredSecrets,
} from './lib/doctor-checks.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OFFLINE = process.argv.includes('--offline');
const findings = [];

const ICON = { ok: '✓', warn: '!', fail: '✗' };
function section(title, items) {
  console.log(`\n\u001b[1m${title}\u001b[0m`);
  for (const f of items) {
    console.log(`  ${ICON[f.level]} ${f.msg}`);
    if (f.fix) console.log(`      fix: ${f.fix}`);
    findings.push(f);
  }
}
const ok = (msg) => ({ level: 'ok', msg });
const warn = (msg, fix) => ({ level: 'warn', msg, fix });
const fail = (msg, fix) => ({ level: 'fail', msg, fix });

console.log(`Lantern doctor${OFFLINE ? ' (offline: Cloudflare checks skipped)' : ''}`);

section('This machine', checkNode(process.versions.node));

// ---------- local files ----------
const wranglerPath = join(ROOT, 'wrangler.jsonc');
const dashboardPath = join(ROOT, 'dashboard.config.ts');
if (!existsSync(wranglerPath) || !existsSync(dashboardPath)) {
  section('Settings files', [fail('wrangler.jsonc or dashboard.config.ts is missing', 'run `npm ci` (or `npm run init`), then `npm run setup`')]);
  finish();
}
const wranglerText = readFileSync(wranglerPath, 'utf8');
const dashboardText = readFileSync(dashboardPath, 'utf8');
section('Settings (wrangler.jsonc)', checkWranglerConfig(wranglerText));

const sources = {};
const pluginsDir = join(ROOT, 'src', 'plugins');
for (const id of readdirSync(pluginsDir)) {
  const p = join(pluginsDir, id, 'plugin.ts');
  if (existsSync(p)) sources[id] = readFileSync(p, 'utf8');
}
const { required, enabled, unknown } = requiredSecrets(dashboardText, sources);
section('Widgets (dashboard.config.ts)', [
  enabled.length ? ok(`enabled: ${enabled.join(', ')}`) : warn('no widgets are enabled', 'add one to dashboard.config.ts'),
  ...unknown.map((id) => fail(`dashboard.config.ts enables "${id}" but there is no such plugin`, 'fix the id in dashboard.config.ts')),
]);

let version = '0.0.0';
try { version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version; } catch { /* reported by tests, not here */ }
let recorded = null;
try { recorded = JSON.parse(readFileSync(join(ROOT, '.deployed.json'), 'utf8')); } catch { /* none yet */ }
section('Releases', checkDeployed({ recorded, version, versionCompare: compareVersions }));

const backupDir = join(ROOT, 'backups');
section('Backups', checkBackups(existsSync(backupDir) ? readdirSync(backupDir) : []));

// ---------- Cloudflare ----------
const v = readWranglerValues(wranglerText);
const configured = v.accountId && !checkAccountId(v.accountId) && v.databaseId && !checkDatabaseId(v.databaseId);
if (OFFLINE) {
  console.log('\nSkipped (offline): Cloudflare login, secrets, database.');
} else if (!configured) {
  console.log('\nSkipped: Cloudflare checks need an account and database id in wrangler.jsonc (run `npm run setup`).');
} else {
  const wr = (args) => spawnSync('npx', ['wrangler', ...args], {
    cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, ...PRIVACY_ENV, CLOUDFLARE_ACCOUNT_ID: v.accountId },
  });

  const who = wr(['whoami', '--json']);
  let info;
  try { info = JSON.parse(who.stdout); } catch { /* handled below */ }
  const account = info?.loggedIn ? info.accounts?.find((a) => a.id === v.accountId) : null;
  section('Cloudflare', [
    !info?.loggedIn ? fail('not logged in to Cloudflare', 'npx wrangler login')
      : account ? ok(`logged in; account "${account.name}"`)
        : fail('logged in, but not to the account pinned in wrangler.jsonc', 'npx wrangler login with the right account, or re-run `npm run setup`'),
  ]);

  if (account) {
    // Database first: whether anyone has signed in changes how the bootstrap secret is judged.
    const dbName = v.databaseName ?? 'lantern';
    const sql = (q) => wr(['d1', 'execute', dbName, '--remote', '--json', '--command', q]);
    let hasUsers;
    const dbFindings = [];
    const mig = sql('SELECT name FROM d1_migrations ORDER BY id');
    if (mig.status !== 0) {
      dbFindings.push(fail(`could not read database "${dbName}": ${(mig.stderr || mig.stdout).split('\n').find((l) => l.trim()) ?? 'unknown error'}`, 'run `npm run setup` or `npm run update`'));
    } else {
      const files = readdirSync(join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql'));
      dbFindings.push(...checkMigrations(diffMigrations(files, parseAppliedMigrations(mig.stdout))));
      const u = sql("SELECT count(*) AS total, coalesce(sum(role = 'manager' AND disabled_at IS NULL), 0) AS managers FROM users");
      try {
        const row = JSON.parse(u.stdout)[0].results[0];
        hasUsers = Number(row.total) > 0;
        dbFindings.push(...checkUsers({ total: Number(row.total), managers: Number(row.managers) }));
      } catch { dbFindings.push(warn('could not count members (run `npm run update` if the database is behind)')); }
    }
    section('Database', dbFindings);

    const sec = wr(['secret', 'list', '--format', 'json']);
    if (sec.status !== 0) {
      section('Secrets', [warn('could not list secrets; the Worker may not be deployed yet', 'run `npm run setup` or `npm run update`')]);
    } else {
      section('Secrets', checkSecrets({ required, present: parseSecretList(sec.stdout), hasUsers }));
    }

    section('Reaching the site', [ok(`open https://${v.hostname}/login in a browser; this tool does not contact it`)]);
  }
}

finish();

function finish() {
  const bad = findings.filter((f) => f.level === 'fail').length;
  const warns = findings.filter((f) => f.level === 'warn').length;
  console.log(`\n${bad ? `✗ ${bad} problem(s)` : '✓ no problems'}${warns ? `, ${warns} warning(s)` : ''}.`);
  process.exit(bad ? 1 : 0);
}

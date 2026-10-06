#!/usr/bin/env node
// Safe update of an existing deployment, run on YOUR machine after you have pulled or checked out the
// release you want (`git pull`, or `git checkout v0.2.0`). Nothing is fetched from anywhere by this script.
//
//   npm run update                  do it for real
//   npm run update -- --dry-run     show what would happen; changes nothing (read-only queries still run)
//
// Order matters: Cloudflare login and checks first (nothing touched if they fail), then a database backup, then migrations,
// then the new code. Migrations are forward-only and are compatible with the previous release.
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPrompter } from './lib/prompt.mjs';
import { PRIVACY_ENV } from './lib/privacy-env.mjs';
import { checkAccountId, checkDatabaseId, readWranglerValues } from './lib/setup-config.mjs';
import {
  assessLogin, authHint, backupFileName, compareVersions, diffMigrations, entriesBetween, isVersion, parseAppliedMigrations, parseChangelog,
} from './lib/update-helpers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');
const DEPLOYED = join(ROOT, '.deployed.json');
const BACKUPS = join(ROOT, 'backups');
const { yesNo, finish } = createPrompter();

const step = (n, title) => console.log(`\n\u001b[1m${n}. ${title}\u001b[0m`);
const dry = (what) => console.log(`  [dry-run] would ${what}`);
const warn = (msg) => console.log(`  ! ${msg}`);
function die(msg) {
  finish();
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}
const git = (args) => {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  return { ok: r.status === 0, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() };
};

console.log(`Family Dashboard update${DRY ? ' (dry run: nothing will be changed)' : ''}`);

// ---------- 1. what is being deployed ----------
step(1, 'What you are about to deploy');
const config = existsSync(join(ROOT, 'wrangler.jsonc')) ? readWranglerValues(readFileSync(join(ROOT, 'wrangler.jsonc'), 'utf8')) : null;
if (!config || /example\.com/.test(config.hostname ?? '') || checkDatabaseId(config.databaseId ?? '') || checkAccountId(config.accountId ?? '')) {
  die('this install is not set up yet (wrangler.jsonc has placeholders or no account_id). Run `npm run setup` first.');
}
const account = config.accountId;
const dbName = config.databaseName ?? 'family-dashboard';
const version = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
if (!isVersion(version)) die(`package.json version "${version}" is not x.y.z.`);
let last = null;
try { last = JSON.parse(readFileSync(DEPLOYED, 'utf8')); } catch { /* first update on this machine */ }
if (last && !isVersion(last.version)) last = null;

console.log(`  site              https://${config.hostname}`);
console.log(`  this checkout     v${version}`);
console.log(`  last deployed     ${last ? `v${last.version} (${last.deployedAt})` : 'unknown (no record on this machine)'}`);
if (last && compareVersions(version, last.version) < 0) {
  die(`this checkout (v${version}) is older than what you last deployed (v${last.version}). Migrations only go forward; to undo a deploy use \`npx wrangler rollback\`.`);
}

const entries = entriesBetween(parseChangelog(readFileSync(join(ROOT, 'CHANGELOG.md'), 'utf8')), last?.version ?? null, version);
if (last && version === last.version) console.log('  Same version as the last deploy.');
if (entries.length) {
  console.log(`\n  Changes${last ? ` since v${last.version}` : ' (latest release)'}:`);
  for (const e of entries) console.log(`\n  v${e.version}${e.date ? ` (${e.date})` : ''}\n${e.body.split('\n').map((l) => `    ${l}`).join('\n')}`);
  if (entries.some((e) => /###\s*Action required/i.test(e.body))) warn('A release above lists "Action required". Read it before continuing.');
} else {
  console.log('  No changelog entries to show.');
}

// ---------- 2. is this checkout trustworthy ----------
step(2, 'Source check');
const problems = [];
if (!git(['rev-parse', 'HEAD']).ok) {
  warn('not a git checkout, so the release cannot be verified.');
  problems.push('not a git checkout');
} else {
  const dirty = git(['status', '--porcelain', '--untracked-files=no']).out;
  if (dirty) { warn(`tracked files have local changes:\n${dirty.split('\n').map((l) => `      ${l}`).join('\n')}`); problems.push('local changes'); }
  const tag = `v${version}`;
  const here = git(['tag', '--points-at', 'HEAD']).out.split('\n');
  if (!here.includes(tag)) {
    warn(`HEAD is not tagged ${tag}; you would deploy unreleased code.`);
    problems.push('untagged commit');
  } else if (git(['tag', '-v', tag]).ok) {
    console.log(`  ${tag} is on HEAD and its signature verifies.`);
  } else {
    warn(`${tag} is on HEAD but is not a verifiable signed tag (unsigned, or its key is not in your keyring).`);
    problems.push('unverified tag');
  }
}
if (problems.length && !(await yesNo(`Deploy anyway (${problems.join(', ')})?`, false))) die('stopped; nothing was changed.');

// ---------- 3. cloudflare login ----------
// Checked before the slow checks and before anything is touched, so a missing or wrong login stops the update right away.
step(3, 'Cloudflare login');
const wr = (args, opts = {}) => spawnSync('npx', ['wrangler', ...args], {
  cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...PRIVACY_ENV, CLOUDFLARE_ACCOUNT_ID: account },
  stdio: opts.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
});
const login = assessLogin(wr(['whoami', '--json'], { capture: true }).stdout, account);
if (login.state !== 'ok') {
  const why = {
    logged_out: 'you are not logged in to Cloudflare',
    wrong_account: `you are logged in to ${login.names?.map((n) => `"${n}"`).join(', ') || 'other accounts'}, not the account in wrangler.jsonc (${account})`,
    unreadable: 'Wrangler could not report your Cloudflare login',
  }[login.state];
  const fix = process.env.CLOUDFLARE_API_TOKEN
    ? 'CLOUDFLARE_API_TOKEN is set and is used instead of `npx wrangler login`. Unset it, or replace it with a valid token for this account, then re-run `npm run update`'
    : 'Run `npx wrangler login` (choose the right account), then re-run `npm run update`';
  die(`${why}. ${fix}. Nothing was changed.`);
}
console.log(`  Logged in; account "${login.accountName}".`);
// A login can still lack access to the database (for example an API token without D1 permission), which is better found now than after the checks.
const probe = wr(['d1', 'execute', dbName, '--remote', '--json', '--command', 'SELECT 1'], { capture: true });
if (probe.status !== 0) {
  const out = `${probe.stderr}${probe.stdout}`;
  die(`cannot reach the database "${dbName}" with this login:\n${out.trim()}${authHint(out) ? `\n\n${authHint(out)}` : ''}\nNothing was changed.`);
}
console.log(`  Can reach the database "${dbName}".`);

// ---------- 4. checks ----------
step(4, 'Checks');
if (DRY) dry('run `npm run verify` (tests, types, build, client-bundle secret scan, dependency audit)');
else if (spawnSync('npm', ['run', 'verify'], { cwd: ROOT, stdio: 'inherit' }).status !== 0) die('verify failed; nothing was changed. Fix the failure (or pick a different release) and re-run.');

// ---------- 5. migrations ----------
step(5, 'Database migrations');
const q = wr(['d1', 'execute', dbName, '--remote', '--json', '--command', 'SELECT name FROM d1_migrations ORDER BY id'], { capture: true });
let applied;
if (q.status === 0) applied = parseAppliedMigrations(q.stdout);
else if (/no such table/i.test(`${q.stdout}${q.stderr}`)) applied = [];
else {
  const out = q.stderr || q.stdout;
  die(`could not read the migration state of "${dbName}":\n${out}${authHint(out) ? `\n\n${authHint(out)}` : ''}`);
}
const { pending, unknown } = diffMigrations(readdirSync(join(ROOT, 'migrations')).filter((f) => f.endsWith('.sql')), applied);
if (unknown.length) die(`the live database has migrations this checkout does not know (${unknown.join(', ')}). You are behind: pull the latest release first.`);
console.log(pending.length ? `  Pending: ${pending.join(', ')}` : '  Up to date; nothing to migrate.');

// ---------- 6. backup ----------
step(6, 'Backup');
const backupPath = join(BACKUPS, backupFileName(dbName));
if (DRY) {
  dry(`export "${dbName}" to ${backupPath}`);
} else {
  mkdirSync(BACKUPS, { recursive: true, mode: 0o700 });
  const ex = wr(['d1', 'export', dbName, '--remote', '--output', backupPath]);
  if (ex.status !== 0 || !existsSync(backupPath) || statSync(backupPath).size === 0) die('the backup failed or is empty; nothing was changed.');
  chmodSync(backupPath, 0o600);
  console.log(`  Saved ${backupPath} (contains member emails and the audit log; keep it private).`);
}

if (!(await yesNo(`Apply${pending.length ? ` ${pending.length} migration(s) and` : ''} deploy v${version} to https://${config.hostname}?`))) {
  die('stopped; the database was backed up but nothing else was changed.');
}

// ---------- 7. migrate + deploy ----------
step(7, 'Apply and deploy');
if (DRY) {
  if (pending.length) dry('apply migrations');
  dry('wrangler deploy, then record the version in .deployed.json');
} else {
  if (pending.length && spawnSync('npm', ['run', 'db:migrate:remote'], { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...PRIVACY_ENV, CLOUDFLARE_ACCOUNT_ID: account } }).status !== 0) {
    die(`migrations failed. The code was not deployed. Your backup is at ${backupPath}.`);
  }
  if (wr(['deploy']).status !== 0) die(`deploy failed. Migrations are applied but they are compatible with the previous release, which is still live. Backup: ${backupPath}.`);
  const head = git(['rev-parse', 'HEAD']);
  writeFileSync(DEPLOYED, `${JSON.stringify({ version, commit: head.ok ? head.out : null, deployedAt: new Date().toISOString() }, null, 2)}\n`);
  console.log(`  Deployed v${version}.`);
}

console.log('\nIf something looks wrong:');
console.log('  - code:     npx wrangler rollback   (returns to the previous Worker version; the database stays migrated, which is safe)');
console.log(`  - database: last resort only. The export recreates tables, so it cannot be replayed over the live database: create a new`);
console.log(`              database, load ${DRY ? 'the backup' : backupPath} into it with \`npx wrangler d1 execute <new-name> --remote --file <backup>\`,`);
console.log('              and point database_id in wrangler.jsonc at it.');
finish();

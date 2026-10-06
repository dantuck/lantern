// Pure helpers for scripts/update.mjs and the migration seal. No I/O, so they can be unit-tested.
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export const isVersion = (v) => SEMVER.test(String(v));

/** <0, 0, >0 like a comparator. Throws on anything that is not plain x.y.z. */
export function compareVersions(a, b) {
  const pa = String(a).match(SEMVER);
  const pb = String(b).match(SEMVER);
  if (!pa || !pb) throw new Error(`not a plain x.y.z version: ${!pa ? a : b}`);
  for (let i = 1; i <= 3; i++) if (pa[i] !== pb[i]) return Number(pa[i]) - Number(pb[i]);
  return 0;
}

/** Parses "## [x.y.z] - date" sections (Keep a Changelog). "## [Unreleased]" is returned with version null. */
export function parseChangelog(text) {
  const entries = [];
  let cur = null;
  for (const line of String(text).split('\n')) {
    const h = line.match(/^##\s+\[([^\]]+)\](?:\s*-\s*(\S+))?/);
    if (h) {
      cur = { version: isVersion(h[1]) ? h[1] : null, label: h[1], date: h[2] ?? null, body: [] };
      entries.push(cur);
    } else if (cur) cur.body.push(line);
  }
  return entries.map((e) => ({ ...e, body: e.body.join('\n').trim() }));
}

/** Released entries with from < version <= to, newest first. `from` null means "only the newest". */
export function entriesBetween(entries, from, to) {
  const released = entries.filter((e) => e.version && compareVersions(e.version, to) <= 0)
    .sort((x, y) => compareVersions(y.version, x.version));
  if (from == null) return released.slice(0, 1);
  return released.filter((e) => compareVersions(e.version, from) > 0);
}

/** Migration files not yet applied, in order. Also reports applied names this checkout does not have. */
export function diffMigrations(files, applied) {
  const have = new Set(files);
  const done = new Set(applied);
  return {
    pending: [...files].sort().filter((f) => !done.has(f)),
    unknown: [...applied].filter((a) => !have.has(a)).sort(),
  };
}

/** Extracts migration names from `wrangler d1 execute --json` output for `SELECT name FROM d1_migrations`. */
export function parseAppliedMigrations(stdout) {
  const parsed = JSON.parse(stdout);
  const first = Array.isArray(parsed) ? parsed[0] : parsed;
  return (first?.results ?? []).map((r) => String(r.name));
}

export const backupFileName = (dbName, now = new Date()) =>
  `${dbName}-${now.toISOString().replace(/[:.]/g, '-')}.sql`;

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

/**
 * Checks migration files against the sealed manifest. Returns a list of problems (empty = fine):
 * an applied migration must never be edited, so any hash change is a problem, and numbering must have no gaps.
 */
export function checkMigrationSeal(files, contents, manifest) {
  const problems = [];
  const names = [...files].sort();
  names.forEach((f, i) => {
    const n = f.match(/^(\d{4})_[a-z0-9_]+\.sql$/);
    if (!n) problems.push(`${f}: name must look like 0001_description.sql`);
    else if (Number(n[1]) !== i + 1) problems.push(`${f}: migrations must be numbered 0001, 0002, ... without gaps`);
    if (!(f in manifest)) problems.push(`${f}: not sealed; run \`npm run migrations:seal\``);
    else if (manifest[f] !== sha256(contents[f])) problems.push(`${f}: changed after it was sealed; applied migrations are immutable, add a new migration instead`);
  });
  for (const f of Object.keys(manifest)) if (!names.includes(f)) problems.push(`${f}: sealed but the file is missing`);
  return problems;
}

/**
 * Reads `wrangler whoami --json` output and says whether it can act on `accountId`:
 * ok, logged_out, wrong_account (logged in, but not to that account) or unreadable.
 */
export function assessLogin(stdout, accountId) {
  let info;
  try { info = JSON.parse(stdout); } catch { return { state: 'unreadable' }; }
  if (!info?.loggedIn) return { state: 'logged_out' };
  const accounts = info.accounts ?? [];
  const account = accounts.find((a) => a.id === accountId);
  return account ? { state: 'ok', accountName: account.name } : { state: 'wrong_account', names: accounts.map((a) => a.name) };
}

/** A plain-language fix when Wrangler's error text is about credentials rather than the database, or null. */
export function authHint(text) {
  if (!/\b7403\b|\b10000\b|not authorized|authentication error|not logged in|invalid (api )?token|unauthori[sz]ed/i.test(String(text))) return null;
  return 'Cloudflare refused these credentials. Run `npx wrangler whoami` to see which account and permissions Wrangler is using. '
    + 'If CLOUDFLARE_API_TOKEN is set it overrides `npx wrangler login`: unset it, or use a token for this account with D1 Edit and Workers Scripts Edit. '
    + 'Otherwise run `npx wrangler login` and choose the account in wrangler.jsonc.';
}

/**
 * wrangler.jsonc may set `migrations_dir` on the D1 binding, and it is read relative to that file. A wrong value (for example
 * "../../migrations", which belongs to a generated config one level down) makes `d1 migrations apply` look in the wrong
 * folder. Returns a message when it does not resolve to `<root>/migrations`, or null when it is unset or right.
 */
export function migrationsDirProblem(configText, root) {
  const m = String(configText).match(/^\s*"migrations_dir"\s*:\s*"([^"]*)"/m);
  if (!m) return null;
  const target = resolve(root, m[1]);
  if (target === resolve(root, 'migrations')) return null;
  return `wrangler.jsonc sets migrations_dir to "${m[1]}", which points at ${target}, not this project's migrations folder. `
    + 'Delete that line (Wrangler\'s default is the right folder) and re-run.';
}

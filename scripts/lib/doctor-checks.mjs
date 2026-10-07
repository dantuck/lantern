// Pure checks for scripts/doctor.mjs. Each returns findings: { level: 'ok' | 'warn' | 'fail', msg, fix? }.
import { checkAccountId, checkDatabaseId, checkEmail, checkHostname, nodeVersionOk, MIN_NODE, readWranglerValues } from './setup-config.mjs';

const ok = (msg) => ({ level: 'ok', msg });
const warn = (msg, fix) => ({ level: 'warn', msg, fix });
const fail = (msg, fix) => ({ level: 'fail', msg, fix });

/** Secrets that were once required and are now dead weight; worth telling people to delete. */
export const RETIRED_SECRETS = ['MEALQ_HOUSEHOLD_ID'];

export function checkNode(version) {
  return nodeVersionOk(version)
    ? [ok(`Node ${version}`)]
    : [fail(`Node ${version} is too old (need ${MIN_NODE} or newer)`, 'install a current Node from nodejs.org')];
}

export function checkWranglerConfig(text) {
  const v = readWranglerValues(text);
  const out = [];
  const hostProblem = v.hostname ? checkHostname(v.hostname) : 'missing';
  if (hostProblem) out.push(fail(`hostname "${v.hostname ?? ''}": ${hostProblem}`, 'run `npm run setup`'));
  else out.push(ok(`hostname ${v.hostname}`));

  const origin = text.match(/"APP_ORIGIN"\s*:\s*"([^"]*)"/)?.[1];
  if (!origin || origin !== `https://${v.hostname}`) {
    out.push(fail(`APP_ORIGIN is "${origin ?? ''}" but should be "https://${v.hostname ?? '<hostname>'}"; the app refuses to send links otherwise`, 'run `npm run setup`'));
  } else out.push(ok('APP_ORIGIN matches the hostname (https)'));

  const sender = v.mailFrom?.match(/<([^>]+)>/)?.[1] ?? v.mailFrom;
  if (!sender || checkEmail(sender) || /@example\./.test(sender)) out.push(fail(`MAIL_FROM "${v.mailFrom ?? ''}" is not a real sender address`, 'run `npm run setup`'));
  else out.push(ok(`sender ${sender}`));

  out.push(v.accountId && !checkAccountId(v.accountId)
    ? ok('Cloudflare account is pinned')
    : fail('no account_id pinned in wrangler.jsonc, so a deploy could go to the wrong account', 'run `npm run setup`'));
  out.push(v.databaseId && !checkDatabaseId(v.databaseId)
    ? ok('database id is set')
    : fail('database_id is still a placeholder', 'run `npm run setup`'));

  if (/"observability"\s*:\s*\{\s*"enabled"\s*:\s*true/.test(text)) out.push(warn('request logging (observability) is on; logs live in your Cloudflare account and can include sign-in addresses', 'set "observability": { "enabled": false } unless you are debugging'));
  else out.push(ok('request logging is off'));
  if (!/"send_metrics"\s*:\s*false/.test(text)) out.push(warn('wrangler usage metrics are not switched off in this config', 'add "send_metrics": false (see wrangler.template.jsonc)'));
  return out;
}

/** Secrets the deployment needs: RESEND_API_KEY plus whatever each enabled widget declares. */
export function requiredSecrets(configText, pluginSources) {
  const required = new Set(['RESEND_API_KEY']);
  const unknown = [];
  // `example` is a dev-only template (see dashboard.config.example.ts): never shown in production, needs no secrets.
  const enabled = [...configText.matchAll(/\bid:\s*'([a-z][a-z0-9-]*)'/g)].map((m) => m[1]).filter((id) => id !== 'example');
  for (const id of enabled) {
    const src = pluginSources[id];
    if (src === undefined) { unknown.push(id); continue; }
    const list = src.match(/\bsecrets:\s*\[([^\]]*)\]/)?.[1] ?? '';
    for (const m of list.matchAll(/'([A-Z][A-Z0-9_]+)'/g)) required.add(m[1]);
  }
  return { required: [...required].sort(), enabled, unknown };
}

export const parseSecretList = (stdout) => JSON.parse(stdout).map((s) => String(s.name));

export function checkSecrets({ required, present, hasUsers }) {
  const have = new Set(present);
  const out = [];
  const missing = required.filter((s) => !have.has(s));
  if (missing.length) out.push(fail(`missing secrets: ${missing.join(', ')}`, missing.map((s) => `npx wrangler secret put ${s}`).join('  |  ')));
  else out.push(ok(`all ${required.length} required secrets are set`));
  for (const s of present.filter((p) => RETIRED_SECRETS.includes(p))) out.push(warn(`${s} is no longer used`, `npx wrangler secret delete ${s}`));
  if (have.has('BOOTSTRAP_MANAGER_EMAIL')) {
    out.push(hasUsers
      ? warn('BOOTSTRAP_MANAGER_EMAIL is still set but people have signed in; it has no further use', 'npx wrangler secret delete BOOTSTRAP_MANAGER_EMAIL')
      : ok('BOOTSTRAP_MANAGER_EMAIL is set and nobody has signed in yet (expected before first sign-in)'));
  } else if (hasUsers === false) {
    out.push(fail('nobody has signed in yet and there is no BOOTSTRAP_MANAGER_EMAIL, so no one can create the first account', 'npx wrangler secret put BOOTSTRAP_MANAGER_EMAIL'));
  }
  return out;
}

export function checkUsers({ total, managers }) {
  if (total === 0) return [ok('no members yet (the first sign-in creates the manager)')];
  if (managers === 0) return [fail(`${total} member(s) but no active manager; nobody can invite or manage`, 'see "Operating it" in the README to promote one')];
  return [ok(`${total} member(s), ${managers} manager(s)`)];
}

/** Newest timestamp in names like lantern-2026-10-06T15-03-49-983Z.sql, as epoch ms (or null). */
export function latestBackup(names) {
  let best = null;
  for (const n of names) {
    const m = n.match(/(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.sql$/);
    if (!m) continue;
    const t = Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`);
    if (!Number.isNaN(t) && (best === null || t > best)) best = t;
  }
  return best;
}

export function checkBackups(names, now = Date.now()) {
  const t = latestBackup(names);
  if (t === null) return [warn('no backup on this machine yet', '`npm run update` takes one before every update, or: npx wrangler d1 export lantern --remote --output backup.sql')];
  const days = Math.floor((now - t) / 86_400_000);
  return days > 90
    ? [warn(`latest backup is ${days} days old`, 'npx wrangler d1 export lantern --remote --output backup.sql')]
    : [ok(`latest backup is ${days} day(s) old`)];
}

export function checkMigrations({ pending, unknown }) {
  const out = [];
  if (unknown.length) out.push(fail(`the live database has migrations this checkout does not know: ${unknown.join(', ')}`, 'check out the newest release, then `npm run update`'));
  if (pending.length) out.push(warn(`${pending.length} migration(s) not applied yet: ${pending.join(', ')}`, '`npm run update`'));
  if (!unknown.length && !pending.length) out.push(ok('database is up to date with this checkout'));
  return out;
}

export function checkDeployed({ recorded, version, versionCompare }) {
  if (!recorded) return [warn('no record of a deploy from this machine (.deployed.json)', '`npm run update` records one')];
  const c = versionCompare(version, recorded.version);
  if (c > 0) return [warn(`this checkout (v${version}) is newer than what you last deployed (v${recorded.version})`, '`npm run update`')];
  if (c < 0) return [warn(`this checkout (v${version}) is older than what you last deployed (v${recorded.version})`, 'check out the release you deployed, or the newest one')];
  return [ok(`last deployed v${recorded.version} (${recorded.deployedAt})`)];
}

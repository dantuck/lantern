#!/usr/bin/env node
// Guided first-time setup, run on YOUR machine with YOUR Cloudflare login (`npx wrangler login`).
// Nothing here talks to anyone but Cloudflare (via wrangler). Secrets are typed hidden, kept in memory,
// and piped to `wrangler secret bulk` over stdin: they are never written to disk or echoed.
//
//   npm run setup               do it for real
//   npm run setup -- --dry-run  ask the questions and show what would happen; changes nothing
//
// Safe to re-run: existing values become the defaults and finished steps are skipped or reused.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  applyDashboardValues, applyWranglerValues, checkAccountId, checkEmail, defaultSender, checkHostname, checkTimeZone,
  MIN_NODE, nodeVersionOk, normalizeHostname, parseDatabaseId, readWranglerValues,
} from './lib/setup-config.mjs';
import { createPrompter } from './lib/prompt.mjs';
import { PRIVACY_ENV } from './lib/privacy-env.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry-run');
const DB_NAME = 'family-dashboard';
const WRANGLER = join(ROOT, 'wrangler.jsonc');
const DASHBOARD = join(ROOT, 'dashboard.config.ts');

// ---------- prompts ----------
const { ask, yesNo, finish } = createPrompter();

// ---------- running things ----------
function wrangler(args, { account, input, capture = false } = {}) {
  const env = { ...process.env, ...PRIVACY_ENV, ...(account ? { CLOUDFLARE_ACCOUNT_ID: account.id } : {}) };
  return spawnSync('npx', ['wrangler', ...args], {
    cwd: ROOT, env, input, encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : [input === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit'],
  });
}
const npm = (script) => spawnSync('npm', ['run', script], { cwd: ROOT, stdio: 'inherit' }).status === 0;
const step = (n, title) => console.log(`\n\u001b[1m${n}. ${title}\u001b[0m`);
const dry = (what) => console.log(`  [dry-run] would ${what}`);
function die(msg) {
  finish();
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

// ---------- main ----------
console.log(`Family Dashboard setup${DRY ? ' (dry run: nothing will be changed)' : ''}`);
console.log('You will need: a Cloudflare account with your domain on it, and a Resend account with that domain verified.');

if (!nodeVersionOk(process.versions.node)) die(`Node ${MIN_NODE} or newer is required (you have ${process.versions.node}).`);
spawnSync(process.execPath, [join(ROOT, 'scripts/init-config.mjs')], { cwd: ROOT, stdio: 'inherit' });
if (!existsSync(WRANGLER) || !existsSync(DASHBOARD)) die('could not create wrangler.jsonc / dashboard.config.ts from the templates.');
const current = readWranglerValues(readFileSync(WRANGLER, 'utf8'));
const isPlaceholder = (v) => !v || /example\.com|REPLACE|^$/.test(v);

step(1, 'Cloudflare account');
const who = wrangler(['whoami', '--json'], { capture: true });
let info;
try { info = JSON.parse(who.stdout); } catch { /* handled below */ }
if (!info?.loggedIn) die('not logged in to Cloudflare. Run `npx wrangler login`, then re-run setup.');
const accounts = (info.accounts ?? []).map((a) => ({ id: a.id, name: a.name }));
if (accounts.length === 0) die('this login has no Cloudflare accounts.');
let account;
if (accounts.length === 1) {
  account = accounts[0];
  console.log(`  Using account "${account.name}".`);
} else {
  accounts.forEach((a, i) => console.log(`  ${i + 1}) ${a.name}`));
  const defIdx = Math.max(0, accounts.findIndex((a) => a.id === current.accountId)) + 1;
  const pick = await ask('Which account will host the dashboard? Enter a number', {
    def: current.accountId ? String(defIdx) : undefined,
    check: (v) => (accounts[Number(v) - 1] ? null : `enter 1-${accounts.length}`),
  });
  account = accounts[Number(pick) - 1];
}
if (checkAccountId(account.id)) die('unexpected account id from wrangler.');
console.log('  The account is pinned in your local wrangler.jsonc so a later deploy cannot go to the wrong one.');

step(2, 'Your household');
const hostname = normalizeHostname(await ask('Hostname for the dashboard (a domain on this Cloudflare account)', {
  def: isPlaceholder(current.hostname) ? undefined : current.hostname, check: checkHostname,
}));
const sender = await ask('Address emails are sent from (its domain must be verified in Resend)', {
  def: defaultSender(hostname, current.mailFrom), check: checkEmail,
});
const mailFrom = `Family Dashboard <${sender}>`;
const timeZone = await ask('Time zone (IANA name, e.g. America/Chicago)', { def: 'America/New_York', check: checkTimeZone });
const bootstrap = await ask('Your email address (becomes the first manager)', { check: checkEmail });

const useCalendar = await yesNo('Show a Google Calendar widget?');
let calendarJson;
let calendarId;
if (useCalendar) {
  const file = await ask('  Path to your Google service-account JSON key file', {
    check: (p) => {
      try {
        const j = JSON.parse(readFileSync(resolve(p.replace(/^~/, process.env.HOME ?? '~')), 'utf8'));
        return j.client_email && j.private_key ? null : 'not a service-account key (needs client_email and private_key)';
      } catch { return 'could not read that file as JSON'; }
    },
  });
  calendarJson = JSON.stringify(JSON.parse(readFileSync(resolve(file.replace(/^~/, process.env.HOME ?? '~')), 'utf8')));
  calendarId = await ask('  Google Calendar ID (shared with the service account)', { check: (v) => (v ? null : 'required') });
}
const useMealq = await yesNo('Show the MealQ meal plan widget?');
let mealqHost;
let mealqToken;
if (useMealq) {
  mealqHost = normalizeHostname(await ask('  MealQ API hostname', { check: checkHostname }));
  mealqToken = await ask('  MealQ access token (hidden)', { hidden: true, check: (v) => (v ? null : 'required') });
}
const resendKey = await ask('Resend API key, sending access only (hidden)', {
  hidden: true, check: (v) => (v ? null : 'required'),
});
if (!resendKey.startsWith('re_')) console.log('  note: Resend keys normally start with "re_"; continuing.');

console.log(`\nBefore going on, in Resend: the domain of ${sender} must be verified (SPF + DKIM), a DMARC record added,`);
console.log('and link/open tracking left OFF (it rewrites the sign-in link and breaks it).');
console.log('A separate mail subdomain (e.g. mail.yourdomain) keeps these records apart from your main domain; one _dmarc');
console.log('record on the main domain covers its subdomains. See docs/setup-guide.md, "Using a subdomain".');
if (!(await yesNo('Is that done?', false))) die('finish the Resend setup, then re-run `npm run setup` (your answers will be offered as defaults).');

console.log(`\nSummary\n  account   ${account.name}\n  site      https://${hostname}\n  sender    ${mailFrom}\n  time zone ${timeZone}\n  manager   ${bootstrap}`);
console.log(`  widgets   ${[useCalendar && 'calendar', useMealq && `mealq (${mealqHost})`].filter(Boolean).join(', ') || 'none'}`);
if (!(await yesNo('Proceed?'))) die('cancelled; nothing was changed.');

step(3, 'Local config');
if (DRY) {
  dry('update wrangler.jsonc (hostname, origin, sender, account) and dashboard.config.ts (time zone, widgets)');
} else {
  writeFileSync(WRANGLER, applyWranglerValues(readFileSync(WRANGLER, 'utf8'), { hostname, mailFrom, accountId: account.id }));
  writeFileSync(DASHBOARD, applyDashboardValues(readFileSync(DASHBOARD, 'utf8'), { timeZone, useCalendar, useMealq, mealqHost }));
  console.log('  wrangler.jsonc and dashboard.config.ts updated (both are untracked).');
}

step(4, 'Database');
let databaseId = current.databaseId && !isPlaceholder(current.databaseId) ? current.databaseId : undefined;
if (databaseId) {
  console.log(`  Already configured (${databaseId}).`);
} else {
  const list = wrangler(['d1', 'list', '--json'], { account, capture: true });
  let existing;
  try { existing = JSON.parse(list.stdout).find((d) => d.name === DB_NAME); } catch { die('could not list D1 databases.'); }
  if (existing) {
    if (!(await yesNo(`  A D1 database named "${DB_NAME}" already exists in this account. Use it?`, false))) {
      die(`rename or delete that database, or change the name in wrangler.jsonc, then re-run.`);
    }
    databaseId = existing.uuid;
  } else if (DRY) {
    dry(`create D1 database "${DB_NAME}"`);
    databaseId = '00000000-0000-0000-0000-000000000000';
  } else {
    const created = wrangler(['d1', 'create', DB_NAME], { account, capture: true });
    databaseId = parseDatabaseId(`${created.stdout}\n${created.stderr}`);
    if (!databaseId) die(`could not create the database:\n${created.stderr || created.stdout}`);
    console.log(`  Created ${DB_NAME}.`);
  }
}
if (!DRY) writeFileSync(WRANGLER, applyWranglerValues(readFileSync(WRANGLER, 'utf8'), { hostname, mailFrom, databaseId, accountId: account.id }));

step(5, 'Database tables');
if (DRY) dry('apply migrations to the remote database');
else if (!npm('db:migrate:remote')) die('migrations failed.');

step(6, 'Checks');
if (DRY) dry('run `npm run verify` (tests, types, build, client-bundle secret scan, dependency audit)');
else if (!npm('verify')) die('verify failed; nothing has been deployed. Fix the failure and re-run.');

step(7, 'Deploy');
if (!(await yesNo(`Deploy to https://${hostname} now?`))) die('stopped before deploying. Re-run when ready.');
if (DRY) {
  dry('wrangler deploy');
} else {
  const env = { ...process.env, ...PRIVACY_ENV, CLOUDFLARE_ACCOUNT_ID: account.id };
  if (spawnSync('npx', ['wrangler', 'deploy'], { cwd: ROOT, env, stdio: 'inherit' }).status !== 0) die('deploy failed.');
}

step(8, 'Secrets');
const secrets = { RESEND_API_KEY: resendKey, BOOTSTRAP_MANAGER_EMAIL: bootstrap };
if (useCalendar) Object.assign(secrets, { GOOGLE_SERVICE_ACCOUNT_JSON: calendarJson, GOOGLE_CALENDAR_ID: calendarId });
if (useMealq) secrets.MEALQ_API_TOKEN = mealqToken;
if (DRY) {
  dry(`send ${Object.keys(secrets).join(', ')} to wrangler over stdin`);
} else {
  const r = wrangler(['secret', 'bulk'], { account, input: JSON.stringify(secrets) });
  if (r.status !== 0) die('could not set secrets. Set them with `npx wrangler secret put NAME`; the site is deployed but cannot send sign-in links until RESEND_API_KEY is set.');
}

step(9, 'First sign-in');
console.log(`  Open https://${hostname}, enter ${bootstrap}, and click the emailed link in the same browser.`);
console.log('  (DNS and the custom domain can take a few minutes to start working.)');
if (!DRY && (await yesNo('Signed in successfully?', false))) {
  console.log('  Removing the bootstrap secret (it has no further use):');
  wrangler(['secret', 'delete', 'BOOTSTRAP_MANAGER_EMAIL'], { account });
} else {
  console.log('  When you are signed in, run: npx wrangler secret delete BOOTSTRAP_MANAGER_EMAIL');
}
console.log('\nNext: invite the household from Admin, then go through docs/pwa-manual-check.md on a phone.');
finish();

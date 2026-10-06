// Pure helpers for scripts/setup.mjs: input validation and edits to the two local config files.
// No I/O here so it can be unit-tested (test/setup-config.test.ts).

const HOST = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;

export const normalizeHostname = (raw) => String(raw).trim().toLowerCase();

/** A bare hostname (no scheme, port or path), not an IP literal, and not the placeholder. */
export function checkHostname(raw) {
  const h = normalizeHostname(raw);
  if (!HOST.test(h)) return 'must be a bare hostname such as dashboard.example.com (no https://, port or path)';
  if (/^[0-9.]+$/.test(h)) return 'IP addresses are not allowed';
  if (h === 'example.com' || h.endsWith('.example.com') || h.endsWith('.example')) return 'that is a placeholder, use your real domain';
  if (h.endsWith('.workers.dev')) return 'workers.dev is switched off on purpose; use your own domain';
  return null;
}

/**
 * Suggested "from" address. On a re-run, the sender already in wrangler.jsonc wins. Otherwise login@<hostname>:
 * guessing a parent domain needs the public-suffix list (example.co.uk would come out as co.uk), so we do not guess.
 */
export function defaultSender(hostname, currentMailFrom) {
  const current = String(currentMailFrom ?? '').match(/<([^>]+)>/)?.[1] ?? String(currentMailFrom ?? '');
  if (current && !checkEmail(current) && !/@example\./i.test(current)) return current;
  return `login@${hostname}`;
}

export function checkEmail(raw) {
  const e = String(raw).trim();
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(e) && e.length <= 254 ? null : 'not a valid email address';
}

export function checkTimeZone(raw) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: String(raw).trim() });
    return null;
  } catch {
    return 'not an IANA time zone, e.g. America/Chicago';
  }
}

/** Astro 7 needs Node >= 22.12 (package.json "engines" says the same). */
export const MIN_NODE = '22.12.0';
export function nodeVersionOk(version, min = MIN_NODE) {
  const [a, b = 0, c = 0] = String(version).replace(/^v/, '').split('.').map(Number);
  const [x, y, z] = min.split('.').map(Number);
  if ([a, b, c].some(Number.isNaN)) return false;
  return a !== x ? a > x : b !== y ? b > y : c >= z;
}

export const FALLBACK_TIME_ZONE = 'America/New_York';

/**
 * Time zone to suggest: the one this computer is set to, which is usually the household's. UTC (servers, containers,
 * misconfigured machines) says nothing about where the family lives, so it falls back to a fixed default instead.
 */
export function defaultTimeZone(detected) {
  const tz = String(detected ?? '').trim();
  if (!tz || checkTimeZone(tz) || /^(UTC|GMT|Etc\/.*|Z)$/i.test(tz)) return FALLBACK_TIME_ZONE;
  return tz;
}

export const checkAccountId = (raw) => (/^[0-9a-f]{32}$/.test(String(raw)) ? null : 'not a Cloudflare account id');
export const checkDatabaseId = (raw) => (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(String(raw)) ? null : 'not a D1 database id');

/** Pull a D1 database id out of `wrangler d1 create` output. */
export const parseDatabaseId = (output) =>
  String(output).match(/"database_id"\s*:\s*"([0-9a-f-]{36})"/)?.[1] ?? null;

const mustReplace = (text, re, to, what) => {
  if (!re.test(text)) throw new Error(`could not find ${what} in wrangler.jsonc; edit it by hand or restore it from wrangler.template.jsonc`);
  return text.replace(re, () => to);
};

/**
 * Edits wrangler.jsonc in place (comments and layout survive). Values must already be validated;
 * they are JSON-escaped here as a second line of defence against breaking the file.
 */
export function applyWranglerValues(text, v) {
  const q = (s) => JSON.stringify(s).slice(1, -1);
  let out = text;
  out = mustReplace(out, /"pattern"\s*:\s*"[^"]*"/, `"pattern": "${q(v.hostname)}"`, 'routes[0].pattern');
  out = mustReplace(out, /"APP_ORIGIN"\s*:\s*"[^"]*"/, `"APP_ORIGIN": "https://${q(v.hostname)}"`, 'vars.APP_ORIGIN');
  out = mustReplace(out, /"MAIL_FROM"\s*:\s*"[^"]*"/, `"MAIL_FROM": "${q(v.mailFrom)}"`, 'vars.MAIL_FROM');
  if (v.databaseId) out = mustReplace(out, /"database_id"\s*:\s*"[^"]*"/, `"database_id": "${q(v.databaseId)}"`, 'd1 database_id');
  if (v.accountId) {
    if (/"account_id"\s*:/.test(out)) out = mustReplace(out, /"account_id"\s*:\s*"[^"]*"/, `"account_id": "${q(v.accountId)}"`, 'account_id');
    else {
      const name = /("name"\s*:\s*"[^"]*",)/;
      if (!name.test(out)) throw new Error('could not find "name" in wrangler.jsonc to place account_id after');
      out = out.replace(name, (m) => `${m}\n  "account_id": "${q(v.accountId)}",`);
    }
  }
  return out;
}

/** Reads back the values setup cares about, for re-runs. Returns undefined for anything missing. */
export function readWranglerValues(text) {
  const get = (re) => text.match(re)?.[1];
  return {
    hostname: get(/"pattern"\s*:\s*"([^"]*)"/),
    mailFrom: get(/"MAIL_FROM"\s*:\s*"([^"]*)"/),
    databaseId: get(/"database_id"\s*:\s*"([^"]*)"/),
    databaseName: get(/"database_name"\s*:\s*"([^"]*)"/),
    accountId: get(/"account_id"\s*:\s*"([^"]*)"/),
  };
}

/** Edits dashboard.config.ts: time zone everywhere, MealQ host, and drops widgets the household does not use. */
export function applyDashboardValues(text, v) {
  let out = text.replace(/timeZone:\s*'[^']*'/g, () => `timeZone: '${v.timeZone}'`);
  const dropLine = (id) => {
    out = out.split('\n').filter((l) => !new RegExp(`\\bid:\\s*'${id}'`).test(l)).join('\n');
  };
  if (!v.useCalendar) dropLine('calendar');
  if (!v.useMealq) dropLine('mealq');
  else if (v.mealqHost) {
    if (!/apiHost:\s*'[^']*'/.test(out)) throw new Error('could not find apiHost in dashboard.config.ts');
    out = out.replace(/apiHost:\s*'[^']*'/, () => `apiHost: '${v.mealqHost}'`);
  }
  return out;
}

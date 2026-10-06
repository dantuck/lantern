import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * "Nothing reaches the author." These tests pin down every place this project can talk to the network, so a new
 * outbound destination, a telemetry dependency or a tracking call cannot slip in unnoticed. To add a destination
 * on purpose: add it below AND describe it in SECURITY.md (a test checks that), and list it in the CHANGELOG.
 */

/** Hosts the deployed Worker may contact. MealQ's host is configured by the household and is checked by fetchPolicy. */
const RUNTIME_HOSTS = ['api.resend.com', 'oauth2.googleapis.com', 'www.googleapis.com'];
/** Appear in files but are never contacted: XML namespaces and documentation placeholders. */
const NOT_CONTACTED = (h: string) => h === 'www.w3.org' || h === 'localhost' || h === 'example.com' || h.endsWith('.example.com') || h.endsWith('.example');

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}
const read = (p: string) => readFileSync(p, 'utf8');

const shipped = [
  ...walk('src', ['.ts', '.astro', '.svelte', '.js', '.mjs']),
  ...walk('public', ['.js', '.html', '.css', '.webmanifest', '.svg', '.txt']),
  'astro.config.mjs', 'dashboard.config.example.ts', 'wrangler.template.jsonc',
];

describe('network destinations in shipped code', () => {
  it('only references the documented hosts', () => {
    const found = new Map<string, string[]>();
    for (const f of shipped) {
      for (const m of read(f).matchAll(/https?:\/\/([a-z0-9][a-z0-9.-]*)/gi)) {
        const host = m[1]!.toLowerCase().replace(/\.$/, '');
        if (NOT_CONTACTED(host)) continue;
        found.set(host, [...(found.get(host) ?? []), f]);
      }
    }
    const unexpected = [...found].filter(([h]) => !RUNTIME_HOSTS.includes(h)).map(([h, files]) => `${h} in ${[...new Set(files)].join(', ')}`);
    expect(unexpected, 'new network destination: allow it here and document it in SECURITY.md').toEqual([]);
  });

  it('documents every allowed host in SECURITY.md', () => {
    const doc = read('SECURITY.md');
    for (const h of RUNTIME_HOSTS) expect(doc, `${h} missing from SECURITY.md`).toContain(h);
  });

  it('keeps the browser locked to its own origin', () => {
    expect(read('astro.config.mjs')).toContain(`"connect-src 'self'"`);
    expect(read('astro.config.mjs')).toContain(`"default-src 'none'"`);
  });

  it('has no beacon, socket or tracking APIs, and only same-origin fetches in client code', () => {
    const client = [...walk('public', ['.js', '.html']), ...walk('src/scripts', ['.ts']), ...walk('src/pages', ['.astro']), ...walk('src/components', ['.astro']),
      ...walk('src/layouts', ['.astro']), ...walk('src/plugins', ['.svelte', '.astro'])];
    for (const f of client) {
      expect(read(f), f).not.toMatch(/\b(sendBeacon|WebSocket|EventSource|XMLHttpRequest|importScripts)\b/);
      expect(read(f), f).not.toMatch(/\b(gtag|ga\(|dataLayer|analytics|sentry|datadog|posthog|mixpanel|segment)\b/i);
    }
    // The only client-side fetch() calls: the sign-in confirmation (same-origin path) and the service worker's own requests.
    const fetches = client.flatMap((f) => [...read(f).matchAll(/\bfetch\(\s*([^,)]*)/g)].map((m) => `${f}: ${m[1]!.trim()}`));
    expect(fetches).toEqual([
      "public/sw.js: req",
      "public/sw.js: req",
      "public/sw.js: abs",
      "src/pages/auth/verify.astro: '/auth/confirm'",
    ]);
  });
});

describe('dependencies and tooling', () => {
  it('ships no analytics, error-reporting or telemetry packages', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    const bad = names.filter((n) => /sentry|datadog|posthog|mixpanel|segment|amplitude|bugsnag|rollbar|logrocket|newrelic|opentelemetry|analytics|telemetry/i.test(n));
    // @astrojs/telemetry is Astro's own CLI telemetry, switched off by scripts/run.mjs; it never runs in the Worker.
    expect(bad.filter((n) => n !== '@astrojs/telemetry')).toEqual([]);
  });

  it('keeps the runtime dependency list small and known', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['@astrojs/cloudflare', '@astrojs/svelte', 'astro', 'svelte', 'zod']);
  });

  it('makes no network requests from the setup, update and release scripts themselves', () => {
    for (const f of walk('scripts', ['.mjs'])) {
      if (f.endsWith('audit.mjs')) continue; // runs `npm audit`, which asks the npm registry about your dependency list
      expect(read(f), f).not.toMatch(/\bfetch\(|node:https?|node:net|node:dgram|XMLHttpRequest|WebSocket/);
    }
  });

  it('switches tool telemetry off in the npm scripts, setup and update', () => {
    const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };
    for (const s of ['dev', 'build', 'check', 'preview', 'db:migrate:local', 'db:migrate:remote']) {
      expect(pkg.scripts[s], s).toMatch(/^node scripts\/run\.mjs /);
    }
    for (const f of ['scripts/setup.mjs', 'scripts/update.mjs']) expect(read(f), f).toContain('PRIVACY_ENV');
    for (const f of ['scripts/lib.sh', 'scripts/check-csp.sh']) expect(read(f), f).toContain('ASTRO_TELEMETRY_DISABLED=1');
  });
});

describe('wrangler defaults', () => {
  const tpl = read('wrangler.template.jsonc').replace(/\/\/.*$/gm, '');
  it('turns logs, usage metrics and dependency reporting off', () => {
    expect(tpl).toMatch(/"observability"\s*:\s*\{\s*"enabled"\s*:\s*false/);
    expect(tpl).toMatch(/"send_metrics"\s*:\s*false/);
    expect(tpl).toMatch(/"dependencies_instrumentation"\s*:\s*\{\s*"enabled"\s*:\s*false/);
  });
  it('keeps the app reachable only on the household domain', () => {
    expect(tpl).toMatch(/"workers_dev"\s*:\s*false/);
    expect(tpl).toMatch(/"preview_urls"\s*:\s*false/);
  });
});

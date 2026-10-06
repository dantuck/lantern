import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DOCS = ['README.md', 'SECURITY.md', 'CHANGELOG.md', 'docs/setup-guide.md', 'docs/you-are-the-host.md', 'docs/threat-model.md',
  'docs/releasing.md', 'docs/pwa-manual-check.md', 'docs/mealq-api-contract.md', 'src/plugins/README.md'];
const read = (p: string) => readFileSync(p, 'utf8');
const scripts = Object.keys(JSON.parse(read('package.json')).scripts as Record<string, string>);

describe('documentation stays true to the repository', () => {
  it('every relative link points at a file that exists', () => {
    const broken: string[] = [];
    for (const doc of DOCS) {
      for (const m of read(doc).matchAll(/\]\((?!https?:|mailto:|#)([^)\s]+)\)/g)) {
        const target = m[1]!.split('#')[0]!;
        if (target && !existsSync(join(dirname(doc), target))) broken.push(`${doc} -> ${m[1]}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('every `npm run <script>` it tells people to run exists', () => {
    const missing: string[] = [];
    for (const doc of DOCS) {
      for (const m of read(doc).matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) {
        if (!scripts.includes(m[1]!)) missing.push(`${doc}: npm run ${m[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('names the same Node requirement everywhere', () => {
    expect(read('docs/setup-guide.md')).toContain('Node 22.12');
    expect(JSON.parse(read('package.json')).engines.node).toBe('>=22.12.0');
  });

  it('every wrangler command the guides give is a real subcommand', () => {
    const known = ['login', 'delete', 'rollback', 'secret put', 'secret delete', 'secret bulk', 'd1 export', 'd1 delete', 'd1 create', 'd1 list',
      'd1 execute', 'kv namespace list', 'kv namespace delete', 'kv namespace create', 'deploy', 'whoami'];
    const bad: string[] = [];
    for (const doc of DOCS) {
      for (const m of read(doc).matchAll(/npx wrangler ((?:[a-z0-9]+ ?){1,3})/g)) {
        const cmd = m[1]!.trim();
        if (!known.some((k) => cmd === k || cmd.startsWith(`${k} `))) bad.push(`${doc}: ${cmd}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

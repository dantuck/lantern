// Adds any new migration to scripts/migrations.manifest.json (name -> SHA-256). Existing entries are never
// rewritten: a migration that has shipped is immutable, and test/migrations.test.ts fails if one changes.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from './lib/update-helpers.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'migrations');
const manifestPath = join(here, 'migrations.manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
let added = 0;
for (const f of readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()) {
  if (f in manifest) continue;
  manifest[f] = sha256(readFileSync(join(dir, f), 'utf8'));
  console.log(`sealed ${f}`);
  added++;
}
if (added) writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
else console.log('nothing new to seal');

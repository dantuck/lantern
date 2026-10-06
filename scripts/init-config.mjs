// Creates the local, untracked config files from the tracked templates if they are missing.
// Never overwrites: your own wrangler.jsonc and dashboard.config.ts are yours and stay out of git,
// so pulling updates cannot conflict with your domain, database id or widget settings.
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = [
  ['wrangler.template.jsonc', 'wrangler.jsonc'],
  ['dashboard.config.example.ts', 'dashboard.config.ts'],
];

for (const [from, to] of FILES) {
  if (existsSync(join(root, to))) continue;
  copyFileSync(join(root, from), join(root, to));
  console.log(`created ${to} from ${from}; edit it for your household (see README)`);
}

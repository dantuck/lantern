#!/usr/bin/env node
// Runs a command with telemetry switched off: `node scripts/run.mjs astro build`.
// Used by the npm scripts so `npm run dev|build|check|preview|db:*` never send tool telemetry.
import { spawnSync } from 'node:child_process';
import { PRIVACY_ENV } from './lib/privacy-env.mjs';

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) { console.error('usage: node scripts/run.mjs <command> [args...]'); process.exit(2); }
const r = spawnSync(cmd, args, { stdio: 'inherit', env: { ...process.env, ...PRIVACY_ENV }, shell: process.platform === 'win32' });
if (r.error) { console.error(`could not run ${cmd}: ${r.error.message}`); process.exit(127); }
process.exit(r.status ?? 1);

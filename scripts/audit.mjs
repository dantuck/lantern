#!/usr/bin/env node
// `npm audit` for production dependencies, failing on anything not explicitly accepted below.
// Add an entry only with a reason that says why it cannot affect this deployment.
import { spawnSync } from 'node:child_process';

const ACCEPTED = {
  'GHSA-ch52-4w7c-c8xp': {
    pkg: 'http-cache-semantics',
    reason: 'Dependency of astro itself (build-time remote-asset caching). Not present in dist/ (checked by scripts/check-bundle.sh '
      + 'and a grep of the Worker bundle), and the app fetches no remote images. A client-side HTTP cache library cannot run in the Worker.',
    reviewed: '2026-10-03',
  },
};

const out = spawnSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8' });
let report;
try { report = JSON.parse(out.stdout); } catch { console.error('could not parse npm audit output'); process.exit(2); }

const findings = new Map();
for (const v of Object.values(report.vulnerabilities ?? {})) {
  for (const via of v.via) {
    if (typeof via !== 'object') continue; // transitive pointer to another package
    const id = via.url?.split('/').pop() ?? via.title;
    findings.set(id, { id, pkg: via.name, severity: via.severity, title: via.title });
  }
}

let failed = false;
for (const f of findings.values()) {
  const accepted = ACCEPTED[f.id];
  if (accepted) { console.log(`accepted  ${f.severity.padEnd(8)} ${f.pkg}  ${f.id}  (reviewed ${accepted.reviewed})`); continue; }
  const blocking = f.severity === 'high' || f.severity === 'critical';
  console.log(`${blocking ? 'FAIL' : 'warn'}      ${f.severity.padEnd(8)} ${f.pkg}  ${f.id}  ${f.title}`);
  if (blocking) failed = true;
}
if (findings.size === 0) console.log('no known vulnerabilities in production dependencies');
process.exit(failed ? 1 : 0);

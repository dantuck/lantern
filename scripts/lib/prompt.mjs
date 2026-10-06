// Shared prompts for setup.mjs and update.mjs. Lines are queued as they arrive, so piped or pasted
// input is never dropped between prompts, and hidden input (secrets) is not echoed.
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';

export function createPrompter() {
  let muted = false;
  let finished = false;
  const queue = [];
  let waiter = null;
  let closed = false;
  const out = new Writable({ write(chunk, _enc, cb) { if (!muted) process.stdout.write(chunk); cb(); } });
  const rl = createInterface({ input: process.stdin, output: out, terminal: process.stdin.isTTY ?? false });

  const endOfInput = () => {
    console.error('\nInput ended before the script finished. Nothing further was changed; re-run to continue.');
    process.exit(1);
  };
  rl.on('line', (l) => { if (waiter) { const w = waiter; waiter = null; w(l); } else queue.push(l); });
  rl.on('close', () => { closed = true; if (waiter && !finished) endOfInput(); });
  const nextLine = () => {
    if (queue.length) return Promise.resolve(queue.shift());
    if (closed) endOfInput();
    return new Promise((resolve) => { waiter = resolve; });
  };

  async function ask(question, { def, check, hidden = false } = {}) {
    for (;;) {
      process.stdout.write(`${question}${def ? ` [${def}]` : ''}: `);
      muted = hidden;
      const raw = await nextLine();
      muted = false;
      if (hidden) process.stdout.write('\n');
      const value = raw.trim() || def || '';
      const problem = check ? check(value) : null;
      if (!problem) return value;
      console.log(`  ✗ ${problem}`);
    }
  }
  async function yesNo(question, def = true) {
    const a = (await ask(`${question} (${def ? 'Y/n' : 'y/N'})`)).toLowerCase();
    return a === '' ? def : a.startsWith('y');
  }
  /** Call before exiting normally or deliberately, so closing stdin is not reported as an error. */
  const finish = () => { finished = true; rl.close(); };
  return { ask, yesNo, finish };
}

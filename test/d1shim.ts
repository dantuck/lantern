import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';

/** Minimal D1-compatible wrapper over node:sqlite so the real SQL (incl. RETURNING) runs in unit tests. */
export function createTestDb(): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const f of readdirSync('migrations').sort()) sqlite.exec(readFileSync(`migrations/${f}`, 'utf8'));

  const stmt = (sql: string, params: unknown[] = []) => ({
    bind: (...p: unknown[]) => stmt(sql, p),
    first: async () => (sqlite.prepare(sql).get(...(params as never[])) as never) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...(params as never[])) as never[], success: true }),
    run: async () => {
      const r = sqlite.prepare(sql).run(...(params as never[]));
      return { success: true, meta: { changes: Number(r.changes) } };
    },
  });
  return { prepare: (sql: string) => stmt(sql) } as unknown as D1Database;
}

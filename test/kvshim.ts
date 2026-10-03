import { vi } from 'vitest';

/** In-memory KV namespace (JSON get/put) for plugin-host tests. `m` exposes the raw store. */
export function fakeKv() {
  const m = new Map<string, string>();
  return {
    m,
    get: vi.fn(async (k: string) => (m.has(k) ? JSON.parse(m.get(k)!) : null)),
    put: vi.fn(async (k: string, v: string) => { m.set(k, v); }),
  } as unknown as KVNamespace & { m: Map<string, string> };
}

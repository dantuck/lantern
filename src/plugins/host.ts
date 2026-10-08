import { sha256Hex } from '../lib/auth/crypto';
import { guardedFetch } from './fetchPolicy';
import type { EnabledPlugin } from './registry';
import type { PluginResult } from './types';

const LOADER_TIMEOUT_MS = 8_000;
/** Floor for forced refreshes so a reload loop can't hammer an upstream. */
const MIN_REFETCH_MS = 5_000;
/** How long a stale copy is kept so the dashboard still shows something when an upstream is down. */
const STALE_KEEP_SECONDS = 24 * 60 * 60;

interface Cached { data: unknown; fetchedAt: number }

export interface HostDeps {
  /** Worker env; the host hands plugins only the secrets they declared. */
  env: Record<string, unknown>;
  kv: KVNamespace;
  now?: number;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Skip a cached copy unless it is under MIN_REFETCH_MS old, e.g. when the viewer force-refreshes the page. */
  forceRefresh?: boolean;
}

export async function loadPluginData(plugin: EnabledPlugin, deps: HostDeps): Promise<PluginResult> {
  const { def, config } = plugin;
  const now = deps.now ?? Date.now();

  const secrets: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of def.secrets) {
    const v = deps.env[name];
    if (typeof v === 'string' && v !== '') secrets[name] = v;
    else missing.push(name);
  }
  for (const name of def.optionalSecrets ?? []) {
    const v = deps.env[name];
    if (typeof v === 'string' && v !== '') secrets[name] = v;
  }
  if (missing.length) {
    console.error(`plugin ${def.id}: missing secrets: ${missing.join(', ')}`);
    return { status: 'unconfigured', missing };
  }

  // Config is part of the key so changing settings never serves another config's data.
  const key = `plugin:${def.id}:${(await sha256Hex(JSON.stringify(config))).slice(0, 16)}`;
  const cached = await deps.kv.get<Cached>(key, 'json').catch(() => null);
  const maxAgeMs = deps.forceRefresh ? MIN_REFETCH_MS : def.cacheTtlSeconds * 1000;
  if (cached && now - cached.fetchedAt < maxAgeMs) {
    return { status: 'ok', data: cached.data, fetchedAt: cached.fetchedAt };
  }

  const controller = new AbortController();
  const timeoutMs = deps.timeoutMs ?? LOADER_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const data = await Promise.race([
      def.loader({
        config, secrets, now, signal: controller.signal,
        fetch: guardedFetch(plugin.fetchPolicy, controller.signal, deps.fetchImpl),
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error('loader timed out')); }, timeoutMs);
      }),
    ]);
    await deps.kv
      .put(key, JSON.stringify({ data, fetchedAt: now } satisfies Cached), { expirationTtl: STALE_KEEP_SECONDS })
      .catch((e) => console.error(`plugin ${def.id}: cache write failed`, String(e)));
    return { status: 'ok', data, fetchedAt: now };
  } catch (e) {
    // Log server-side only; error text may mention upstream details and never goes to the browser.
    console.error(`plugin ${def.id}: loader failed:`, e instanceof Error ? e.message : 'unknown');
    return cached ? { status: 'stale', data: cached.data, fetchedAt: cached.fetchedAt } : { status: 'error' };
  } finally {
    clearTimeout(timer);
  }
}

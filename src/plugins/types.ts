import type { z } from 'zod';

/** Outbound network rules for a plugin. Anything not listed is refused by the host. */
export interface FetchPolicy {
  /** Exact hostnames the plugin may contact (https only). */
  hosts: readonly string[];
  /** Defaults to GET only. Widen deliberately, e.g. POST for an OAuth token exchange. */
  methods?: readonly ('GET' | 'POST')[];
}

export interface PluginContext<C> {
  /** Validated, non-secret settings from dashboard.config.ts. */
  config: C;
  /** Only the secrets the plugin declared; nothing else from the environment. */
  secrets: Readonly<Record<string, string>>;
  /** Policy-enforcing fetch (host allowlist, https, method allowlist, timeout signal). */
  fetch: typeof fetch;
  now: number;
  signal: AbortSignal;
}

export interface PluginDefinition<C = unknown, D = unknown> {
  /** Lowercase slug; must equal the plugin's folder name. */
  id: string;
  name: string;
  /** A single emoji shown in the card header. */
  icon: string;
  configSchema: z.ZodType<C>;
  /** Names of Worker secrets this plugin needs. All are required for the plugin to run. */
  secrets: readonly string[];
  /** Static, or derived from the plugin's validated config (e.g. a configurable API host). Validated at startup either way. */
  fetchPolicy: FetchPolicy | ((config: C) => FetchPolicy);
  /** How long loader output is served from cache before refetching. */
  cacheTtlSeconds: number;
  /** Server-only, read-only. Returns JSON-serialisable data for the widget. */
  loader(ctx: PluginContext<C>): Promise<D>;
}

export const resolveFetchPolicy = <C>(def: Pick<PluginDefinition<C, unknown>, 'fetchPolicy'>, config: C): FetchPolicy =>
  typeof def.fetchPolicy === 'function' ? def.fetchPolicy(config) : def.fetchPolicy;

export const definePlugin = <C, D>(p: PluginDefinition<C, D>): PluginDefinition<C, D> => p;

export interface DashboardConfig {
  title: string;
  /** Order here is display order. `config` is validated against the plugin's configSchema. */
  plugins: { id: string; config?: unknown; span?: 1 | 2 }[];
}

export type PluginResult<D = unknown> =
  | { status: 'ok'; data: D; fetchedAt: number }
  | { status: 'stale'; data: D; fetchedAt: number }
  | { status: 'unconfigured'; missing: string[] }
  | { status: 'error' };

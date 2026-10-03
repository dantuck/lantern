import { resolveFetchPolicy, type DashboardConfig, type FetchPolicy, type PluginDefinition } from './types';
import dashboardConfig from '../../dashboard.config';

export interface EnabledPlugin {
  def: PluginDefinition<any, any>;
  config: unknown;
  /** Resolved from the plugin's definition and validated once, at startup. */
  fetchPolicy: FetchPolicy;
  span: 1 | 2;
}

/** Worker bindings and platform secrets that no plugin may ask for. */
const RESERVED_SECRETS = new Set([
  'DB', 'CACHE', 'ASSETS', 'SESSION', 'IMAGES', 'APP_ORIGIN', 'MAIL_FROM', 'RESEND_API_KEY', 'BOOTSTRAP_MANAGER_EMAIL',
]);
const ID = /^[a-z][a-z0-9-]{0,31}$/;
function validateFetchPolicy(id: string, policy: FetchPolicy) {
  if (policy.hosts.some((h) => !/^[a-z0-9.-]+$/i.test(h) || h.includes('*'))) {
    throw new Error(`plugin "${id}": fetchPolicy.hosts must be exact hostnames`);
  }
}

const SECRET_NAME = /^[A-Z][A-Z0-9_]{1,63}$/;

/** Pure and throws loudly on any misconfiguration, so mistakes surface at startup and in tests. */
export function buildRegistry(
  modules: Record<string, PluginDefinition<any, any>>,
  config: DashboardConfig,
): { all: Map<string, PluginDefinition<any, any>>; enabled: EnabledPlugin[] } {
  const all = new Map<string, PluginDefinition<any, any>>();
  for (const [path, def] of Object.entries(modules)) {
    const dir = path.match(/^\.\/([^/]+)\/plugin\.ts$/)?.[1];
    if (!ID.test(def.id)) throw new Error(`plugin id "${def.id}" is invalid`);
    if (dir !== def.id) throw new Error(`plugin "${def.id}" must live in folder "${def.id}" (found "${dir}")`);
    if (all.has(def.id)) throw new Error(`duplicate plugin id "${def.id}"`);
    for (const s of def.secrets) {
      if (!SECRET_NAME.test(s)) throw new Error(`plugin "${def.id}": bad secret name "${s}"`);
      if (RESERVED_SECRETS.has(s)) throw new Error(`plugin "${def.id}" may not request reserved binding "${s}"`);
    }
    if (typeof def.fetchPolicy !== 'function') validateFetchPolicy(def.id, def.fetchPolicy);
    if (!(def.cacheTtlSeconds > 0)) throw new Error(`plugin "${def.id}": cacheTtlSeconds must be positive`);
    all.set(def.id, def);
  }

  const seen = new Set<string>();
  const enabled = config.plugins.map((entry) => {
    const def = all.get(entry.id);
    if (!def) throw new Error(`dashboard.config enables unknown plugin "${entry.id}"`);
    if (seen.has(entry.id)) throw new Error(`dashboard.config enables "${entry.id}" twice`);
    seen.add(entry.id);
    const parsed = def.configSchema.safeParse(entry.config ?? {});
    if (!parsed.success) {
      throw new Error(`invalid config for plugin "${entry.id}": ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    }
    const fetchPolicy = resolveFetchPolicy(def, parsed.data);
    if (typeof def.fetchPolicy === 'function') validateFetchPolicy(entry.id, fetchPolicy); // static ones were checked above
    return { def, config: parsed.data, fetchPolicy, span: entry.span ?? 1 } satisfies EnabledPlugin;
  });
  return { all, enabled };
}

const modules = import.meta.glob<PluginDefinition<any, any>>('./*/plugin.ts', { eager: true, import: 'default' });

export const registry = buildRegistry(modules, dashboardConfig);
export const getEnabledPlugin = (id: string) => registry.enabled.find((p) => p.def.id === id);

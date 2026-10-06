import { audit, type User } from './auth/users';

/** Built-in features a manager can switch off (plugins are listed from the registry). */
export const BUILT_IN_FEATURES = [
  { id: 'chores', name: 'Chores' },
  { id: 'lists', name: 'Lists' },
] as const;

/** Ids a manager may switch: every plugin the dashboard.config.ts offers, plus the built-ins. */
export const switchableIds = (pluginIds: readonly string[]): Set<string> => new Set([...pluginIds, ...BUILT_IN_FEATURES.map((f) => f.id)]);

/**
 * The ids switched off. Fails open: if the table cannot be read (for example the migration has not run yet), nothing
 * is treated as off, so an upgrade never hides the dashboard.
 */
export async function disabledFeatures(db: D1Database): Promise<Set<string>> {
  try {
    const { results } = await db.prepare('SELECT id FROM feature_flags WHERE enabled = 0').all<{ id: string }>();
    return new Set(results.map((r) => r.id));
  } catch (e) {
    console.error('features: could not read feature_flags:', e instanceof Error ? e.message : 'unknown');
    return new Set();
  }
}

export const isOn = (disabled: ReadonlySet<string> | undefined, id: string): boolean => !disabled?.has(id);

/** Switches a feature on or off. `allowed` is the set of ids that exist; anything else is refused. */
export async function setFeature(
  db: D1Database, manager: User, allowed: ReadonlySet<string>, id: string, enabled: boolean, now = Date.now(),
): Promise<boolean> {
  if (!allowed.has(id)) return false;
  await db
    .prepare('INSERT INTO feature_flags (id, enabled, changed_at) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET enabled = excluded.enabled, changed_at = excluded.changed_at')
    .bind(id, enabled ? 1 : 0, now)
    .run();
  await audit(db, manager.id, enabled ? 'feature.enabled' : 'feature.disabled', { id }, now);
  return true;
}

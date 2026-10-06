import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getEnabledPlugin } from '../../../../plugins/registry';
import { loadPluginData } from '../../../../plugins/host';
import { json } from '../../../../lib/http';
import { isOn } from '../../../../lib/features';

/** Read-only: GET only (see ALL below). Auth is enforced by middleware. */
export const GET: APIRoute = async ({ params, locals }) => {
  const plugin = getEnabledPlugin(params.id ?? '');
  if (!plugin || !isOn(locals.disabled, plugin.def.id)) return json({ error: 'not_found' }, 404);
  const result = await loadPluginData(plugin, { env: env as unknown as Record<string, unknown>, kv: env.CACHE });
  // Secret names are never sent to the browser.
  if (result.status === 'unconfigured') return json({ status: 'unconfigured' });
  return json(result);
};

/** Anything but GET is refused explicitly (Astro would otherwise answer 404). */
export const ALL: APIRoute = () => new Response(null, { status: 405, headers: { Allow: 'GET' } });

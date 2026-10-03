import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getEnabledPlugin } from '../../../../plugins/registry';
import { loadPluginData } from '../../../../plugins/host';
import { json } from '../../../../lib/http';

/** Read-only: GET only (see ALL below). Auth is enforced by middleware. */
export const GET: APIRoute = async ({ params }) => {
  const plugin = getEnabledPlugin(params.id ?? '');
  if (!plugin) return json({ error: 'not_found' }, 404);
  const result = await loadPluginData(plugin, { env: env as unknown as Record<string, unknown>, kv: env.CACHE });
  // Secret names are never sent to the browser.
  if (result.status === 'unconfigured') return json({ status: 'unconfigured' });
  return json(result);
};

/** Anything but GET is refused explicitly (Astro would otherwise answer 404). */
export const ALL: APIRoute = () => new Response(null, { status: 405, headers: { Allow: 'GET' } });

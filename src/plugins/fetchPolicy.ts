import type { FetchPolicy } from './types';

const MAX_REDIRECTS = 3;

/**
 * Wraps fetch so a plugin can only talk to the hosts and methods it declared. Redirects are
 * followed manually so a redirect cannot leave the allowlist. This is a guard against mistakes
 * and surprises in reviewed first-party plugin code; it is not a sandbox against malicious code.
 */
export function guardedFetch(
  policy: FetchPolicy,
  signal: AbortSignal,
  base: typeof fetch = (...a) => fetch(...a),
): typeof fetch {
  const hosts = new Set(policy.hosts.map((h) => h.toLowerCase()));
  const methods = new Set(policy.methods ?? ['GET']);

  const check = (url: URL, method: string) => {
    if (url.protocol !== 'https:') throw new Error(`plugin fetch blocked: non-https (${url.host})`);
    if (url.username || url.password) throw new Error('plugin fetch blocked: credentials in URL');
    if (!hosts.has(url.hostname.toLowerCase())) throw new Error(`plugin fetch blocked: host ${url.hostname} not allowed`);
    if (!methods.has(method as 'GET' | 'POST')) throw new Error(`plugin fetch blocked: method ${method} not allowed`);
  };

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    let url = new URL(req.url);
    const method = req.method.toUpperCase();
    check(url, method);

    for (let hop = 0; ; hop++) {
      const res = await base(url.toString(), { method, headers: req.headers, body: method === 'GET' ? null : await req.clone().text(), redirect: 'manual', signal });
      if (res.status >= 300 && res.status < 400 && res.headers.has('location')) {
        // Redirects are followed for GET only (never replay a request body to a new URL), and every hop is re-checked.
        if (method !== 'GET') throw new Error('plugin fetch blocked: redirect on non-GET');
        if (hop >= MAX_REDIRECTS) throw new Error('plugin fetch blocked: too many redirects');
        url = new URL(res.headers.get('location')!, url);
        check(url, 'GET');
        continue;
      }
      return res;
    }
  }) as typeof fetch;
}

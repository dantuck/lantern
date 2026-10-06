const PUBLIC_EXACT = new Set([
  '/welcome', '/demo', '/theme-init.js', '/login', '/auth/request', '/auth/verify', '/auth/confirm', '/auth/code',
  '/manifest.webmanifest', '/sw.js', '/offline.html', '/offline.css', '/favicon.svg', '/apple-touch-icon.png', '/robots.txt',
]);
const PUBLIC_PREFIX = ['/demo/', '/icons/', '/_astro/'];

/** Everything not listed here requires a session (default deny). */
export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT.has(pathname) || PUBLIC_PREFIX.some((p) => pathname.startsWith(p));
}

export const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** State-changing requests must carry an Origin equal to our own; a missing Origin is rejected. */
export function isSameOrigin(request: Request, url: URL): boolean {
  return request.headers.get('origin') === url.origin;
}

// Script/style/etc. directives come from Astro's hashed <meta> CSP (astro.config.mjs). Only directives
// that <meta> cannot express belong here.
const CSP = ["frame-ancestors 'none'", 'upgrade-insecure-requests'].join('; ');

export function securityHeaders(enforceCsp: boolean): Record<string, string> {
  return {
    ...(enforceCsp ? { 'Content-Security-Policy': CSP } : {}),
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    // Not 'no-referrer': browsers then send `Origin: null` on same-origin POSTs, which our CSRF check (rightly) rejects.
    // 'same-origin' still sends no referrer to any other site.
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'X-Robots-Tag': 'noindex, nofollow',
  };
}

export function withSecurityHeaders(res: Response, enforceCsp: boolean): Response {
  const out = new Response(res.body, res); // headers on `res` may be immutable
  for (const [k, v] of Object.entries(securityHeaders(enforceCsp))) {
    // CSP is appended, never replaced: Astro sends its own hashed script/style policy and every policy must pass.
    if (k === 'Content-Security-Policy') out.headers.append(k, v);
    else out.headers.set(k, v);
  }
  if (!out.headers.has('Cache-Control')) out.headers.set('Cache-Control', 'no-store');
  return out;
}

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

export const clientIp = (request: Request) => request.headers.get('cf-connecting-ip') ?? 'unknown';

/** Role a path demands beyond being signed in. Enforced in middleware so new admin pages can't forget it. */
const MANAGER_PATHS = ['/admin', '/chores/manage'];
export function requiredRole(pathname: string): 'manager' | null {
  return MANAGER_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`)) ? 'manager' : null;
}

/** Whether the signed-in user is a manager. Pages and APIs that vary by role use this one check. */
export const isManager = (locals: { user?: { role: string } | undefined }): boolean => locals.user?.role === 'manager';

/**
 * Reads a request body with a hard byte cap, returning null if it is exceeded. Content-Length is only a hint
 * (chunked requests have none), so the stream itself is counted and cancelled once it goes over.
 */
export async function readBodyText(request: Request, maxBytes: number): Promise<string | null> {
  if (Number(request.headers.get('content-length') ?? 0) > maxBytes) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

/** Bounded urlencoded form (what our HTML forms send). null means "too large". */
export async function readForm(request: Request, maxBytes: number): Promise<URLSearchParams | null> {
  const text = await readBodyText(request, maxBytes);
  return text === null ? null : new URLSearchParams(text);
}

/** Bounded JSON body. null means "too large"; unparseable JSON yields undefined. */
export async function readJson(request: Request, maxBytes: number): Promise<unknown> {
  const text = await readBodyText(request, maxBytes);
  if (text === null) return null;
  try { return JSON.parse(text); } catch { return undefined; }
}

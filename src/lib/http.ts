import type { User } from './auth/users';

const PUBLIC_EXACT = new Set([
  '/welcome', '/demo', '/theme-init.js', '/login', '/auth/request', '/auth/verify', '/auth/confirm', '/auth/code',
  '/auth/invite', '/auth/invite/confirm',
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

/**
 * What a canonical path demands beyond being signed in. Enforced in middleware so new manager pages can't forget it.
 * 'admin' is a manager signed in as themselves (people, invites, devices); 'manager' also admits a member's device that a
 * manager has temporarily unlocked (see src/lib/auth/elevation.ts).
 */
const ADMIN_PATHS = ['/admin'];
const MANAGER_PATHS = ['/chores/manage', '/inbox'];
const under = (paths: string[], path: string) => paths.some((p) => path === p || path.startsWith(`${p}/`));
export function requiredRole(path: string): 'admin' | 'manager' | null {
  return under(ADMIN_PATHS, path) ? 'admin' : under(MANAGER_PATHS, path) ? 'manager' : null;
}

/**
 * The path as Astro's router sees it ("/%61dmin" is /admin). Every path rule in the middleware must use this, not
 * `url.pathname`. If it cannot be decoded cleanly the raw path is returned and has to match as is.
 */
export function canonicalPath(pathname: string): string {
  if (!pathname.includes('%')) return pathname;
  let path = pathname;
  try {
    for (let i = 0; i < 10; i++) {
      const next = decodeURI(path);
      if (next === path) break;
      path = next;
    }
  } catch { /* keep the last good form */ }
  return path;
}

type RoleLocals = { user?: { role: string } | undefined; elevation?: unknown };

/** Whether this request may manage the dashboard (chores, rewards, points): a manager, or a member's device a manager has unlocked. */
export const isManager = (locals: RoleLocals): boolean => locals.user?.role === 'manager' || !!locals.elevation;

/** Whether the signed-in user is a manager themselves. Account-level pages (people, invites, devices, alerts) use this, never `isManager`. */
export const isAdmin = (locals: RoleLocals): boolean => locals.user?.role === 'manager';

/** The manager responsible for this request's manager actions: the user, or the manager who unlocked this device. */
export const managerActor = (locals: { user?: User | undefined; elevation?: { by: User } | null | undefined }): User | undefined =>
  locals.user?.role === 'manager' ? locals.user : locals.elevation?.by;

/**
 * Reads a request body with a hard byte cap, returning null if it is exceeded. Content-Length is only a hint
 * (chunked requests have none), so the stream itself is counted and cancelled once it goes over.
 */
export async function readBodyText(request: Pick<Request, 'headers' | 'body'>, maxBytes: number): Promise<string | null> {
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

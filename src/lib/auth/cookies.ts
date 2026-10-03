import type { AstroCookieSetOptions } from 'astro';

/** Host-only, HttpOnly, Secure cookies. The __Host- prefix forbids Domain and requires Path=/ and Secure. */
export const cookieOptions = (maxAgeSeconds: number): AstroCookieSetOptions => ({
  path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: maxAgeSeconds,
});

interface CookieJar { set(name: string, value: string, options?: AstroCookieSetOptions): void }

/**
 * Expires a cookie. Do not use `cookies.delete()` for these: it omits `Secure`, and browsers ignore
 * updates to `__Host-` cookies that lack it, so the cookie would silently stay.
 */
export function clearCookie(cookies: CookieJar, name: string): void {
  cookies.set(name, '', { ...cookieOptions(0), expires: new Date(0) });
}

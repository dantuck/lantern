/**
 * Validates APP_ORIGIN, which is used to build the links we email. Fails closed: if it is missing or looks
 * like a leftover dev value in production, no sign-in or invitation link is sent at all.
 */
export function safeAppOrigin(raw: string | undefined, dev: boolean): string | null {
  if (!raw) return null;
  let u: URL;
  try { u = new URL(raw); } catch { return null; }
  const bare = u.pathname === '/' && !u.search && !u.hash && !u.username && !u.password;
  if (!bare) return null;
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
  if (dev) return u.protocol === 'https:' || (u.protocol === 'http:' && local) ? u.origin : null;
  return u.protocol === 'https:' && !local ? u.origin : null;
}

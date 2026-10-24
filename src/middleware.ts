import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { validateSession } from './lib/auth/sessions';
import { SESSION_COOKIE } from './lib/auth/policy';
import { clearCookie } from './lib/auth/cookies';
import { disabledFeatures } from './lib/features';
import { redirectTarget } from './lib/origin';
import { SAFE_METHODS, canonicalPath, isAdmin, isManager, isPublicPath, isSameOrigin, json, requiredRole, withSecurityHeaders } from './lib/http';

const enforceCsp = import.meta.env.PROD;

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { request, url, cookies, locals } = ctx;
  const finish = (res: Response) => withSecurityHeaders(res, enforceCsp);

  const moved = redirectTarget(url, env.APP_ORIGIN, env.REDIRECT_HOSTS);
  if (moved) return finish(Response.redirect(moved, 308));

  if (!SAFE_METHODS.has(request.method) && !isSameOrigin(request, url)) {
    return finish(new Response('Forbidden', { status: 403 }));
  }

  const path = canonicalPath(url.pathname);

  const sid = cookies.get(SESSION_COOKIE)?.value;
  const auth = await validateSession(env.DB, sid);
  if (auth) {
    locals.user = auth.user;
    locals.session = auth.session;
    locals.elevation = auth.elevation;
    locals.disabled = await disabledFeatures(env.DB);
  } else if (sid) {
    clearCookie(cookies, SESSION_COOKIE);
  }

  if (!auth && !isPublicPath(path)) {
    if (path.startsWith('/api/')) return finish(json({ error: 'unauthorized' }, 401));
    // Signed-out visitors to the front door get the product page; everything else goes to sign-in.
    return finish(ctx.redirect(path === '/' ? '/welcome' : '/login', 302));
  }
  const need = auth ? requiredRole(path) : null;
  if (need && !(need === 'admin' ? isAdmin(locals) : isManager(locals))) {
    return finish(new Response('Forbidden', { status: 403 }));
  }
  if (auth && (path === '/login' || path === '/welcome')) return finish(ctx.redirect('/', 302));

  return finish(await next());
});

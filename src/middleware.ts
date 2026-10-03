import { defineMiddleware } from 'astro:middleware';
import { env } from 'cloudflare:workers';
import { validateSession } from './lib/auth/sessions';
import { SESSION_COOKIE } from './lib/auth/policy';
import { clearCookie } from './lib/auth/cookies';
import { SAFE_METHODS, isPublicPath, isSameOrigin, json, requiredRole, withSecurityHeaders } from './lib/http';

const enforceCsp = import.meta.env.PROD;

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { request, url, cookies, locals } = ctx;
  const finish = (res: Response) => withSecurityHeaders(res, enforceCsp);

  if (!SAFE_METHODS.has(request.method) && !isSameOrigin(request, url)) {
    return finish(new Response('Forbidden', { status: 403 }));
  }

  const sid = cookies.get(SESSION_COOKIE)?.value;
  const auth = await validateSession(env.DB, sid);
  if (auth) {
    locals.user = auth.user;
    locals.session = auth.session;
  } else if (sid) {
    clearCookie(cookies, SESSION_COOKIE);
  }

  if (!auth && !isPublicPath(url.pathname)) {
    if (url.pathname.startsWith('/api/')) return finish(json({ error: 'unauthorized' }, 401));
    return finish(ctx.redirect('/login', 302));
  }
  if (auth && requiredRole(url.pathname) === 'manager' && auth.user.role !== 'manager') {
    return finish(new Response('Forbidden', { status: 403 }));
  }
  if (auth && url.pathname === '/login') return finish(ctx.redirect('/', 302));

  return finish(await next());
});

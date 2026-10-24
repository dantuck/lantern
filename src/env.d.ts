/// <reference path="../.astro/types.d.ts" />

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    CACHE: KVNamespace;
    APP_ORIGIN: string;
    MAIL_FROM: string;
    /** Comma-separated old hostnames that 308-redirect to APP_ORIGIN (optional). */
    REDIRECT_HOSTS?: string;
    RESEND_API_KEY?: string;
    BOOTSTRAP_MANAGER_EMAIL?: string;
    GOOGLE_SERVICE_ACCOUNT_JSON?: string;
    MEALQ_API_TOKEN?: string;
    /** Both set turns on the optional "time is up" push alerts (npm run push:keys makes them). */
    VAPID_PUBLIC_KEY?: string;
    VAPID_PRIVATE_KEY?: string;
  }
}

declare namespace App {
  interface Locals {
    user?: import('./lib/auth/users').User;
    /** Set when a manager has temporarily unlocked this member's device; `by` is that manager. */
    elevation?: import('./lib/auth/sessions').Elevation | null;
    session?: import('./lib/auth/sessions').Session;
    /** Ids a manager has switched off (signed-in requests only). See src/lib/features.ts. */
    disabled?: ReadonlySet<string>;
  }
}

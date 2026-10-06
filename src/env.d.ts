/// <reference path="../.astro/types.d.ts" />

declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    CACHE: KVNamespace;
    APP_ORIGIN: string;
    MAIL_FROM: string;
    RESEND_API_KEY?: string;
    BOOTSTRAP_MANAGER_EMAIL?: string;
    GOOGLE_SERVICE_ACCOUNT_JSON?: string;
    MEALQ_API_TOKEN?: string;
  }
}

declare namespace App {
  interface Locals {
    user?: import('./lib/auth/users').User;
    session?: import('./lib/auth/sessions').Session;
    /** Ids a manager has switched off (signed-in requests only). See src/lib/features.ts. */
    disabled?: ReadonlySet<string>;
  }
}

// The Worker's entry point. It is Astro's own handler for every web request, plus a once-a-minute schedule that sends the optional
// "time is up" alerts (see src/lib/push.ts). The schedule does nothing, and reads nothing, unless the VAPID keys are set.
import { handle } from '@astrojs/cloudflare/handler';
import { deliverDue, pushKeys } from './lib/push';

export default {
  fetch: handle,
  async scheduled(_controller, env, ctx) {
    const keys = pushKeys(env);
    if (keys) ctx.waitUntil(deliverDue(env.DB, keys));
  },
} satisfies ExportedHandler<Cloudflare.Env>;

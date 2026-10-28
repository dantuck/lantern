// The Worker's entry point. It is Astro's own handler for every web request, plus a once-a-minute schedule that sends the optional
// "time is up" alerts (see src/lib/push.ts). The schedule does nothing, and reads nothing, unless the VAPID keys are set.
import { handle } from '@astrojs/cloudflare/handler';
import { deliverDue, pushKeys } from './lib/push';
import { notifyManagers } from './lib/managerNotify';
import { selectMailer } from './lib/mailer';
import { safeAppOrigin } from './lib/origin';

export default {
  fetch: handle,
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(announceDue(env));
  },
} satisfies ExportedHandler<Cloudflare.Env>;

/** Rings the devices of everyone whose timer just ran out, then tells the managers who asked to hear about timers. */
async function announceDue(env: Cloudflare.Env) {
  const keys = pushKeys(env);
  if (!keys) return;
  const { finished } = await deliverDue(env.DB, keys);
  if (finished.length === 0) return;
  const via = { mailer: selectMailer(env, false), origin: safeAppOrigin(env.APP_ORIGIN, false), keys };
  await notifyManagers(env.DB, via, finished.map(({ person, name }) => ({
    kind: 'timers' as const, headline: `${name}'s screen time is up`, detail: `${name}'s screen time timer has finished.`, path: `/chores/${encodeURIComponent(person)}`,
  })));
}

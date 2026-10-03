import { z } from 'zod';
import { definePlugin } from '../types';

/** Template plugin: copy this folder to start a new one. No secrets, no network access. */
export default definePlugin({
  id: 'example',
  name: 'Example',
  icon: '👋',
  configSchema: z.object({ greeting: z.string().min(1).max(80).default('Hello') }),
  secrets: [],
  fetchPolicy: { hosts: [] },
  cacheTtlSeconds: 30,
  async loader({ config, now }) {
    return { message: config.greeting, generatedAt: now };
  },
});

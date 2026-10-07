import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import svelte from '@astrojs/svelte';

export default defineConfig({
  output: 'server',
  // No Cloudflare Images binding, and none of Astro's own sessions (we have our own auth): fewer bindings, less surface.
  adapter: cloudflare({ imageService: 'passthrough' }),
  session: false,
  integrations: [svelte()],
  // Rejects cross-origin form submissions (CSRF); middleware also checks Origin on every unsafe method.
  security: {
    checkOrigin: true,
    // Astro emits a <meta> CSP with per-page hashes, which covers its inline island-hydration script.
    // Directives a <meta> cannot carry (frame-ancestors) are sent as a header from src/lib/http.ts.
    csp: {
      scriptDirective: { resources: ["'self'"] },
      // Svelte style: directives need style-src-attr; there are no inline <style> blocks.
      styleDirective: { resources: ["'self'", { resource: "'unsafe-inline'", kind: 'attribute' }] },
      directives: [
        "default-src 'none'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "manifest-src 'self'",
        "worker-src 'self'",
        "base-uri 'none'",
        "form-action 'self'",
      ],
    },
  },
  // No Markdown or <Code> anywhere, so Shiki (inline styles, CSP-incompatible) has nothing to do.
  markdown: { syntaxHighlight: false },
  build: { inlineStylesheets: 'never' },
  vite: { build: { assetsInlineLimit: 0 } },
});

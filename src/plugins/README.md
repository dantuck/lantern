# Writing a plugin

A plugin is a folder `src/plugins/<id>/`. Copy `example/` to start.

| File | Required | Purpose |
|---|---|---|
| `plugin.ts` | yes | `export default definePlugin({...})`. Pure server code: no `.astro`/`.svelte` imports. |
| `Widget.astro` | yes | Card body. Receives `data` (the loader's output) and `config`. Put interactive bits in a Svelte island with `client:visible`. |
| `Page.astro` | no | Full-page view at `/p/<id>`. Falls back to `Widget.astro`. |

Then enable it in `dashboard.config.ts` (your local copy of `dashboard.config.example.ts`; add it to the example too if it should ship by default) (order = display order; `span: 2` makes it wide).

## The contract (`definePlugin`)

- **`id`**: lowercase slug, must equal the folder name.
- **`configSchema`**: zod schema for non-secret settings from `dashboard.config.ts`. Invalid config fails at startup and in tests.
- **`secrets`**: names of Worker secrets (`wrangler secret put NAME`). The host passes the loader only these. If any is missing the card shows "not set up" and the loader never runs. Platform bindings (`DB`, `RESEND_API_KEY`, ...) are reserved and rejected.
- **`fetchPolicy`**: exact hostnames (https only) and methods the loader may use. Default is GET only. Widen on purpose and say why (e.g. `POST` to an OAuth token endpoint).
- **`cacheTtlSeconds`**: loader output is cached in KV for this long. If the loader fails, the last good copy (up to 24h) is shown, marked as saved data.
- **`loader(ctx)`**: server-only and read-only. Use `ctx.fetch`, never the global `fetch`. It has 8 seconds. Return JSON-serialisable data.

## Rules

1. **Read-only.** Plugins never write to the household's data, and the API exposes GET only.
2. **Secrets stay on the server.** Never put one in `data`: everything the loader returns is sent to signed-in browsers and cached.
3. **Errors stay on the server.** Throw freely; the host logs the message and shows a generic card. Don't put upstream error text in `data`.
4. **No inline scripts, styles or event handlers.** The CSP forbids them. Use Svelte islands and CSS classes.

## What the guardrails are (and aren't)

`ctx.fetch` and the secret filtering stop mistakes and surprises in plugin code you have reviewed. They are **not a sandbox**: plugins run in the same Worker as the rest of the app, so only add plugins whose code you trust.

## Checks

`npm test` loads every plugin and the real `dashboard.config.ts` through the registry's validation, so a bad id, reserved secret, wildcard host or invalid config fails the build. `scripts/smoke-plugins.sh` exercises the host end to end; `scripts/check-csp.sh` verifies the production CSP.

# Writing a plugin

A plugin is a folder `src/plugins/<id>/`. Copy `example/` to start.

| File | Required | Purpose |
|---|---|---|
| `plugin.ts` | yes | `export default definePlugin({...})`. Pure server code: no `.astro`/`.svelte` imports. |
| `Widget.astro` | yes | Card body. Receives `data` (the loader's output) and `config`. Put interactive bits in a Svelte island with `client:visible`. |
| `Page.astro` | no | Full-page view at `/p/<id>`. Falls back to `Widget.astro`. |

Besides `calendar/` and `mealq/`, `example/` is a minimal template that is shown only in development (and the CSP check build). Each enabled plugin also gets a link in the navigation, a full page at `/p/<id>`, and a JSON endpoint at `/api/plugins/<id>/data` (GET only, signed-in). A manager can switch any plugin off under Admin → Widgets and features; that hides it without touching `dashboard.config.ts`.

Then enable it in `dashboard.config.ts` (your local copy of `dashboard.config.example.ts`; add it to the example too if it should ship by default) (order = display order; `span: 2` makes it wide).

## The contract (`definePlugin`)

- **`id`**: lowercase slug, must equal the folder name.
- **`name`, `icon`**: the card title and its icon: a Feather icon name (`src/lib/icons.ts`) or an image under `public/icons/`.
- **`configSchema`**: zod schema for non-secret settings from `dashboard.config.ts`. Invalid config fails at startup and in tests. `zoneLocaleShape` and `hostnameField` in `src/plugins/fields.ts` are shared building blocks for a time zone and locale, and for a bare hostname that becomes the plugin's allowed host.
- **`resolveConfig`** (optional): fill in raw config from the other enabled plugins' entries before it is validated. The calendar uses it to borrow MealQ's `apiHost` for `meals: {}`.
- **`secrets`**: names of Worker secrets (`wrangler secret put NAME`). The host passes the loader only these. If any is missing the card shows "not set up" and the loader never runs. **`optionalSecrets`** are passed when set and never block the card (the calendar uses `MEALQ_API_TOKEN` this way for its meal plan). Platform bindings (`DB`, `RESEND_API_KEY`, ...) are reserved and rejected.
- **`fetchPolicy`**: exact hostnames (https only) and methods the loader may use. Default is GET only. Widen on purpose and say why (e.g. `POST` to an OAuth token endpoint).
- **`cacheTtlSeconds`**: loader output is cached in KV for this long, keyed by plugin id and a hash of its config (60 seconds for MealQ, 5 minutes for the calendar). If the loader fails, the last good copy (up to 24h) is shown, marked as saved data. A forced refresh still waits at least 5 seconds between fetches.
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

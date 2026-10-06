# You are the host

When you run `npm run setup`, you become the operator of this dashboard. That is the point: the data and the
secrets live in accounts you own, and the people who wrote the software never see them. It also means a few jobs
are yours, because nobody else is doing them.

## Who can see what

| Who | What they can see |
|---|---|
| **You**, and anyone who can log in to your Cloudflare account | Everything: the member list, the audit log, every secret you set, and the dashboard's code and settings |
| **The people you invite** | The dashboard widgets, their own devices, and (managers only) the Admin page |
| **Cloudflare** | Your site's traffic and stored data, as with any site you host there |
| **Resend** | The sign-in and invite emails, and who they went to |
| **Google, MealQ** | Only the read-only requests the widgets make with the credentials you gave them |
| **The software's author** | Nothing. There is no telemetry, update check or reporting (see [`SECURITY.md`](../SECURITY.md)) |

Because your Cloudflare login is the key to all of it, protect that account first: a strong unique password and
**two-factor authentication**.

## Your regular jobs

| Job | How often | How |
|---|---|---|
| **Update** | When a release lands, and at least every few months | `git fetch --tags`, check out the new tag, read `CHANGELOG.md`, then `npm ci && npm run update`. Update takes a backup first. |
| **Back up** | Automatic on every update; manually before anything risky | `npx wrangler d1 export family-dashboard --remote --output backup.sql`. Keep it private: it contains member emails and the audit log. It contains none of the API keys or tokens you set (those are Worker secrets, not database rows). |
| **Keep the domain renewed** | Yearly | If the domain lapses, the site goes down, and someone who registers it could send convincing sign-in emails from it. Turn on auto-renew. |
| **Review members** | When people join or leave | Admin: disable anyone who should no longer have access; that signs them out everywhere at once. |
| **Rotate secrets** | If one might have leaked, or when someone with access leaves | Make a new key or token at the source (Resend, Google, MealQ), then `npx wrangler secret put NAME` and revoke the old one. |

If you do nothing for a while, nothing breaks: the site keeps working, and sessions expire by themselves (30 days
idle, 90 days at most). What you lose is security fixes, so do not leave updates for years.

## If something goes wrong

Start with `npm run doctor`. It checks your settings, Cloudflare login, secrets (names only, never values), database, members and backups without changing anything, and says how to fix what it finds.

- **Someone lost a phone:** they, or you in Admin, sign that device out. A saved offline copy on the phone is
  wiped at sign-out, and expires after 24 hours regardless.
- **A bad update:** `npx wrangler rollback` returns to the previous version. The database stays migrated; releases
  are built so the previous version still works with it.
- **You are locked out as the only manager:** the recovery command is in the README under "Operating it".
- **A secret leaked:** rotate it as above. The credentials are deliberately narrow (read-only calendar, a MealQ
  token that can only read the meal plan, a Resend key that can only send), which limits what a leak allows.
- **You lost access to your Cloudflare account:** that is a Cloudflare account-recovery matter. This is why the
  account needs a recovery email and two-factor backup codes you have stored safely.

## Taking it down completely

Run these from the project folder, in this order. They delete your data, so take a backup first if you might
want it. Each command shows what it will delete and asks for confirmation.

```bash
npx wrangler d1 export family-dashboard --remote --output final-backup.sql   # optional
npx wrangler delete                        # the Worker and its secrets
npx wrangler d1 delete family-dashboard    # the database: members, sessions, audit log
npx wrangler kv namespace list             # find the CACHE namespace for this app...
npx wrangler kv namespace delete --namespace-id <its id>
```

Then, by hand: revoke the Resend API key, remove the Resend domain and its DNS records (and the `_dmarc` record if
you added it only for this), delete the Google service account and its key, and revoke the MealQ token. Finally,
check Cloudflare's Workers settings and DNS page and remove the dashboard's custom domain and any DNS record that is left over.

# Setting up your own Family Dashboard

This walks you from nothing to a working dashboard on your own domain. Plan on about an hour, most of it waiting
for DNS. You need to be comfortable pasting commands into a terminal, but you do not need to write code.

You will end up with a private site that only people you invite can open. It runs on your own Cloudflare account
and sends its sign-in emails from your own Resend account. Nobody else, including whoever wrote this software, runs
it or can see your data (see [`SECURITY.md`](../SECURITY.md)).

## What it costs

Cloudflare and Resend both have free plans that comfortably cover one household. The one unavoidable cost is a
**domain name** (a few dollars a year) if you do not already own one. Free-plan limits change, so check both
services' current pricing pages before you start; a household of a few people signing in occasionally is far below
any of them.

## What you need

- A computer with a terminal (macOS, Linux, or Windows with WSL), with **git** and **Node 22.12 or newer**
  (`node --version` shows it; get it from nodejs.org if it is older).
- A **domain name** you control, so you can change its DNS settings.
- A free **Cloudflare** account.
- A free **Resend** account (this sends the sign-in emails).
- Optional: a Google account for the calendar widget, and a MealQ account for the meal-plan widget.

## 1. Get the code

```bash
git clone <the repository address> family-dashboard
cd family-dashboard
git tag --list              # pick the newest release tag, for example v0.1.0
git checkout v0.1.0         # deploy a tagged release, not the latest unreleased work
npm ci                      # installs exactly the locked dependencies
```

`npm ci` also creates two settings files for you, `wrangler.jsonc` and `dashboard.config.ts`. They stay on your
machine and are never committed, so updates will not overwrite them.

Read [`CHANGELOG.md`](../CHANGELOG.md) for the release you picked. If you are comfortable with it, glance at
`git log` for that tag too: you are about to run this code with your family's data.

## 2. Put your domain on Cloudflare

1. In the Cloudflare dashboard, add your domain as a site (the free plan is enough).
2. Cloudflare shows two **nameservers**. At the company where you bought the domain, replace its nameservers with
   those two. This can take from minutes to a few hours to become active; Cloudflare emails you when it is.
3. Choose the hostname the dashboard will live at, for example `dashboard.yourfamily.org`. It must be on that
   domain. You do not create a DNS record for it by hand; setup attaches it for you.
4. Log in from the terminal:

   ```bash
   npx wrangler login
   ```

   A browser window opens; approve it. This is how setup acts on your account. Nothing is sent to anyone else.

## 3. Set up Resend (sign-in emails)

The dashboard has no passwords. People sign in with a one-time link sent by email, so email must work before
anyone can get in.

1. In Resend, **add your domain** (or a subdomain such as `mail.yourfamily.org`) and add the DNS records Resend
   shows you (SPF and DKIM) in Cloudflare's DNS page. If Resend offers to configure Cloudflare for you, that is
   fine. Wait until Resend shows the domain as **verified**.
2. Add a **DMARC** record in Cloudflare DNS: a `TXT` record named `_dmarc` with the value
   `v=DMARC1; p=quarantine; rua=mailto:you@yourfamily.org` (use your own address). This helps your emails reach
   inboxes and makes forging your domain harder.
3. In Resend's domain settings, make sure **click tracking and open tracking are off**. Tracking rewrites the
   links in the email and breaks the sign-in link.
4. Create an **API key** with **sending access** only (not full access) and keep it somewhere safe for step 6.
5. Decide the sender address, for example `login@mail.yourfamily.org`. It must be on the domain you verified in step 1. Setup suggests `login@` plus your dashboard hostname; if you verified a different domain, type that address instead.

## 4. Optional: Google Calendar widget

The dashboard shows one shared calendar, read-only, using a **service account** (a robot Google account you
create and give access to that calendar).

1. In the Google Cloud console, create a project, enable the **Google Calendar API** for it, and create a
   **service account**. Create a **JSON key** for it and download the file. Keep it private: it is a credential.
2. Open Google Calendar, share the calendar with the service account's email address (it looks like
   `name@project.iam.gserviceaccount.com`) with permission **See all event details**.
3. In that calendar's settings, find the **Calendar ID** (for a shared family calendar it usually looks like
   `abc123@group.calendar.google.com`). You will need it in step 6.

Skip this step if you do not want a calendar; setup lets you leave the widget out.

## 5. Optional: MealQ widget

The meal-plan widget needs MealQ's API to provide a read-only endpoint and a token that identifies your household.
Both are described in [`mealq-api-contract.md`](mealq-api-contract.md). You will need the API hostname and an
access token. Skip it if you do not use MealQ.

## 6. Run the setup

First, a rehearsal that asks the questions and shows what it would do, changing nothing:

```bash
npm run setup -- --dry-run
```

Then the real thing:

```bash
npm run setup
```

It asks for, in order: which Cloudflare account to use (if you have several), your hostname, the sender address,
your time zone, your own email (you become the first manager), and the optional widget details. Secrets you type
(the Resend key, the MealQ token) are hidden, are not saved to any file, and go straight to Cloudflare. The Google
key file is read from the path you give it and sent the same way.

Then it creates your database, runs the checks, and asks before it deploys. If anything fails partway, fix the
problem and run it again: it picks up where it left off and offers your earlier answers.

## 7. First sign-in

1. Open your hostname in a browser. It can take a few minutes after the first deploy before the address works.
2. Enter the email you gave setup. You get a sign-in link by email (valid 10 minutes).
3. **Open the link in the same browser** you asked from. Links only work in the browser that requested them, which
   is what stops forwarded or scanned links from working.
4. When setup asks whether you are signed in, say yes. It then removes the one-time bootstrap secret.
5. Open **Admin** and invite the rest of the household by email. They sign in the same way.
6. On a phone, install it: in Chrome use the install button, on iPhone use Safari, Share, **Add to Home Screen**.
   [`pwa-manual-check.md`](pwa-manual-check.md) is a short checklist to confirm offline and sign-out behaviour.

## When something is wrong

| What you see | Likely cause and fix |
|---|---|
| No sign-in email arrives | The sending domain is not verified in Resend yet, or the sender address is not on that domain. Check spam. Check Resend's logs for the message. |
| "This link is invalid, expired, or was opened in a different browser…" | The link is older than 10 minutes, was opened in a different browser from the one that asked for it, or a newer link was requested since (only the newest works). Request a new one and open it in the same browser. |
| The address does not load | DNS or the Cloudflare nameserver change has not finished, or the hostname is not on a domain in the same Cloudflare account you chose. Wait, then re-check. |
| You are not sure what is wrong | Run `npm run doctor`. It lists what is set up correctly and what is not, with a fix for each. |
| Setup stopped halfway | Run `npm run setup` again; completed steps are reused. |
| A widget says it is not set up or unavailable | Its secrets are missing or wrong, or the upstream (Google, MealQ) refused the request. Re-run setup, or set the secret again with `npx wrangler secret put NAME`. |
| You locked yourself out as the only manager | The recovery command is in the README under "Operating it". |

## Next

- Keep it current: [`README.md`](../README.md#updating) explains `npm run update`.
- Understand what you now run, and what you are responsible for: [`you-are-the-host.md`](you-are-the-host.md).

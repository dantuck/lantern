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

## Using a subdomain (recommended)

Put the dashboard on a subdomain of a domain you already own rather than on the bare domain, and use that **same
hostname** as the sending domain in Resend. Using `yourfamily.org` as the example:

| What | Example | Why |
|---|---|---|
| Dashboard address | `family.yourfamily.org` | Short and easy to type on a phone; becomes the home-screen icon's address |
| Email sending domain (verified in Resend) | `family.yourfamily.org` (the same name) | Scopes everything to this dashboard: Resend's records live under that name, so nothing else on `yourfamily.org` shares its mail records or its sending reputation |
| Sender address | `login@family.yourfamily.org` | Must be on the domain you verified in Resend. Setup suggests exactly this, so you can press Enter |

If you would rather have one shared sending domain for several sites, use a subdomain such as `mail.yourfamily.org`
instead and type `login@mail.yourfamily.org` at setup's sender prompt. The catch is that every site sending from it
shares one reputation. For a single dashboard, the dashboard's own hostname is simpler and better contained.

**Choosing the name.** Pick for readability, not secrecy: the address shows up in public certificate logs anyway,
and the sign-in requirement is what protects the site. Avoid `admin`, `login`, `mail`, `www` and `api` for the
dashboard itself, since those are common attack targets or confusing for family members. `family`, `home` and
`dashboard` all work.

**What you have to do with DNS**

- **The dashboard address: nothing.** When you type it into setup and it deploys, Cloudflare creates the DNS record for
  you. This only works if the main domain is on the same Cloudflare account you pick in setup's first step.
- **Before you start, look at the domain's existing DNS records** in Cloudflare. If a record already exists for the
  name you chose (an old CNAME or A record, say), delete it first or the deploy will likely complain. Check too that
  nothing else you run, such as another app or service, already uses that name.
- **The email domain: you add the records yourself.** In step 3, add the same hostname to Resend. Resend then shows
  the exact SPF and DKIM records to create; copy them into Cloudflare's DNS page for your domain (or use Resend's
  Cloudflare connection if it offers one). Wait for Resend to show the domain as verified. Those records go on names
  *under* the hostname (Resend's DKIM and return-path records, for example), not on the hostname itself, so they do not
  clash with the dashboard's own record. If Resend ever asks for a record on exactly the dashboard's name, stop and
  work out why before you delete anything.
- **DMARC: one record is enough.** A `_dmarc` TXT record on `yourfamily.org` also covers its subdomains. If your
  domain already has one, keep it. To give this dashboard a policy of its own, you can add a separate `_dmarc` record
  on the hostname (`_dmarc.family.yourfamily.org`), which takes precedence for that name.
- **SPF: one record per name.** A name may have only one SPF record; two break each other. Resend places its own on a
  separate name under your sending domain, so this rarely matters, but if you ever add SPF by hand, keep one per name.

When setup asks for the hostname, type the dashboard address (`family.yourfamily.org`). When it asks for the sender
address, press Enter to accept `login@family.yourfamily.org`. Nobody can reply to that address, because the subdomain
receives no mail; that is fine for a system sender.

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
3. Choose the hostname the dashboard will live at, for example `family.yourfamily.org` (see *Using a subdomain* above).
   It must be on that domain. You do not create a DNS record for it by hand; setup attaches it for you.
4. Log in from the terminal:

   ```bash
   npx wrangler login
   ```

   A browser window opens; approve it. This is how setup acts on your account. Nothing is sent to anyone else.

## 3. Set up Resend (sign-in emails)

The dashboard has no passwords. People sign in with a one-time link sent by email, so email must work before
anyone can get in.

1. In Resend, **add your sending domain**: the dashboard's own hostname, such as `family.yourfamily.org` (see *Using a
   subdomain* above), and add the DNS records Resend
   shows you (SPF and DKIM) in Cloudflare's DNS page. If Resend offers to configure Cloudflare for you, that is
   fine. Wait until Resend shows the domain as **verified**.
2. Add a **DMARC** record in Cloudflare DNS: a `TXT` record named `_dmarc` with the value
   `v=DMARC1; p=quarantine; rua=mailto:you@yourfamily.org` (use your own address). This helps your emails reach
   inboxes and makes forging your domain harder.
3. In Resend's domain settings, make sure **click tracking and open tracking are off**. Tracking rewrites the
   links in the email and breaks the sign-in link.
4. Create an **API key** with **sending access** only (not full access) and keep it somewhere safe for step 6.
5. Decide the sender address, for example `login@family.yourfamily.org`. It must be on the domain you verified in
   step 1. Setup suggests `login@` plus your dashboard hostname, so if you followed step 1, press Enter; if you
   verified a different domain, type an address on that domain instead.

## 4. Optional: Google Calendar widget

The dashboard shows one shared calendar, read-only, through a **service account**: a robot Google account that can
see only what you share with it. `npm run setup` prints these same steps at the right moment; you can also do them
now. Menu names change over time, so look for the item with the same name.

**Create the service account and its key** (about 5 minutes)

1. Go to the [Google Cloud console](https://console.cloud.google.com) and create a project, or pick an existing one.
   The name does not matter.
2. **APIs & Services, Library**: search for **Google Calendar API** and click **Enable**. Without this step,
   requests are refused.
3. **IAM & Admin, Service Accounts, Create service account**. Name it something like `family-dashboard`. Skip the
   optional steps about roles and access; it needs none.
4. Open the new service account, go to **Keys, Add key, Create new key**, choose **JSON**, and create it. A `.json`
   file downloads.

   That file is a credential: treat it like a password and do not email it or put it in a repository. Setup sends
   it to Cloudflare and keeps no copy, so you can delete the download afterwards and create a new key whenever you
   need one.

   If **Create new key** is unavailable, your Google organisation blocks service-account keys by policy. Ask its
   administrator to allow it, or create the project under a personal Google account instead.

**Share your calendar with it**

5. Open the downloaded file in a text editor and find `client_email`; it looks like
   `family-dashboard@your-project.iam.gserviceaccount.com`. Setup also prints this address for you once it has read
   the file. It is not secret.
6. In Google Calendar, open the settings of the calendar you want to show ("Settings and sharing"), then **Share
   with specific people or groups**, add that address, and give it the permission **See all event details**.
7. On the same settings page, in the **Integrate calendar** section, find the **Calendar ID**. For a shared family
   calendar it usually looks like `abc123@group.calendar.google.com`; for your own main calendar it is your Gmail
   address. Setup asks for it.

At the setup prompt, give the path to the downloaded file (you can drag the file into the terminal window). If you
are not ready, answer **n** to the calendar question; you can run `npm run setup` again later and answer **y**.

## 5. Optional: MealQ widget

The meal-plan widget shows your household's MealQ meal plan, read-only. You need:

- **The MealQ API hostname.** Setup defaults to MealQ's own public API (`api-mealq.plantolive.app`), so press Enter
  unless you run your own MealQ server. Type it bare, with no `https://`, port or path.
- **A MealQ access token** with read-only `mealplan:read` access to your household. It identifies the household,
  so no other id is needed. It is a secret: setup sends it straight to Cloudflare and keeps no copy. What the token
  must allow, and what the dashboard asks of MealQ, is in [`mealq-api-contract.md`](mealq-api-contract.md).

Skip this step if you do not use MealQ: answer **n** at the question, and run `npm run setup` again later to add it.

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

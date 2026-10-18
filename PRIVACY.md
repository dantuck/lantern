# Privacy policy

*Last updated: 2026-10-18*

Lantern, by Plan To Live LLC, is open-source software that you run yourself. This policy covers two things: what the
project and Plan To Live LLC collect, and what the software you deploy stores.

## What Plan To Live LLC collects

**Nothing.** Plan To Live LLC does not operate your Lantern, does not receive its data, and holds none of its
secrets. The software has no analytics, error reporting, update checks or "phone home". This repository (and any
project page for it) is hosted on GitHub, which has its own privacy practices when you visit or contribute.

## What your Lantern stores

When you deploy Lantern, **you** are the operator and the data controller for your household. Everything is stored in
your own Cloudflare account (D1 database and KV): member email addresses and roles, invites, hashed sign-in tokens
and sessions, rate-limit counters, a 400-day audit log, the household's people (names and colours), their chores and when
chores were ticked off or skipped (kept 60 and 7 days), points, reward requests and household goals, screen time minutes,
allowances, running timers and each person's chosen timer sound, each manager's notification choices, the browser
addresses and keys of devices that turned on "time is up" alerts or manager notifications (optional), shared lists, and a
short cache of widget data. Much of this is about household members, including children, so see the sections below. Nothing is copied anywhere else.

## Who your Lantern talks to

Only the services you configure, and only for the purposes below. [`SECURITY.md`](SECURITY.md) is the authoritative
list, and a test fails if the code gains a new destination without it being added there.

| Service | Purpose | What is sent |
|---|---|---|
| Resend | Sign-in and invite emails, and optional emails to managers about reward requests and timers | Recipient address and message |
| Google (Calendar API) | Calendar widget | A signed service-account token request and a read-only calendar query |
| Open-Meteo (optional) | Forecast in the calendar | Your coordinates, rounded to about 1 km, and your time zone |
| Extra calendar hosts (optional): the NHL's schedule API, Google's public holiday feed, and any public `.ics` link you list | Extra calendars overlaid on the calendar | A plain GET of the feed. Nothing about you or the household |
| MealQ (the host you configure) | Meal plan widget | Your MealQ access token and a date range |
| The push service of a member's browser (Apple, Google, Mozilla or Microsoft), optional | "Time is up" alert for a screen time timer, and notifications to managers, only if you set the VAPID keys and someone turns alerts on for a device | An encrypted message only that device can read. The push service learns that your Lantern sent a message to that device |

Each of those services has its own privacy policy, which applies to data sent to it. Your own Cloudflare account is
also subject to Cloudflare's privacy policy.

## Cookies

Lantern sets two first-party cookies: a session cookie that keeps a signed-in member signed in, and a short-lived cookie that ties a sign-in link or code to the browser that requested it. There are no advertising or analytics cookies
and no third-party scripts: the browser only ever talks to your own domain.

## Your responsibilities as the operator

If other people use your Lantern, tell them what is stored (this document is a starting point), honour requests to
remove them (a manager can disable a member, and `docs/you-are-the-host.md` covers deleting everything), and keep the
Worker secrets and any database exports private. If you turn on Cloudflare request logging for debugging, logs can
include sign-in addresses and live in your account.

## Children

Lantern is designed for households, including children as members. Because the operator is the household, the
operator decides which household members, including children, are added, and is responsible for that choice.

## Changes

If this policy changes, the change is recorded in the repository history and in `CHANGELOG.md`.

## Contact

Questions about this policy or the project: open an issue at https://github.com/dantuck/lantern. For security reports,
see [`SECURITY.md`](SECURITY.md).

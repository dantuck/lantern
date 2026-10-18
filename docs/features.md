# Features

What Lantern does for a household, and how each part is configured. For the moving parts behind it, see
[`architecture.md`](architecture.md). To try everything with sample data, open `/demo` (no sign-in, nothing real).

## Who can do what

| | Member | Manager |
|---|---|---|
| See the dashboard, calendar, meal plan, chores, points and lists | yes | yes |
| Tick chores off, ask for a reward, spend screen time, start and stop a timer, choose a timer sound | yes | yes |
| Add, tick and remove list items and lists | yes | yes |
| Turn "time is up" alerts on for a device | yes | yes |
| See and sign out their own devices | yes | yes |
| Edit chores, bonuses, rewards, goals, allowances; approve or deny requests; adjust points and minutes | | yes |
| Invite, re-send and revoke invites; change roles; disable members | | yes |
| Manage people, switch widgets and built-ins on or off, set their own notifications | | yes |
| See every signed-in device and the audit log | | yes |

There is no self sign-up. A **manager** invites each person by email as a member or as a manager. The last manager cannot
be demoted or disabled.

## Signing in

Enter an email on `/login`. The answer is always the same ("if that address is invited, a link is on its way"), so
addresses cannot be probed. If it belongs to an active member, an email goes out with a single-use link (valid 10
minutes) and an 8-digit code.

- **Link.** It only works in the browser that asked for it, which stops forwarded links and email scanners.
- **Code.** For reading the email on another device: type it into the page that is waiting. It works only in the
  requesting browser and is burned after 5 wrong tries.
- **Invites.** A member's invite email also has a one-click **Join** link (valid 2 days; the invitation itself lasts 7).
  Manager invites never get one, so a leaked invite cannot hand over admin.
- **Sessions** last 30 days idle and 90 days at most. Each device is listed on **Devices** and can be signed out there,
  or by a manager under **Admin**.

## Dashboard

A card for each enabled widget (the calendar spans two columns by default), then Chores and Lists. Each card links to
its full page. Signed in, the navigation is a side rail on tablets and larger and a bottom bar on phones, with the rest
under **More**.

An open dashboard refreshes itself when the app comes back to the front, and every few minutes if it is left up. It
never swaps anything while someone is using it.

### Wall display

The **wall display** button hides the navigation, enlarges everything, goes fullscreen and asks the screen to stay awake.
It is remembered per browser, so a kitchen tablet can stay in it while phones do not.

## People

A person has a name, a colour and optional match words. They give the calendar its colours and filters, and give the
Chores page a column each. Managers add, rename, recolour and remove people under **Admin → People** (up to 12). A
person's id comes from their first name and never changes on rename, so points and chores stay attached.

Until a manager adds anyone in Admin, the `people` list in `dashboard.config.ts` is used instead, so older setups keep
working:

```ts
people: [
  { name: 'Gru', color: '#e8590c' },                          // color is optional
  { name: 'Minions', match: ['Minion', 'Kevin', 'Bob'] },     // extra words that put an event on their calendar
],
```

An event goes on a person's calendar when their name (or a match word) appears as a whole word in its **title**, such as
"Ballet: Agnes". Events that name nobody are "Family". Only the title is looked at, in the browser.

## Calendar

Read-only. Shows one shared Google Calendar through a service account, in four views:

- **Day:** one column per person.
- **Week:** the dashboard card shows a week; the full page can switch views.
- **Month:** a grid; select a day to see its events.
- **Agenda:** a list. Phones start here.

Multi-day events are drawn as bars across the days they cover. All-day events and meals have their own rows above the
hours. The last view is remembered per browser, and `?view=day|week|month|agenda` overrides it. Filter chips hide a
person or feed.

In `dashboard.config.ts`:

```ts
{ id: 'calendar', span: 2, config: {
    timeZone: 'America/Chicago',
    daysAhead: 60,                                            // 7 to 120
    weather: { latitude: 41.88, longitude: -87.63, units: 'imperial' },
    feeds: [{ preset: 'nhl-det' }, { preset: 'us-holidays' }, { name: 'School', url: 'https://example.org/school.ics' }],
    meals: {},                                                // see Meals on the calendar
} }
```

**Secrets:** `GOOGLE_SERVICE_ACCOUNT_JSON` and `GOOGLE_CALENDAR_ID` (see the [setup guide](setup-guide.md#4-optional-google-calendar-widget)).
With either missing the card says it is not set up.

**Extra calendars (`feeds`, at most 8).** Each has its own colour and filter chip. Three spellings:

- `{ preset: 'nhl-det' }`: a known calendar from `src/plugins/calendar/presets.ts` (every NHL team, plus
  `us-holidays`). `name` and `color` can be overridden.
- `{ nhl: 'DET', name: 'Red Wings' }`: an NHL team, read from the NHL's public schedule API.
- `{ name, url, color }`: any public `.ics` or `webcal://` link.

Feed hosts are added to the plugin's outbound allowlist. A feed that is down or too large is skipped and the rest still
load. Feed URLs live in `dashboard.config.ts`, so use only public ones. Recurrence rules in `.ics` feeds are not
expanded.

**Weather.** Optional. Adds a forecast to the day headers. It sends your coordinates, rounded to about 1 km, and your time
zone to Open-Meteo, which needs no key.

### Meals on the calendar

Add `meals: {}` to the calendar's config. It uses the host from the MealQ entry (or set `apiHost` yourself) and reuses
the `MEALQ_API_TOKEN` secret, so there is nothing new to set up. Dinner shows by default; `slots: ['breakfast', 'lunch',
'dinner', 'snack', 'other']` picks the meals, and the toggles above the calendar change them for that browser. Meals
appear in a row above the hours in Day and Week, as chips in Month and as rows in Agenda. Select one to see its
description, prep time, ingredients, instructions and recipe link, when MealQ sends them. It asks MealQ for a week back
to about three weeks ahead. If the token is missing or MealQ is down, the calendar loads without meals. Nothing is ever
written to MealQ.

## Meal plan

A card (and full page) showing the next `daysAhead` days (1 to 14, default 7) of the household's MealQ meal plan. Days
whose meals have details expand to show them. Needs `MEALQ_API_TOKEN`; the API it talks to is described in
[`mealq-api-contract.md`](mealq-api-contract.md).

```ts
{ id: 'mealq', config: { apiHost: 'api-mealq.plantolive.app', timeZone: 'America/Chicago', daysAhead: 7 } }
```

## Chores

Each person has **one routine**, split by time of day (morning, afternoon, evening, any time). **Anyone** has one too, for
shared chores. A manager adds chores at **Chores → Manage** (`/chores/manage`), giving each:

- a **time of day**;
- the **days it repeats** (every day, weekdays, or chosen days), or a **single date** for a one-off;
- optional **points** (0 to 100).

Ticks are stored per day, so every chore starts fresh each day it is scheduled; nothing needs resetting. A routine holds
up to 60 chores. Other things managers can do:

- **Skip today.** Leaves a chore out of one day's list, points and bonus. It is back the next day.
- **Quick add** with a typeahead from existing chore names, and **undo** after removing one.
- **Collapse, find and expand all** on the manage page when routines get long.

Anyone signed in can tick a chore. When the last chore of the day is ticked, confetti celebrates (smaller for a time of
day with a bonus). It is skipped for devices set to reduce motion.

## Points and rewards

- **Earning.** Points go to the person the chore is for ("Anyone" earns none) and are taken back if it is un-ticked.
  A manager can also set an **all-done bonus** for each time of day, paid when every chore due then is ticked.
- **Rewards.** Managers add rewards with a point cost (up to 40). A reward can be limited to certain people, and can be
  hidden to pause it without deleting it.
- **Asking.** Anyone can ask for a reward the person can afford, from that person's column. Nothing is deducted until a
  manager approves; **Approve all that can be afforded** handles a batch. Managers can be told about requests (see
  [Manager notifications](#manager-notifications)), and a badge on **Chores** shows how many are waiting.
- **Adjusting.** Managers can add or remove points by hand, with a note. Recent activity is shown as a ledger.
- **Household goals.** A target the whole household works toward together (up to 20). Progress is the points anyone has
  earned since the goal began, so spending on personal rewards never lowers it. A manager marks a reached goal as claimed.

Each person has a page at `/chores/<person>`, linked from their name, where they see their routine, points, rewards
and screen time, and where managers manage them.

## Screen time

A reward can add minutes to a person's **bank**. A manager can also give each person a **daily allowance**, optionally
different on weekends, from their page. The allowance returns each day and is not saved up; earned minutes are kept.

- **Spending** ("Use 15") takes the day's allowance first, then the bank, and starts a **countdown timer**. Spending more
  while one runs adds to it.
- **The timer is kept on the server.** A countdown started on an iPad also shows on the wall display and on a parent's
  phone. **Stop** gives back the whole minutes not yet used (the bank first, then the day's allowance).
- **At zero,** the person's page rings a sound they chose (chime, bell, bubbles, fanfare or gentle, generated in the
  browser). Browsers only allow sound after a tap, so tap the page once after opening it. An iPad's side switch also mutes it.
- **Locked screens.** Optional push alerts reach a closed or locked device; see [Alerts](#time-is-up-alerts).
- Lantern only keeps count. Honouring it on the device is up to the household.

## Lists

Shared lists for everyone in the household (up to 20 lists of 200 items): add, tick, remove and clear ticked items. Any
signed-in member can change them.

## Time-is-up alerts

Off until a host sets the `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` secrets and the Worker's once-a-minute schedule
([setup guide, step 8](setup-guide.md#8-optional-time-is-up-alerts-on-a-locked-ipad-or-phone)). Then a button on a
person's page signs that device up for alerts when their time is up. Alerts arrive within about a minute. On iPhone and
iPad the app must be on the Home Screen first. Each device's address must be on a known push service (Google, Apple,
Mozilla or Microsoft), and at most 100 devices are kept.

## Manager notifications

Under **Admin → Your alerts**, each manager chooses what they hear about and how:

| About | When |
|---|---|
| Reward requests | Someone asks to spend points. |
| Screen time timers | A timer is started, extended or stopped. |

Each can go by **email** (through Resend) or by **push notification** to a device the manager has allowed on that page.
Everything is off until a manager turns it on. A manager is not told about their own actions. Push needs the same VAPID
keys as time-is-up alerts.

## Admin

Managers only (`/admin`):

- **Members and invites.** Invite by email (as member or manager), re-send, revoke, change role, disable or re-enable.
  If email is not set up the page says so instead of claiming an invite was sent.
- **People.** Add, rename and remove the household's people.
- **Widgets and features.** Switch any widget, and the built-in Chores and Lists, on or off. `dashboard.config.ts` still
  decides which widgets exist; the switch only hides them (their data is kept).
- **Your alerts.** Each manager's own notification choices, as above.
- **Signed-in devices.** Everyone's, with sign-out.
- **Recent activity.** The audit log's last 50 events (kept 400 days), such as invites, role changes, sign-ins and feature switches.

## Install and offline

Lantern is a PWA. On Chrome, Edge and Android an install button appears; on iPhone and iPad use Safari, Share, **Add to Home
Screen**. From the second visit a dismissible banner offers it. Shortcuts for **Chores** and **Lists** are in the app
icon's menu.

Offline, the dashboard and widget pages saved in the last 24 hours open with a notice; private pages never do. The copy is
wiped on sign-out or revocation. [`pwa-manual-check.md`](pwa-manual-check.md) is a checklist, and
[`architecture.md`](architecture.md#the-browser-side) explains the rules.

Light and dark themes follow the device and can be toggled; the choice is per browser.

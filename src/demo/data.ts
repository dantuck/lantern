// Fixture data for /demo. Everything here is invented; nothing is fetched, stored, or tied to a real household.
// Dates are relative to "now" so the demo always looks current. The demo runs in UTC so "today" matches its clock times.
import { DAY_MS, addDays, dayKey, startOfDayMs } from '../lib/dates';
import type { CalEvent, CalendarData } from '../plugins/calendar/types';
import type { MealPlanData, Slot } from '../plugins/mealq/client';

export const DEMO_TZ = 'UTC';
export const DEMO_LOCALE = 'en-US';

// [days from today, 'HH:MM', minutes, title, location?]
const TIMED: [number, string, number, string, string?][] = [
  [-4, '17:30', 60, 'Bello! Banana taste test', 'The Kitchen'],
  [-2, '09:00', 120, 'Restock the banana supply', 'Jelly Lab Supermarket'],
  [-1, '18:00', 90, 'Family dinner', 'Gru’s Dining Room'],
  [0, '08:30', 30, 'School drop-off', 'Miss Hattie’s Academy'],
  [0, '09:15', 105, 'Lab meeting with Dr. Nefario', 'Underground Lab'],
  [0, '09:30', 60, 'Kevin’s dentist appointment', 'Dr. Pointy Teeth'],
  [0, '12:30', 45, 'Lunch with Lucy', 'Bank of Evil Café'],
  [0, '16:00', 60, 'Ballet class: Agnes', 'Little Stars Studio'],
  [0, '19:00', 90, 'Minion movie night', 'Living room'],
  [1, '18:15', 75, 'Bob’s teddy-bear practice', 'Backyard'],
  [2, '09:00', 45, 'Anti-Villain League briefing', 'AVL Headquarters'],
  [2, '17:30', 60, 'Parent-teacher conference', 'Miss Hattie’s Academy'],
  [3, '12:00', 60, 'Lunch with Mom', 'The Corner Café'],
  [4, '10:00', 120, 'Farmers market banana run'],
  [4, '19:30', 150, 'Karaoke night (Stuart on guitar)', 'Living room'],
  [5, '14:00', 120, 'Unicorn party: Agnes', 'Fluffy Castle'],
  [6, '11:00', 60, 'Swim lesson: Edith', 'Community pool'],
  [7, '18:00', 60, 'Rocket repairs', 'Garage'],
  [8, '08:00', 60, 'Fluffy’s vet visit', 'Happy Paws'],
  [9, '16:30', 45, 'Ballet class: Agnes', 'Little Stars Studio'],
  [10, '19:00', 90, 'Minion movie night', 'Living room'],
  [12, '09:30', 60, 'Haircuts (Gru, one more try)'],
  [14, '13:00', 180, 'Garden day: gnome rescue'],
  [16, '18:00', 60, 'Rocket repairs', 'Garage'],
  [19, '10:00', 90, 'Brunch with Margo’s friends', 'Aunt Lena’s'],
  [23, '17:00', 60, 'Banana-peeling contest', 'Town hall'],
  [27, '09:00', 60, 'Freeze-ray service'],
  [31, '19:00', 90, 'Minion movie night', 'Living room'],
];
// [days from today, length in days, title]
const ALL_DAY: [number, number, string][] = [
  [1, 1, 'Dr. Nefario visits'],
  [5, 1, 'Agnes’s birthday'],
  [13, 3, 'Camping trip (no volcanoes)'],
  [21, 1, 'Teacher in-service day'],
  [29, 1, 'Banana Appreciation Day'],
];

export function demoCalendar(now = Date.now()): CalendarData {
  const today = dayKey(now, DEMO_TZ);
  const events: CalEvent[] = [];
  TIMED.forEach(([off, hhmm, mins, title, location], i) => {
    const start = startOfDayMs(addDays(today, off), DEMO_TZ) + (+hhmm.slice(0, 2) * 60 + +hhmm.slice(3)) * 60_000;
    events.push({ id: `t${i}`, title, ...(location ? { location } : {}), allDay: false, start, end: start + mins * 60_000 });
  });
  ALL_DAY.forEach(([off, len, title], i) => {
    events.push({ id: `a${i}`, title, allDay: true, startDate: addDays(today, off), endDate: addDays(today, off + len - 1) });
  });
  // Like the live widget, the window starts on the 1st of the month so the month grid has its earlier days.
  const windowStart = startOfDayMs(`${today.slice(0, 8)}01`, DEMO_TZ);
  return { events, windowStart, windowEnd: now + 60 * DAY_MS };
}

const DINNERS = ['Banana pancakes', 'Taco night', 'Baked salmon & rice', 'Spaghetti (Bob’s favourite)', 'Homemade pizza', 'Chicken soup & bread', 'Grilled burgers'];
const LUNCHES = ['Banana & peanut butter sandwiches', 'Turkey wraps', 'Tomato soup & grilled cheese', 'Pasta salad', 'Quesadillas', 'Sandwich boards'];

export function demoMeals(now = Date.now(), daysAhead = 7): MealPlanData {
  const today = dayKey(now, DEMO_TZ);
  const days = Array.from({ length: daysAhead }, (_, i) => {
    const meals: MealPlanData['days'][number]['meals'] = [];
    const add = (slot: Slot, title: string, note?: string) => meals.push({ id: `${i}-${slot}`, slot, title, ...(note ? { note } : {}) });
    if (i !== 3) add('lunch', LUNCHES[i % LUNCHES.length]!);
    if (i === 5) add('dinner', 'Cake at the unicorn party', 'Eating out');
    else if (i !== 6) add('dinner', DINNERS[i % DINNERS.length]!, i === 1 ? 'Minions pick toppings' : undefined);
    if (i === 0) add('snack', 'Bananas (obviously)');
    return { date: addDays(today, i), meals };
  });
  return { from: today, to: addDays(today, daysAhead - 1), days };
}

export const demoCalendarConfig = { timeZone: DEMO_TZ, locale: DEMO_LOCALE, daysAhead: 60 };
export const demoMealsConfig = { apiHost: 'demo.invalid', timeZone: DEMO_TZ, locale: DEMO_LOCALE, daysAhead: 7 };

export const demoUsers = [
  { email: 'gru@example.com', role: 'manager', status: 'active', since: '2025-01-12' },
  { email: 'lucy@example.com', role: 'manager', status: 'active', since: '2025-01-12' },
  { email: 'margo@example.com', role: 'member', status: 'active', since: '2025-02-03' },
  { email: 'dr.nefario@example.com', role: 'member', status: 'active', since: '2025-03-21' },
  { email: 'kevin@example.com', role: 'member', status: 'disabled', since: '2025-02-03' },
];
export const demoDevices = [
  { who: 'gru@example.com', device: 'iPhone · Safari', last: 'Just now', current: true },
  { who: 'gru@example.com', device: 'Kitchen display · Chrome', last: '2 minutes ago', current: false },
  { who: 'lucy@example.com', device: 'Pixel · Chrome', last: 'Yesterday', current: false },
  { who: 'margo@example.com', device: 'iPad · Safari', last: '3 days ago', current: false },
];
export const demoAudit = [
  { when: 'Today, 8:02 AM', who: 'gru@example.com', event: 'login', detail: 'iPhone · Safari' },
  { when: 'Yesterday, 6:40 PM', who: 'lucy@example.com', event: 'invite', detail: 'dr.nefario@example.com (member)' },
  { when: 'Mon, 9:15 AM', who: 'gru@example.com', event: 'disable_user', detail: 'kevin (borrowed the iPad again)' },
  { when: 'Last week', who: 'system', event: 'login_blocked', detail: 'rate limit' },
];

// Fixture data for /demo. Everything here is invented; nothing is fetched, stored, or tied to a real household.
// Dates are relative to "now" so the demo always looks current. The demo runs in UTC so "today" matches its clock times.
import { allowanceFor, periodRecord } from '../lib/choreTypes';
import { DAY_MS, addDays, dayKey, startOfDayMs } from '../lib/dates';
import type { CalEvent, CalendarData } from '../plugins/calendar/types';
import type { WeatherData } from '../plugins/calendar/weatherView';
import { parsePeople } from '../lib/peopleConfig';
import type { Meal, MealPlanData } from '../plugins/mealq/client';
import type { Slot } from '../plugins/mealq/slots';
import { LOOKBACK_DAYS } from '../plugins/calendar/meals';

export const DEMO_TZ = 'UTC';
export const DEMO_LOCALE = 'en-US';

// [days from today, 'HH:MM', minutes, title, location?]
const TIMED: [number, string, number, string, string?][] = [
  [-4, '17:30', 60, 'Bello! Banana taste test', 'The Kitchen'],
  [-2, '09:00', 120, 'Restock the banana supply', 'Jelly Lab Supermarket'],
  [-1, '18:00', 90, 'Family dinner', 'Gru’s Dining Room'],
  [-1, '20:00', 62 * 60, 'Gru at the Villain Conference', 'Vector’s Fortress'],
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
  [3, '15:00', 116 * 60, 'Beach house vacation', 'Lake Banana Cabin'],
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
  // Meals run a week back and three weeks ahead, like the live calendar.
  const meals = demoMeals(now, 28, -LOOKBACK_DAYS).days.filter((d) => d.meals.length > 0);
  return { events, windowStart, windowEnd: now + 60 * DAY_MS, weather: demoWeather(now), meals };
}

/** The invented household. `match` words pick whose colour an event gets from its title. */
export const demoPeople = parsePeople([
  { name: 'Gru', color: '#e8590c' },
  { name: 'Lucy', color: '#ae3ec9' },
  { name: 'Margo', color: '#1c7ed6' },
  { name: 'Edith', color: '#d6336c' },
  { name: 'Agnes', color: '#2f9e44' },
  { name: 'Minions', color: '#f08c00', match: ['Minion', 'Minions', 'Kevin', 'Bob', 'Stuart'] },
]);

// [weather code, high, low] cycled across the next 16 days (°F).
const WX: [number, number, number][] = [[0, 78, 58], [2, 75, 57], [3, 70, 55], [61, 66, 52], [80, 64, 51], [1, 72, 54], [0, 80, 60], [95, 73, 59], [71, 34, 24], [45, 62, 50]];
function demoWeather(now: number): WeatherData {
  const today = dayKey(now, DEMO_TZ);
  const days: WeatherData['days'] = {};
  for (let i = 0; i < 16; i++) { const [code, hi, lo] = WX[i % WX.length]!; days[addDays(today, i)] = { code, hi, lo }; }
  return { unit: 'F', days };
}

const DINNERS = ['Banana pancakes', 'Taco night', 'Baked salmon & rice', 'Spaghetti (Bob’s favourite)', 'Homemade pizza', 'Chicken soup & bread', 'Grilled burgers'];
const LUNCHES = ['Banana & peanut butter sandwiches', 'Turkey wraps', 'Tomato soup & grilled cheese', 'Pasta salad', 'Quesadillas', 'Sandwich boards'];

const DINNER_DETAILS: Array<Partial<Meal> | undefined> = [
  { prepMinutes: 25, ingredients: ['Bananas', 'Flour', 'Eggs', 'Milk', 'Maple syrup'],
    description: 'Fluffy pancakes with mashed ripe banana folded into the batter. A reliable way to use up the bananas on the counter.',
    instructions: ['Mash two ripe bananas in a large bowl until smooth.', 'Whisk in the eggs and milk, then fold in the flour until just combined.', 'Cook ¼-cup scoops on a medium, lightly oiled pan for about 2 minutes a side.', 'Serve warm with maple syrup.'] },
  { prepMinutes: 30, ingredients: ['Tortillas', 'Ground beef', 'Cheese', 'Lettuce', 'Salsa'],
    description: 'Build-your-own tacos. Everyone picks their own toppings, which keeps the table quiet.',
    instructions: ['Brown the beef in a wide pan and drain the fat.', 'Stir in taco seasoning and a splash of water, then simmer for 5 minutes.', 'Warm the tortillas in a dry pan.', 'Set out the cheese, lettuce and salsa and let everyone build their own.'] },
  { prepMinutes: 40, ingredients: ['Salmon fillets', 'Rice', 'Lemon', 'Broccoli'],
    description: 'Oven-baked salmon with lemon, served over rice with roasted broccoli.',
    instructions: ['Heat the oven to 400°F and start the rice.', 'Place the salmon and broccoli on a lined tray. Season with salt, pepper and lemon juice.', 'Roast for 12 to 15 minutes, until the salmon flakes easily.', 'Serve over rice with lemon wedges.'] },
  { prepMinutes: 35, ingredients: ['Spaghetti', 'Tomato sauce', 'Meatballs', 'Parmesan'],
    description: 'Spaghetti and meatballs, the version that has never been refused.',
    instructions: ['Bring a large pot of salted water to a boil and cook the spaghetti.', 'Warm the meatballs in the tomato sauce over low heat.', 'Drain the pasta, toss it with a ladle of sauce and top with the meatballs.', 'Finish with grated Parmesan.'] },
  { prepMinutes: 45, ingredients: ['Pizza dough', 'Tomato sauce', 'Cheese', 'Pepperoni'], recipeUrl: 'https://example.com/pizza',
    description: 'Homemade pizza on a hot tray. Let the dough rest while the oven heats.',
    instructions: ['Heat the oven to 475°F with a baking tray inside.', 'Stretch the dough on floured parchment and spread over the tomato sauce.', 'Add cheese and pepperoni.', 'Slide onto the hot tray and bake for 10 to 12 minutes, until the crust is golden.'] },
  { prepMinutes: 50, ingredients: ['Chicken', 'Carrots', 'Celery', 'Bread'],
    description: 'A big pot of chicken soup that makes tomorrow’s lunch too.',
    instructions: ['Simmer the chicken in water with a pinch of salt for 25 minutes.', 'Lift out the chicken, shred it and return it to the pot.', 'Add sliced carrots and celery and cook for 15 minutes.', 'Serve with bread.'] },
];

export function demoMeals(now = Date.now(), daysAhead = 7, startOffset = 0): MealPlanData {
  const today = dayKey(now, DEMO_TZ);
  const days = Array.from({ length: daysAhead }, (_, n) => {
    const i = n + startOffset;
    const k = ((i % 7) + 7) % 7; // the weekly pattern repeats
    const meals: MealPlanData['days'][number]['meals'] = [];
    const add = (slot: Slot, title: string, note?: string, extra: Partial<Meal> = {}) =>
      meals.push({ id: `${i}-${slot}`, slot, title, ...(note ? { note } : {}), ...extra });
    if (k !== 3) add('lunch', LUNCHES[k % LUNCHES.length]!);
    if (k === 5) add('dinner', 'Cake at the unicorn party', 'Eating out');
    else if (k !== 6) add('dinner', DINNERS[k % DINNERS.length]!, k === 1 ? 'Minions pick toppings' : undefined, DINNER_DETAILS[k % DINNERS.length]);
    if (i === 0) add('snack', 'Bananas (obviously)');
    return { date: addDays(today, i), meals };
  });
  return { from: addDays(today, startOffset), to: addDays(today, startOffset + daysAhead - 1), days };
}

export const demoCalendarConfig = { timeZone: DEMO_TZ, locale: DEMO_LOCALE, daysAhead: 60, feeds: [], meals: { slots: ['dinner' as const] } };
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

// --- Chores and lists -------------------------------------------------------

type Period = 'morning' | 'afternoon' | 'evening' | 'any';
/** [person id or null, all-done bonus per time of day, [chore, points, time of day, ticked already][]] */
const ROUTINES: [string | null, Partial<Record<Period, number>>, [string, number, Period, boolean][]][] = [
  ['agnes', { morning: 3, afternoon: 2 }, [['Make your bed', 1, 'morning', true], ['Brush teeth', 1, 'morning', true], ['Feed Fluffy', 2, 'morning', false], ['Pack your school bag', 1, 'morning', false], ['Ballet bag by the door', 2, 'afternoon', false]]],
  ['margo', { afternoon: 5 }, [['Walk the dog', 2, 'afternoon', true], ['Homework', 3, 'afternoon', false], ['Empty the dishwasher', 2, 'afternoon', false]]],
  ['edith', { morning: 3 }, [['Tidy the lab bench', 2, 'morning', false], ['Feed the goldfish', 1, 'morning', false]]],
  ['gru', {}, [['Take out the trash', 1, 'evening', false], ['Rocket repairs', 1, 'evening', false]]],
  ['minions', { any: 4 }, [['Peel the bananas', 1, 'any', true], ['Sweep the lair', 1, 'any', false]]],
  [null, {}, [['Water the plants', 0, 'any', false]]],
];

export function demoChores(now = Date.now()): import('../lib/choreTypes').ChoreState {
  const day = dayKey(now, DEMO_TZ);
  const routines = ROUTINES.map(([person, bonus, chores], ri) => {
    const items = chores.map(([title, points, period, done], i) => ({ id: `c${ri}-${i}`, title, points, done, period, days: null, onceDate: null, due: true }));
    const bonuses = { ...periodRecord(0), ...bonus };
    const earned = (p: Period) => bonuses[p] > 0 && items.some((i) => i.period === p) && items.filter((i) => i.period === p).every((i) => i.done);
    return { id: `r${ri}`, person, bonuses, bonusEarned: { morning: earned('morning'), afternoon: earned('afternoon'), evening: earned('evening'), any: earned('any') }, items };
  });
  const balances: Record<string, number> = { agnes: 14, margo: 31, edith: 8, gru: 3, minions: 22 };
  for (const r of routines) if (r.person) for (const i of r.items) if (i.done) balances[r.person] = (balances[r.person] ?? 0) + i.points;
  return {
    day, manager: true, routines, balances, minutes: { agnes: 45, margo: 20, minions: 15 },
    allowance: {
      agnes: { weekday: 60, weekend: 90, today: allowanceFor(day, 60, 90), used: 20 },
      margo: { weekday: 45, weekend: null, today: 45, used: 0 },
    },
    rewards: [
      { id: 'r1', name: 'Pick the movie', cost: 10, minutes: 0, people: null, hidden: false },
      { id: 'r2', name: 'Extra screen time', cost: 20, minutes: 30, people: null, hidden: false },
      { id: 'r4', name: 'New ballet shoes', cost: 30, minutes: 0, people: ['agnes'], hidden: false }, // only Agnes sees it
      { id: 'r3', name: 'Ice cream trip', cost: 40, minutes: 0, people: null, hidden: false },
    ],
    goals: [
      { id: 'g1', name: 'Family movie night out', target: 150, progress: 96, claimed: false },
      { id: 'g2', name: 'Pizza Friday', target: 60, progress: 60, claimed: false },
    ],
    pending: [{ id: 'req1', person: 'margo', rewardName: 'Extra screen time', cost: 20, minutes: 30, requestedAt: now - 20 * 60_000 }],
    recent: [
      { id: 'e1', person: 'margo', delta: 2, kind: 'chore', note: 'Walk the dog', at: now - 60 * 60_000 },
      { id: 'e2', person: 'minions', delta: 1, kind: 'chore', note: 'Peel the bananas', at: now - 2 * 60 * 60_000 },
      { id: 'e3', person: 'agnes', delta: 5, kind: 'adjust', note: 'Helped with the groceries', at: now - 26 * 60 * 60_000 },
    ],
  };
}

export function demoLists(): import('../lib/lists').HList[] {
  const items = (...t: [string, boolean?][]) => t.map(([text, done], i) => ({ id: `i${i}-${text}`, text, done: !!done }));
  return [
    { id: 'groceries', name: 'Groceries', items: items(['Bananas (lots)'], ['Milk'], ['Pancake mix'], ['Dog food', true], ['Unicorn sprinkles']) },
    { id: 'todo', name: 'Home to-dos', items: items(['Fix the freeze ray'], ['Book the vet'], ['Return library books', true]) },
    { id: 'wishes', name: 'Wish list', items: items(['Bigger rocket'], ['A pet unicorn'], ['Matching pajamas']) },
  ];
}

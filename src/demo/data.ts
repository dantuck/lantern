// Fixture data for /demo. Everything here is invented; nothing is fetched, stored, or tied to a real household.
// Dates are relative to "now" so the demo always looks current. The demo runs in UTC so "today" matches its clock times.
import { allowanceFor, DEFAULT_HOURS, required, itemDue, PERIOD_LABEL, periodRecord, WEEKDAYS_MASK, WEEKENDS_MASK } from '../lib/choreTypes';
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
  [-6, '10:00', 90, 'Soccer practice: Margo', 'Community field'],
  [-3, '15:30', 60, 'Piano lesson: Edith', 'Music Corner'],
  [-1, '07:45', 30, 'Carpool to school', 'Front driveway'],
  [0, '07:30', 30, 'Banana breakfast', 'The Kitchen'],
  [0, '17:30', 45, 'Soccer practice: Margo', 'Community field'],
  [1, '08:30', 30, 'School drop-off', 'Miss Hattie’s Academy'],
  [1, '10:30', 60, 'Minion training session', 'Underground Lab'],
  [1, '16:00', 60, 'Piano lesson: Edith', 'Music Corner'],
  [2, '12:15', 45, 'Lunch with Dr. Nefario', 'Bank of Evil Café'],
  [2, '19:00', 60, 'Book club: Lucy', 'Aunt Lena’s'],
  [3, '08:30', 30, 'School drop-off', 'Miss Hattie’s Academy'],
  [4, '14:30', 60, 'Science fair prep: Margo', 'Garage'],
  [5, '10:00', 120, 'Cleaning the lair', 'Underground Lab'],
  [5, '18:30', 90, 'Birthday dinner: Agnes', 'Fluffy Castle'],
  [6, '15:00', 90, 'Playdate at the park', 'Central Park'],
  [7, '08:30', 30, 'School drop-off', 'Miss Hattie’s Academy'],
  [8, '17:30', 45, 'Soccer practice: Margo', 'Community field'],
  [9, '13:00', 60, 'Gadget show-and-tell', 'Underground Lab'],
  [11, '10:30', 60, 'Dentist: Edith', 'Dr. Pointy Teeth'],
  [13, '09:00', 60, 'Camping gear check', 'Garage'],
  [15, '11:00', 120, 'Gru’s mom’s visit', 'Living room'],
  [17, '16:30', 45, 'Ballet recital rehearsal: Agnes', 'Little Stars Studio'],
  [20, '18:00', 120, 'Ballet recital: Agnes', 'Little Stars Studio'],
  [25, '12:00', 90, 'Family picnic', 'Lake Banana Park'],
  [29, '10:00', 60, 'Parent volunteer morning', 'Miss Hattie’s Academy'],
];
// [days from today, length in days, title]
const ALL_DAY: [number, number, string][] = [
  [1, 1, 'Dr. Nefario visits'],
  [5, 1, 'Agnes’s birthday'],
  [13, 3, 'Camping trip (no volcanoes)'],
  [21, 1, 'Teacher in-service day'],
  [29, 1, 'Banana Appreciation Day'],
  [8, 2, 'Science fair'],
  [17, 1, 'Picture day'],
  [25, 1, 'Minion field trip'],
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
  { email: 'edith@example.com', role: 'member', status: 'active', since: '2025-04-10' },
  { email: 'agnes@example.com', role: 'member', status: 'active', since: '2025-04-10' },
];
export const demoDevices = [
  { who: 'gru@example.com', device: 'iPhone · Safari', last: 'Just now', current: true },
  { who: 'gru@example.com', device: 'Kitchen display · Chrome', last: '2 minutes ago', current: false },
  { who: 'lucy@example.com', device: 'Pixel · Chrome', last: 'Yesterday', current: false },
  { who: 'margo@example.com', device: 'iPad · Safari', last: '3 days ago', current: false },
  { who: 'edith@example.com', device: 'Kids’ tablet · Chrome', last: '5 hours ago', current: false },
  { who: 'lucy@example.com', device: 'Laptop · Firefox', last: 'Last week', current: false },
];
export const demoAudit = [
  { when: 'Today, 8:02 AM', who: 'gru@example.com', event: 'login', detail: 'iPhone · Safari' },
  { when: 'Yesterday, 6:40 PM', who: 'lucy@example.com', event: 'invite', detail: 'dr.nefario@example.com (member)' },
  { when: 'Mon, 9:15 AM', who: 'gru@example.com', event: 'disable_user', detail: 'kevin (borrowed the iPad again)' },
  { when: 'Last week', who: 'system', event: 'login_blocked', detail: 'rate limit' },
  { when: 'Sun, 7:30 PM', who: 'lucy@example.com', event: 'invite', detail: 'edith@example.com (member)' },
  { when: 'Sat, 10:12 AM', who: 'gru@example.com', event: 'login', detail: 'Kitchen display · Chrome' },
  { when: 'Last week', who: 'lucy@example.com', event: 'login', detail: 'Laptop · Firefox' },
];

// --- Chores and lists -------------------------------------------------------

type Period = 'morning' | 'afternoon' | 'evening' | 'any';
/** [person id or null, all-done bonus per time of day, [chore, points, time of day, ticked already][]] */
/** A chore that is not every day: weekdays to repeat on, and (for "until done") the points paid on each remaining day. */
type ChoreOpts = { days?: number; kept?: number; optional?: true };
const ROUTINES: [string | null, Partial<Record<Period, number>>, [string, number, Period, boolean, ChoreOpts?][]][] = [
  ['agnes', { morning: 3, afternoon: 2, evening: 2 }, [['Make your bed', 1, 'morning', true], ['Brush teeth', 1, 'morning', true], ['Feed Fluffy', 2, 'morning', true], ['Pack your school bag', 1, 'morning', false], ['Pack a lunch box (only some days)', 2, 'morning', false, { optional: true }], ['Ballet bag by the door', 2, 'afternoon', false, { days: WEEKDAYS_MASK }], ['Practice ballet steps', 2, 'afternoon', false, { days: 0b0101010 }], ['Tidy the toy corner', 1, 'evening', false], ['Pick out tomorrow’s outfit', 1, 'evening', false], ['Bath time', 1, 'evening', false]]],
  ['margo', { afternoon: 5, evening: 3 }, [['Walk the dog', 2, 'afternoon', true], ['Homework', 3, 'afternoon', false, { days: WEEKDAYS_MASK }], ['Finish science fair poster', 10, 'afternoon', false, { days: WEEKDAYS_MASK, kept: 2 }], ['Empty the dishwasher', 2, 'afternoon', false], ['Set the table', 1, 'evening', false], ['Practice soccer drills', 2, 'evening', false, { days: 0b0101010 }], ['Take out the recycling', 2, 'evening', false, { days: 0b0010000 }]]],
  ['edith', { morning: 3, evening: 2 }, [['Tidy the lab bench', 2, 'morning', false], ['Feed the goldfish', 1, 'morning', false], ['Make your bed', 1, 'morning', true], ['Pack a lunch box (only some days)', 2, 'morning', true, { optional: true }], ['Piano practice', 2, 'evening', false, { days: WEEKDAYS_MASK }], ['Put dirty clothes in the hamper', 1, 'evening', false], ['Clean your room', 3, 'evening', false, { days: WEEKENDS_MASK }]]],
  ['gru', { evening: 2 }, [['Take out the trash', 1, 'evening', false], ['Rocket repairs', 1, 'evening', false], ['Wash the dishes', 2, 'evening', false], ['Mow the lawn', 3, 'afternoon', false, { days: WEEKENDS_MASK }], ['Check the freeze ray', 1, 'morning', true, { days: 0b0000010 }]]],
  ['lucy', { morning: 2 }, [['Pack lunches', 2, 'morning', true], ['Water the herb garden', 1, 'morning', false], ['Sort the mail', 1, 'evening', false], ['Laundry', 2, 'afternoon', false, { days: 0b0100100 }]]],
  ['minions', { any: 4 }, [['Peel the bananas', 1, 'any', true], ['Sweep the lair', 1, 'any', false], ['Polish the gadgets', 2, 'any', false], ['Feed the fish tank', 1, 'any', false]]],
  [null, {}, [['Water the plants', 0, 'any', false], ['Wipe down the counters', 0, 'any', false]]],
];

export function demoChores(now = Date.now()): import('../lib/choreTypes').ChoreState {
  const day = dayKey(now, DEMO_TZ);
  const routines = ROUTINES.map(([person, bonus, chores], ri) => {
    const items = chores.map(([title, points, period, done, opts], i) => {
      const days = opts?.days ?? null;
      const due = itemDue({ days, onceDate: null }, day);
      return { id: `c${ri}-${i}`, title, points, done: done && due, period, days, onceDate: null, everyWeeks: 1, weekAnchor: null, untilDone: opts?.kept !== undefined, keptPoints: opts?.kept ?? 0, optional: opts?.optional === true, due, kept: false, skipped: false };
    });
    const bonuses = { ...periodRecord(0), ...bonus };
    const earned = (p: Period) => { const need = items.filter((i) => i.due && i.period === p && required(i)); return bonuses[p] > 0 && need.length > 0 && need.every((i) => i.done); };
    return { id: `r${ri}`, person, bonuses, bonusEarned: { morning: earned('morning'), afternoon: earned('afternoon'), evening: earned('evening'), any: earned('any') }, items };
  });
  const balances: Record<string, number> = { agnes: 12, margo: 31, edith: 8, gru: 3, lucy: 17, minions: 22 };
  for (const r of routines) if (r.person) for (const i of r.items) if (i.done) balances[r.person] = (balances[r.person] ?? 0) + i.points;
  return {
    day, manager: true, periodLabels: { ...PERIOD_LABEL }, periodHours: { ...DEFAULT_HOURS }, dayMs: (7 * 60 + 40) * 60_000, // the demo's morning, so "Morning" is open and the rest are not yet
     routines, balances, minutes: { agnes: 45, margo: 20, edith: 10, minions: 15 }, now, timers: {}, sounds: { agnes: 'bubbles' },
    allowance: {
      agnes: { weekday: 60, weekend: 90, today: allowanceFor(day, 60, 90), used: 20 },
      margo: { weekday: 45, weekend: null, today: 45, used: 0 },
      edith: { weekday: 30, weekend: 60, today: allowanceFor(day, 30, 60), used: 10 },
    },
    buyCap: { margo: { limit: 60, bought: 10 } }, // Margo has already bought 10 minutes today, so 50 are left
    rewards: [
      { id: 'r1', name: 'Pick the movie', cost: 10, minutes: 0, people: null, hidden: false },
      { id: 'r2', name: 'Screen time (5 minutes)', cost: 2, minutes: 5, people: null, hidden: false }, // take it several times: ×10 is 20 points for 50 minutes
      { id: 'r4', name: 'New ballet shoes', cost: 30, minutes: 0, people: ['agnes'], hidden: false }, // only Agnes sees it
      { id: 'r3', name: 'Ice cream trip', cost: 40, minutes: 0, people: null, hidden: false },
      { id: 'r5', name: 'Stay up 30 minutes late', cost: 15, minutes: 0, people: null, hidden: false },
      { id: 'r6', name: 'Choose dinner', cost: 25, minutes: 0, people: null, hidden: false },
      { id: 'r8', name: 'Friend sleepover', cost: 60, minutes: 0, people: ['margo', 'edith'], hidden: false },
      { id: 'r9', name: 'Skip one chore', cost: 35, minutes: 0, people: null, hidden: true }, // paused by a manager
    ],
    goals: [
      { id: 'g1', name: 'Family movie night out', target: 150, progress: 96, claimed: false },
      { id: 'g2', name: 'Pizza Friday', target: 60, progress: 60, claimed: false },
      { id: 'g3', name: 'New trampoline', target: 400, progress: 132, claimed: false },
      { id: 'g4', name: 'Beach house snacks', target: 80, progress: 80, claimed: true },
    ],
    pending: [
      { id: 'req1', person: 'margo', rewardName: 'Pick the movie', cost: 10, minutes: 0, requestedAt: now - 20 * 60_000 },
      { id: 'req2', person: 'edith', rewardName: 'Choose dinner', cost: 25, minutes: 0, requestedAt: now - 3 * 60 * 60_000 },
    ],
    recent: [
      { id: 'e1', person: 'margo', delta: 2, kind: 'chore', note: 'Walk the dog', at: now - 60 * 60_000 },
      { id: 'e2', person: 'minions', delta: 1, kind: 'chore', note: 'Peel the bananas', at: now - 2 * 60 * 60_000 },
      { id: 'e3', person: 'agnes', delta: 5, kind: 'adjust', note: 'Helped with the groceries', at: now - 26 * 60 * 60_000 },
      { id: 'e4', person: 'lucy', delta: 2, kind: 'chore', note: 'Pack lunches', at: now - 3 * 60 * 60_000 },
      { id: 'e5', person: 'agnes', delta: 3, kind: 'bonus', note: 'All done', at: now - 5 * 60 * 60_000 },
      { id: 'e6', person: 'margo', delta: -15, kind: 'redeem', note: 'Stay up 30 minutes late', at: now - 28 * 60 * 60_000 },
      { id: 'e7', person: 'edith', delta: 2, kind: 'chore', note: 'Make your bed', at: now - 30 * 60 * 60_000 },
      { id: 'e8', person: 'gru', delta: -2, kind: 'adjust', note: 'Left the freeze ray on', at: now - 48 * 60 * 60_000 },
    ],
  };
}

export function demoLists(): import('../lib/lists').HList[] {
  const items = (...t: [string, boolean?][]) => t.map(([text, done], i) => ({ id: `i${i}-${text}`, text, done: !!done }));
  return [
    { id: 'groceries', name: 'Groceries', items: items(['Bananas (lots)'], ['Milk'], ['Pancake mix'], ['Dog food', true], ['Unicorn sprinkles'], ['Bread'], ['Eggs'], ['Peanut butter', true], ['Apples']) },
    { id: 'todo', name: 'Home to-dos', items: items(['Fix the freeze ray'], ['Book the vet'], ['Return library books', true], ['Replace the garage light'], ['Order new minion goggles'], ['Fix the squeaky stair']) },
    { id: 'wishes', name: 'Wish list', items: items(['Bigger rocket'], ['A pet unicorn'], ['Matching pajamas'], ['Trampoline'], ['Disco ball for the lab']) },
    { id: 'packing', name: 'Beach house packing', items: items(['Swimsuits'], ['Sunscreen'], ['Banana-shaped floaties'], ['Board games', true], ['Phone chargers'], ['Fluffy’s travel bed']) },
    { id: 'school', name: 'School supplies', items: items(['Glue sticks (lots)'], ['Colored pencils', true], ['Science fair poster board'], ['New backpack for Agnes'], ['Ballet tights', true]) },
  ];
}

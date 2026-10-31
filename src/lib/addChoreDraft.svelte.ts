// What the two "add a chore" forms (the drawer's and the quick add under each time of day) share:
// the last points, time of day and days used (remembered in this browser) and the schedule being filled in.
import { EVERY_DAY, normalizeDays, PERIODS, WEEKDAYS_MASK, WEEKENDS_MASK, weekStart, type Period } from './choreTypes';

const KEY = 'lantern:add-chore';

let cached: ReturnType<typeof readAddDefaults> | undefined; // every quick-add form reads these on mount; parse them once until something is saved

/** The remembered defaults, with `raw` as storage held it so a form can tell its own later writes from what it loaded. Missing or bad data gives no defaults. */
export function readAddDefaults(): { raw: string | null; points?: number; period?: Period; days?: number } {
  return (cached ??= parseAddDefaults());
}

function parseAddDefaults(): ReturnType<typeof readAddDefaults> {
  try {
    const raw = localStorage.getItem(KEY);
    const v = JSON.parse(raw ?? 'null');
    const out: ReturnType<typeof readAddDefaults> = { raw };
    if (v && Number.isFinite(v.points)) out.points = Math.min(100, Math.max(0, v.points));
    if (v && PERIODS.includes(v.period)) out.period = v.period;
    // Only the repeating days are remembered, never "just once".
    if (v && Number.isInteger(v.days) && v.days >= 1 && v.days <= EVERY_DAY) out.days = v.days;
    else if (v && v.when === 'weekdays') out.days = WEEKDAYS_MASK; // an older save
    else if (v && v.when === 'weekends') out.days = WEEKENDS_MASK;
    return out;
  } catch { return { raw: null }; /* private window or bad data: the usual defaults */ }
}

export function writeAddDefaults(value: string): void {
  cached = undefined;
  try { localStorage.setItem(KEY, value); } catch { /* not saved; nothing breaks */ }
}

/** The schedule of a chore being added, in the shape the schedule fields bind to. */
export class ScheduleDraft {
  once = $state(false);
  days = $state(EVERY_DAY);
  every = $state(1);
  untilDone = $state(false);
  kept = $state(0);
  optional = $state(false);
  from = $state('');
  date = $state('');

  constructor(day: string) {
    this.from = weekStart(day);
    this.date = day;
  }

  /** Back to a plain weekly repeat on every day. */
  resetRepeat() {
    this.days = EVERY_DAY;
    this.every = 1;
    this.untilDone = false;
    this.kept = 0;
  }

  /** The schedule as the server takes it. */
  get schedule() {
    return this.once
      ? { days: null, onceDate: this.date }
      : { days: normalizeDays(this.days), onceDate: null, everyWeeks: this.every, weekAnchor: this.every > 1 ? this.from : null, untilDone: this.untilDone, keptPoints: this.kept };
  }
}

import { DEFAULT_HOURS, HOURS_PERIODS, type Period, type PeriodHours } from './choreTypes';

/** When each time of day runs: a manager's hours, or the built-in ones. */
export async function loadHours(db: D1Database): Promise<PeriodHours> {
  const { results } = await db.prepare('SELECT period, from_min, to_min FROM period_hours').all<{ period: Period; from_min: number; to_min: number }>();
  const hours: PeriodHours = { ...DEFAULT_HOURS };
  for (const r of results) if (HOURS_PERIODS.includes(r.period)) hours[r.period] = { from: r.from_min, to: r.to_min };
  return hours;
}

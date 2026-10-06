// Browser-safe weather types and wording (no zod, no network addresses): the calendar view imports this.

export interface DayWeather { code: number; hi: number; lo: number }
export interface WeatherData { unit: 'F' | 'C'; days: Record<string, DayWeather> }

/** Feather icon (src/lib/icons.ts) and a plain-words label for a WMO weather code. */
export function describeWeather(code: number): { icon: string; label: string } {
  if (code <= 1) return { icon: 'sun', label: code === 0 ? 'Clear' : 'Mostly clear' };
  if (code <= 3) return { icon: 'cloud', label: code === 2 ? 'Partly cloudy' : 'Overcast' };
  if (code === 45 || code === 48) return { icon: 'cloud', label: 'Fog' };
  if (code >= 51 && code <= 57) return { icon: 'cloud-drizzle', label: 'Drizzle' };
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return { icon: 'cloud-rain', label: 'Rain' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { icon: 'cloud-snow', label: 'Snow' };
  if (code >= 95) return { icon: 'cloud-lightning', label: 'Thunderstorm' };
  return { icon: 'cloud', label: 'Cloudy' };
}

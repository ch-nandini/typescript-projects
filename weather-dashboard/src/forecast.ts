// Pure helpers for turning API data into display data. No DOM, so it's testable in Node.

export interface Condition {
  label: string;
  icon: string;
}

// WMO weather interpretation codes used by Open-Meteo.
const CODES: Record<number, Condition> = {
  0: { label: "Clear sky", icon: "☀️" },
  1: { label: "Mostly clear", icon: "🌤️" },
  2: { label: "Partly cloudy", icon: "⛅" },
  3: { label: "Overcast", icon: "☁️" },
  45: { label: "Fog", icon: "🌫️" },
  48: { label: "Freezing fog", icon: "🌫️" },
  51: { label: "Light drizzle", icon: "🌦️" },
  53: { label: "Drizzle", icon: "🌦️" },
  55: { label: "Heavy drizzle", icon: "🌧️" },
  56: { label: "Freezing drizzle", icon: "🌧️" },
  57: { label: "Freezing drizzle", icon: "🌧️" },
  61: { label: "Light rain", icon: "🌦️" },
  63: { label: "Rain", icon: "🌧️" },
  65: { label: "Heavy rain", icon: "🌧️" },
  66: { label: "Freezing rain", icon: "🌧️" },
  67: { label: "Freezing rain", icon: "🌧️" },
  71: { label: "Light snow", icon: "🌨️" },
  73: { label: "Snow", icon: "🌨️" },
  75: { label: "Heavy snow", icon: "❄️" },
  77: { label: "Snow grains", icon: "🌨️" },
  80: { label: "Light showers", icon: "🌦️" },
  81: { label: "Showers", icon: "🌧️" },
  82: { label: "Violent showers", icon: "⛈️" },
  85: { label: "Snow showers", icon: "🌨️" },
  86: { label: "Heavy snow showers", icon: "❄️" },
  95: { label: "Thunderstorm", icon: "⛈️" },
  96: { label: "Thunderstorm with hail", icon: "⛈️" },
  99: { label: "Severe thunderstorm", icon: "⛈️" },
};

export function describe(code: number, isDay = true): Condition {
  const condition = CODES[code] ?? { label: "Unknown", icon: "❓" };
  if (!isDay && (code === 0 || code === 1)) return { ...condition, icon: "🌙" };
  return condition;
}

export interface HourSlot {
  time: string;
  temp: number;
  code: number;
  rainChance: number | null;
}

/**
 * Picks the next `count` hours starting at the hour that contains `nowISO`.
 * Open-Meteo returns local times without an offset (e.g. "2026-10-28T14:00"),
 * so string comparison works because every value has the same format.
 */
export function nextHours(
  hourly: { time: string[]; temperature_2m: number[]; weather_code: number[]; precipitation_probability: (number | null)[] },
  nowISO: string,
  count = 24,
): HourSlot[] {
  const currentHour = `${nowISO.slice(0, 13)}:00`;
  let start = hourly.time.findIndex((t) => t >= currentHour);
  if (start === -1) start = 0;

  return hourly.time.slice(start, start + count).map((time, i) => ({
    time,
    temp: hourly.temperature_2m[start + i] ?? NaN,
    code: hourly.weather_code[start + i] ?? -1,
    rainChance: hourly.precipitation_probability[start + i] ?? null,
  }));
}

/** Where today's min/max sits within the week's overall range, as 0..1 percentages for the range bar. */
export function rangeBar(min: number, max: number, weekMin: number, weekMax: number): { left: number; width: number } {
  const span = weekMax - weekMin || 1;
  const left = (min - weekMin) / span;
  const width = (max - min) / span;
  return { left: Math.max(0, left), width: Math.max(0.04, width) };
}

export const placeLabel = (p: { name: string; admin1?: string; country?: string }): string =>
  [p.name, p.admin1, p.country].filter((part, i, all) => part && all.indexOf(part) === i).join(", ");

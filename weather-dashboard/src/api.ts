// Typed client for the free Open-Meteo APIs (no API key needed).
// Docs: https://open-meteo.com/en/docs

export type Units = "metric" | "imperial";

export interface Place {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string; // state / region
}

export interface Forecast {
  timezone: string;
  current: {
    time: string;
    temperature_2m: number;
    apparent_temperature: number;
    relative_humidity_2m: number;
    wind_speed_10m: number;
    weather_code: number;
    is_day: 0 | 1;
  };
  hourly: {
    time: string[];
    temperature_2m: number[];
    weather_code: number[];
    precipitation_probability: (number | null)[];
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: (number | null)[];
    sunrise: string[];
    sunset: string[];
  };
}

export class ApiError extends Error {}

async function getJSON<T>(url: URL, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, signal ? { signal } : {});
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError("Network error. Check your connection.");
  }
  if (!response.ok) throw new ApiError(`Weather service returned ${response.status}.`);
  return (await response.json()) as T;
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<Place[]> {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({ name: query, count: "6", language: "en", format: "json" }).toString();
  const data = await getJSON<{ results?: Place[] }>(url, signal);
  return data.results ?? [];
}

export async function getForecast(place: Place, units: Units, signal?: AbortSignal): Promise<Forecast> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.search = new URLSearchParams({
    latitude: String(place.latitude),
    longitude: String(place.longitude),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day",
    hourly: "temperature_2m,weather_code,precipitation_probability",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
    timezone: "auto",
    forecast_days: "7",
    temperature_unit: units === "imperial" ? "fahrenheit" : "celsius",
    wind_speed_unit: units === "imperial" ? "mph" : "kmh",
  }).toString();
  return getJSON<Forecast>(url, signal);
}

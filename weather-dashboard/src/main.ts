import { ApiError, getForecast, searchPlaces, type Forecast, type Place, type Units } from "./api.js";
import { describe, nextHours, placeLabel, rangeBar } from "./forecast.js";

const RECENT_KEY = "weather:recent";
const UNITS_KEY = "weather:units";
const MAX_RECENT = 5;
const STARTERS: Place[] = [
  { id: 5809844, name: "Seattle", latitude: 47.60621, longitude: -122.33207, country: "United States", admin1: "Washington" },
  { id: 2643743, name: "London", latitude: 51.50853, longitude: -0.12574, country: "United Kingdom", admin1: "England" },
  { id: 1850147, name: "Tokyo", latitude: 35.6895, longitude: 139.69171, country: "Japan", admin1: "Tokyo" },
  { id: 1269843, name: "Hyderabad", latitude: 17.38405, longitude: 78.45636, country: "India", admin1: "Telangana" },
];

const $ = <T extends HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
};

const searchInput = $<HTMLInputElement>("#search");
const suggestions = $<HTMLUListElement>("#suggestions");
const locateBtn = $<HTMLButtonElement>("#locate");
const unitButtons = document.querySelectorAll<HTMLButtonElement>("[data-units]");
const recentEl = $<HTMLDivElement>("#recent");
const statusEl = $<HTMLDivElement>("#status");
const content = $<HTMLDivElement>("#content");

// ---------- storage ----------
function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

// ---------- state ----------
let units: Units = readJSON<Units>(UNITS_KEY, "imperial");
let recent: Place[] = readJSON<Place[]>(RECENT_KEY, []);
let current: Place | null = null;
let suggestionList: Place[] = [];
let activeSuggestion = -1;
let searchController: AbortController | null = null;
let forecastController: AbortController | null = null;

// ---------- helpers ----------
const fmtHour = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric" });
const fmtTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const fmtDay = (iso: string, index: number): string =>
  index === 0 ? "Today" : new Date(`${iso}T00:00`).toLocaleDateString(undefined, { weekday: "short" });
const deg = (n: number): string => `${Math.round(n)}°`;
const speedUnit = (): string => (units === "imperial" ? "mph" : "km/h");

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: number | undefined;
  return (...args: A) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), ms);
  };
}

function setStatus(kind: "loading" | "error" | "idle", message = ""): void {
  statusEl.dataset.kind = kind;
  statusEl.textContent = message;
  statusEl.hidden = kind === "idle";
}

// ---------- search ----------
function renderSuggestions(): void {
  suggestions.replaceChildren(
    ...suggestionList.map((place, i) => {
      const li = el("li", i === activeSuggestion ? "active" : "", placeLabel(place));
      li.id = `suggestion-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", String(i === activeSuggestion));
      li.addEventListener("mousedown", (e) => {
        e.preventDefault(); // keep focus so blur doesn't close the list first
        choose(place);
      });
      return li;
    }),
  );
  const open = suggestionList.length > 0;
  suggestions.hidden = !open;
  searchInput.setAttribute("aria-expanded", String(open));
  if (activeSuggestion >= 0) searchInput.setAttribute("aria-activedescendant", `suggestion-${activeSuggestion}`);
  else searchInput.removeAttribute("aria-activedescendant");
}

const runSearch = debounce(async (query: string) => {
  searchController?.abort();
  if (query.trim().length < 2) {
    suggestionList = [];
    renderSuggestions();
    return;
  }
  searchController = new AbortController();
  try {
    suggestionList = await searchPlaces(query.trim(), searchController.signal);
    activeSuggestion = suggestionList.length ? 0 : -1;
    renderSuggestions();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    suggestionList = [];
    renderSuggestions();
  }
}, 250);

function choose(place: Place): void {
  searchInput.value = "";
  suggestionList = [];
  activeSuggestion = -1;
  renderSuggestions();
  searchInput.blur();
  void load(place);
}

searchInput.addEventListener("input", () => runSearch(searchInput.value));
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    if (!suggestionList.length) return;
    e.preventDefault();
    const step = e.key === "ArrowDown" ? 1 : -1;
    activeSuggestion = (activeSuggestion + step + suggestionList.length) % suggestionList.length;
    renderSuggestions();
  } else if (e.key === "Enter") {
    const pick = suggestionList[activeSuggestion];
    if (pick) choose(pick);
  } else if (e.key === "Escape") {
    suggestionList = [];
    renderSuggestions();
  }
});
searchInput.addEventListener("blur", () => {
  suggestionList = [];
  renderSuggestions();
});

// ---------- recent places ----------
function renderRecent(): void {
  const places = recent.length ? recent : STARTERS;
  const label = el("span", "recent__label", recent.length ? "Recent" : "Try");
  recentEl.replaceChildren(
    label,
    ...places.map((place) => {
      const btn = el("button", "chip", place.name);
      btn.type = "button";
      btn.title = placeLabel(place);
      btn.addEventListener("click", () => void load(place));
      return btn;
    }),
  );
}

function remember(place: Place): void {
  if (place.id < 0) return; // don't store "My location"
  recent = [place, ...recent.filter((p) => p.id !== place.id)].slice(0, MAX_RECENT);
  writeJSON(RECENT_KEY, recent);
  renderRecent();
}

// ---------- forecast ----------
async function load(place: Place): Promise<void> {
  current = place;
  forecastController?.abort();
  forecastController = new AbortController();
  setStatus("loading", `Loading weather for ${place.name}…`);
  content.setAttribute("aria-busy", "true");

  try {
    const data = await getForecast(place, units, forecastController.signal);
    renderForecast(place, data);
    remember(place);
    setStatus("idle");
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return;
    setStatus("error", err instanceof ApiError ? err.message : "Something went wrong loading the forecast.");
  } finally {
    content.removeAttribute("aria-busy");
  }
}

function renderForecast(place: Place, f: Forecast): void {
  const now = f.current;
  const condition = describe(now.weather_code, now.is_day === 1);

  // Current conditions
  const hero = el("section", "hero panel");
  const left = el("div", "hero__main");
  left.append(
    el("h2", "hero__place", placeLabel(place)),
    el("p", "hero__time", `Updated ${fmtTime(now.time)} local time`),
  );
  const tempRow = el("div", "hero__temp");
  tempRow.append(el("span", "hero__icon", condition.icon), el("span", "hero__deg", deg(now.temperature_2m)));
  left.append(tempRow, el("p", "hero__cond", condition.label));

  const today = f.daily;
  const stats = el("dl", "stats");
  const addStat = (label: string, value: string): void => {
    const wrap = el("div");
    wrap.append(el("dt", "", label), el("dd", "", value));
    stats.append(wrap);
  };
  addStat("Feels like", deg(now.apparent_temperature));
  addStat("High / Low", `${deg(today.temperature_2m_max[0] ?? NaN)} / ${deg(today.temperature_2m_min[0] ?? NaN)}`);
  addStat("Humidity", `${now.relative_humidity_2m}%`);
  addStat("Wind", `${Math.round(now.wind_speed_10m)} ${speedUnit()}`);
  addStat("Sunrise", today.sunrise[0] ? fmtTime(today.sunrise[0]) : "–");
  addStat("Sunset", today.sunset[0] ? fmtTime(today.sunset[0]) : "–");
  hero.append(left, stats);

  // Next 24 hours
  const hourly = el("section", "panel");
  hourly.append(el("h3", "", "Next 24 hours"));
  const strip = el("ol", "hours");
  nextHours(f.hourly, now.time).forEach((slot, i) => {
    const li = el("li", "hour");
    const hourCond = describe(slot.code);
    li.title = hourCond.label;
    li.append(
      el("span", "hour__time", i === 0 ? "Now" : fmtHour(slot.time)),
      el("span", "hour__icon", hourCond.icon),
      el("span", "hour__temp", deg(slot.temp)),
      el("span", "hour__rain", slot.rainChance ? `💧${slot.rainChance}%` : ""),
    );
    strip.append(li);
  });
  hourly.append(strip);

  // 7-day outlook
  const daily = el("section", "panel");
  daily.append(el("h3", "", "7-day outlook"));
  const weekMin = Math.min(...today.temperature_2m_min);
  const weekMax = Math.max(...today.temperature_2m_max);
  const days = el("ul", "days");
  today.time.forEach((date, i) => {
    const min = today.temperature_2m_min[i] ?? NaN;
    const max = today.temperature_2m_max[i] ?? NaN;
    const cond = describe(today.weather_code[i] ?? -1);
    const rain = today.precipitation_probability_max[i];
    const { left: barLeft, width } = rangeBar(min, max, weekMin, weekMax);

    const li = el("li", "day");
    const bar = el("span", "day__bar");
    const fill = el("span", "day__fill");
    fill.style.left = `${barLeft * 100}%`;
    fill.style.width = `${width * 100}%`;
    bar.append(fill);

    li.title = cond.label;
    li.append(
      el("span", "day__name", fmtDay(date, i)),
      el("span", "day__icon", cond.icon),
      el("span", "day__rain", rain ? `${rain}%` : ""),
      el("span", "day__min", deg(min)),
      bar,
      el("span", "day__max", deg(max)),
    );
    days.append(li);
  });
  daily.append(days);

  content.replaceChildren(hero, hourly, daily);
  document.title = `${deg(now.temperature_2m)} ${place.name} · Weather`;
}

// ---------- units ----------
function renderUnits(): void {
  unitButtons.forEach((btn) => btn.setAttribute("aria-pressed", String(btn.dataset.units === units)));
}
unitButtons.forEach((btn) =>
  btn.addEventListener("click", () => {
    const next = btn.dataset.units === "metric" ? "metric" : "imperial";
    if (next === units) return;
    units = next;
    writeJSON(UNITS_KEY, units);
    renderUnits();
    if (current) void load(current);
  }),
);

// ---------- geolocation ----------
locateBtn.addEventListener("click", () => {
  if (!("geolocation" in navigator)) {
    setStatus("error", "Your browser doesn't support location.");
    return;
  }
  setStatus("loading", "Finding you…");
  navigator.geolocation.getCurrentPosition(
    (pos) =>
      void load({
        id: -1,
        name: "My location",
        latitude: Number(pos.coords.latitude.toFixed(4)),
        longitude: Number(pos.coords.longitude.toFixed(4)),
      }),
    () => setStatus("error", "Couldn't get your location. Search for a city instead."),
    { timeout: 10_000 },
  );
});

// ---------- start ----------
renderUnits();
renderRecent();
const first = recent[0] ?? STARTERS[0];
if (first) void load(first);

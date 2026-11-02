import { test } from "node:test";
import assert from "node:assert/strict";
import { describe, nextHours, placeLabel, rangeBar } from "../dist/forecast.js";

test("describe maps WMO codes and swaps the icon at night", () => {
  assert.equal(describe(63).label, "Rain");
  assert.equal(describe(0, true).icon, "☀️");
  assert.equal(describe(0, false).icon, "🌙");
  assert.equal(describe(1234).label, "Unknown");
});

test("nextHours starts at the current hour", () => {
  const time = Array.from({ length: 48 }, (_, h) =>
    `2026-10-${h < 24 ? "28" : "29"}T${String(h % 24).padStart(2, "0")}:00`);
  const hourly = {
    time,
    temperature_2m: time.map((_, i) => i),
    weather_code: time.map(() => 0),
    precipitation_probability: time.map(() => null),
  };
  const slots = nextHours(hourly, "2026-10-28T14:45", 24);
  assert.equal(slots.length, 24);
  assert.equal(slots[0].time, "2026-10-28T14:00");
  assert.equal(slots[0].temp, 14);
  assert.equal(slots[23].time, "2026-10-29T13:00");
});

test("rangeBar positions a day inside the week's range", () => {
  assert.deepEqual(rangeBar(50, 60, 40, 80), { left: 0.25, width: 0.25 });
  assert.equal(rangeBar(50, 50, 40, 80).width, 0.04); // never invisible
});

test("placeLabel skips duplicates and missing parts", () => {
  assert.equal(placeLabel({ name: "Tokyo", admin1: "Tokyo", country: "Japan" }), "Tokyo, Japan");
  assert.equal(placeLabel({ name: "My location" }), "My location");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { compare, computeStats, pickWords, seededRandom } from "../dist/stats.js";

test("compare counts correct and incorrect characters by position", () => {
  assert.deepEqual(compare("hello world", "hellp w"), { correct: 6, incorrect: 1 });
});

test("computeStats: 50 correct chars in 30s is 20 WPM", () => {
  const target = "a".repeat(100);
  const s = computeStats(target, "a".repeat(50), 30_000, 50, 0);
  assert.equal(s.wpm, 20);
  assert.equal(s.rawWpm, 20);
  assert.equal(s.accuracy, 100);
});

test("accuracy counts corrected mistakes", () => {
  // 10 keystrokes, 2 were wrong when typed (even if later fixed)
  assert.equal(computeStats("abcdefgh", "abcdefgh", 60_000, 10, 2).accuracy, 80);
});

test("no time elapsed means 0 WPM, not Infinity", () => {
  assert.equal(computeStats("abc", "", 0, 0, 0).wpm, 0);
});

test("pickWords is deterministic with a seed and avoids back-to-back repeats", () => {
  const pool = ["a", "b", "c"];
  const one = pickWords(pool, 30, seededRandom(42));
  const two = pickWords(pool, 30, seededRandom(42));
  assert.deepEqual(one, two);
  for (let i = 1; i < one.length; i++) assert.notEqual(one[i], one[i - 1]);
});

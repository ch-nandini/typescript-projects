import { test } from "node:test";
import assert from "node:assert/strict";
import { applyFilters, isTransaction, summarize, toCSV, toCents } from "../dist/ledger.js";

const tx = (over) => ({
  id: "1", description: "x", amountCents: 1000, date: "2026-10-01", kind: "expense", category: "Food", ...over,
});

test("toCents handles decimals without float drift", () => {
  assert.equal(toCents("19.99"), 1999);
  assert.equal(toCents("0.1"), 10);
  assert.equal(toCents("-5"), null);
  assert.equal(toCents("abc"), null);
});

test("summarize totals income, expenses and categories", () => {
  const s = summarize([
    tx({ id: "a", kind: "income", category: "Salary", amountCents: 5000 }),
    tx({ id: "b", category: "Food", amountCents: 1200 }),
    tx({ id: "c", category: "Fun", amountCents: 800 }),
    tx({ id: "d", category: "Food", amountCents: 300 }),
  ]);
  assert.equal(s.incomeCents, 5000);
  assert.equal(s.expenseCents, 2300);
  assert.equal(s.balanceCents, 2700);
  assert.deepEqual(s.byCategory, [
    { category: "Food", cents: 1500 },
    { category: "Fun", cents: 800 },
  ]);
});

test("applyFilters filters by month and category, newest first", () => {
  const list = [
    tx({ id: "a", date: "2026-09-30" }),
    tx({ id: "b", date: "2026-10-02" }),
    tx({ id: "c", date: "2026-10-05", category: "Fun" }),
  ];
  assert.deepEqual(applyFilters(list, { month: "2026-10", category: "all" }).map((t) => t.id), ["c", "b"]);
  assert.deepEqual(applyFilters(list, { month: "all", category: "Food" }).map((t) => t.id), ["b", "a"]);
});

test("toCSV escapes commas and quotes", () => {
  const csv = toCSV([tx({ description: 'Pizza, "large"' })]);
  assert.equal(csv.split("\n")[1], '2026-10-01,expense,Food,"Pizza, ""large""",10.00');
});

test("isTransaction rejects bad data from storage", () => {
  assert.equal(isTransaction(tx({})), true);
  assert.equal(isTransaction(tx({ kind: "income", category: "Food" })), false);
  assert.equal(isTransaction(tx({ amountCents: 1.5 })), false);
  assert.equal(isTransaction(null), false);
});

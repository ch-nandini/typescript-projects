import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aiMove, applyMove, availableMoves, bestMove, emptyBoard, evaluate, opponent,
} from "../dist/game.js";

const parse = (s) => [...s].map((c) => (c === "." ? null : c));

test("detects row, column and diagonal wins", () => {
  assert.equal(evaluate(parse("XXX......")).winner, "X");
  assert.equal(evaluate(parse("O..O..O..")).winner, "O");
  assert.deepEqual(evaluate(parse("X...X...X")).line, [0, 4, 8]);
});

test("detects a draw", () => {
  const r = evaluate(parse("XOXXOOOXX"));
  assert.equal(r.winner, null);
  assert.equal(r.isDraw, true);
});

test("takes an immediate win", () => {
  assert.equal(bestMove(parse("OO.XX...."), "O"), 2);
});

test("blocks an immediate loss", () => {
  // X threatens 0-1-2; O must play 2
  assert.equal(bestMove(parse("XX..O....") , "O"), 2);
});

test("rejects moves on taken cells", () => {
  assert.throws(() => applyMove(parse("X........"), 0, "O"));
});

test("easy mode only plays legal moves", () => {
  const board = parse("XO.XO....");
  for (let i = 0; i < 50; i++) {
    assert.ok(availableMoves(board).includes(aiMove(board, "X", "easy")));
  }
});

// Exhaustive check: try every possible human strategy against the AI.
function aiNeverLoses(board, toMove, ai) {
  const { winner, isDraw } = evaluate(board);
  if (winner) return winner === ai;
  if (isDraw) return true;
  if (toMove === ai) {
    return aiNeverLoses(applyMove(board, bestMove(board, ai), ai), opponent(ai), ai);
  }
  return availableMoves(board).every((m) =>
    aiNeverLoses(applyMove(board, m, toMove), opponent(toMove), ai),
  );
}

test("impossible AI never loses when playing O", () => {
  assert.equal(aiNeverLoses(emptyBoard(), "X", "O"), true);
});

test("impossible AI never loses when playing X", () => {
  assert.equal(aiNeverLoses(emptyBoard(), "X", "X"), true);
});

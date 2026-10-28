// Pure game logic: no DOM access, so it can be unit-tested in Node.

export type Player = "X" | "O";
export type Cell = Player | null;
export type Board = readonly Cell[]; // 9 cells, index 0..8 left-to-right, top-to-bottom
export type Difficulty = "easy" | "medium" | "impossible";

export interface GameResult {
  winner: Player | null;
  line: readonly number[] | null; // winning cell indexes, for highlighting
  isDraw: boolean;
}

export const WIN_LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
  [0, 4, 8], [2, 4, 6],            // diagonals
];

export const emptyBoard = (): Cell[] => Array<Cell>(9).fill(null);

export const opponent = (p: Player): Player => (p === "X" ? "O" : "X");

export function availableMoves(board: Board): number[] {
  const moves: number[] = [];
  board.forEach((cell, i) => {
    if (cell === null) moves.push(i);
  });
  return moves;
}

export function evaluate(board: Board): GameResult {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const first = board[a];
    if (first && first === board[b] && first === board[c]) {
      return { winner: first, line, isDraw: false };
    }
  }
  const isDraw = board.every((cell) => cell !== null);
  return { winner: null, line: null, isDraw };
}

export function applyMove(board: Board, index: number, player: Player): Cell[] {
  if (board[index] !== null) throw new Error(`Cell ${index} is already taken`);
  const next = [...board];
  next[index] = player;
  return next;
}

/**
 * Minimax with alpha-beta pruning.
 * Scores are depth-adjusted so the AI prefers faster wins and slower losses.
 */
function minimax(
  board: Cell[],
  toMove: Player,
  ai: Player,
  depth: number,
  alpha: number,
  beta: number,
): number {
  const { winner, isDraw } = evaluate(board);
  if (winner === ai) return 10 - depth;
  if (winner) return depth - 10;
  if (isDraw) return 0;

  const maximizing = toMove === ai;
  let best = maximizing ? -Infinity : Infinity;

  for (const move of availableMoves(board)) {
    board[move] = toMove;
    const score = minimax(board, opponent(toMove), ai, depth + 1, alpha, beta);
    board[move] = null;

    if (maximizing) {
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
    } else {
      best = Math.min(best, score);
      beta = Math.min(beta, score);
    }
    if (beta <= alpha) break; // prune: the other player will never allow this branch
  }
  return best;
}

export function bestMove(board: Board, ai: Player): number {
  const moves = availableMoves(board);
  if (moves.length === 0) throw new Error("No moves left");

  const scratch = [...board];
  let bestScore = -Infinity;
  let choice = moves[0]!;

  for (const move of moves) {
    scratch[move] = ai;
    const score = minimax(scratch, opponent(ai), ai, 1, -Infinity, Infinity);
    scratch[move] = null;
    if (score > bestScore) {
      bestScore = score;
      choice = move;
    }
  }
  return choice;
}

export function randomMove(board: Board, rng: () => number = Math.random): number {
  const moves = availableMoves(board);
  if (moves.length === 0) throw new Error("No moves left");
  return moves[Math.floor(rng() * moves.length)]!;
}

/** Chance that each difficulty plays the perfect move instead of a random one. */
const SKILL: Record<Difficulty, number> = { easy: 0, medium: 0.6, impossible: 1 };

export function aiMove(
  board: Board,
  ai: Player,
  difficulty: Difficulty,
  rng: () => number = Math.random,
): number {
  return rng() < SKILL[difficulty] ? bestMove(board, ai) : randomMove(board, rng);
}

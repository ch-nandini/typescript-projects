import {
  aiMove,
  applyMove,
  emptyBoard,
  evaluate,
  opponent,
  type Cell,
  type Difficulty,
  type Player,
} from "./game.js";

interface Score {
  wins: number;
  losses: number;
  draws: number;
}

interface State {
  board: Cell[];
  human: Player;
  turn: Player;
  difficulty: Difficulty;
  over: boolean;
  thinking: boolean;
}

const STORAGE_KEY = "ttt-ai:score";
const AI_DELAY_MS = 350;

const $ = <T extends HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
};

const boardEl = $<HTMLDivElement>("#board");
const statusEl = $<HTMLParagraphElement>("#status");
const newGameBtn = $<HTMLButtonElement>("#new-game");
const resetScoreBtn = $<HTMLButtonElement>("#reset-score");
const difficultyInputs = document.querySelectorAll<HTMLInputElement>('input[name="difficulty"]');
const sideInputs = document.querySelectorAll<HTMLInputElement>('input[name="side"]');
const scoreEls = {
  wins: $<HTMLElement>("#score-wins"),
  losses: $<HTMLElement>("#score-losses"),
  draws: $<HTMLElement>("#score-draws"),
};

function loadScore(): Score {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Score>;
      return { wins: parsed.wins ?? 0, losses: parsed.losses ?? 0, draws: parsed.draws ?? 0 };
    }
  } catch {
    /* storage unavailable: fall back to a fresh score */
  }
  return { wins: 0, losses: 0, draws: 0 };
}

function saveScore(score: Score): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(score));
  } catch {
    /* ignore */
  }
}

let score = loadScore();
const state: State = {
  board: emptyBoard(),
  human: "X",
  turn: "X",
  difficulty: "impossible",
  over: false,
  thinking: false,
};

// Build the 9 cells once; render() only updates them.
const cells: HTMLButtonElement[] = Array.from({ length: 9 }, (_, i) => {
  const btn = document.createElement("button");
  btn.className = "cell";
  btn.type = "button";
  btn.dataset.index = String(i);
  btn.setAttribute("aria-label", `Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}`);
  boardEl.append(btn);
  return btn;
});

function render(): void {
  const result = evaluate(state.board);

  cells.forEach((btn, i) => {
    const value = state.board[i] ?? null;
    btn.textContent = value ?? "";
    btn.dataset.mark = value ?? "";
    btn.disabled = value !== null || state.over || state.thinking || state.turn !== state.human;
    btn.classList.toggle("win", result.line?.includes(i) ?? false);
  });

  if (result.winner) {
    statusEl.textContent = result.winner === state.human ? "You win! 🎉" : "AI wins. Try again?";
  } else if (result.isDraw) {
    statusEl.textContent = "Draw. Nobody blinked.";
  } else if (state.thinking) {
    statusEl.textContent = "AI is thinking…";
  } else {
    statusEl.textContent = `Your move (${state.human})`;
  }
  statusEl.dataset.tone = result.winner
    ? result.winner === state.human ? "good" : "bad"
    : result.isDraw ? "neutral" : "";

  scoreEls.wins.textContent = String(score.wins);
  scoreEls.losses.textContent = String(score.losses);
  scoreEls.draws.textContent = String(score.draws);
}

function finishIfOver(): boolean {
  const { winner, isDraw } = evaluate(state.board);
  if (!winner && !isDraw) return false;

  state.over = true;
  if (winner === state.human) score.wins++;
  else if (winner) score.losses++;
  else score.draws++;
  saveScore(score);
  return true;
}

function play(index: number, player: Player): void {
  state.board = applyMove(state.board, index, player);
  state.turn = opponent(player);
  finishIfOver();
}

function aiTurn(): void {
  const ai = opponent(state.human);
  state.thinking = true;
  render();

  window.setTimeout(() => {
    state.thinking = false;
    if (!state.over) play(aiMove(state.board, ai, state.difficulty), ai);
    render();
  }, AI_DELAY_MS);
}

function newGame(): void {
  state.board = emptyBoard();
  state.turn = "X"; // X always opens
  state.over = false;
  state.thinking = false;
  if (state.human === "O") aiTurn();
  else render();
}

boardEl.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>(".cell");
  if (!target || target.disabled) return;

  play(Number(target.dataset.index), state.human);
  if (state.over) render();
  else aiTurn();
});

difficultyInputs.forEach((input) =>
  input.addEventListener("change", () => {
    state.difficulty = input.value as Difficulty;
    newGame();
  }),
);

sideInputs.forEach((input) =>
  input.addEventListener("change", () => {
    state.human = input.value as Player;
    newGame();
  }),
);

newGameBtn.addEventListener("click", newGame);
resetScoreBtn.addEventListener("click", () => {
  score = { wins: 0, losses: 0, draws: 0 };
  saveScore(score);
  render();
});

newGame();

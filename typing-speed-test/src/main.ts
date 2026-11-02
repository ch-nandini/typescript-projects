import { computeStats, pickWords, type Stats } from "./stats.js";
import { WORDS } from "./words.js";

type Duration = 15 | 30 | 60;
type Phase = "ready" | "running" | "done";

const BEST_KEY = "typing-test:best";
const WORD_COUNT = 150; // more than anyone can type in 60s

const $ = <T extends HTMLElement>(selector: string): T => {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`Missing element: ${selector}`);
  return el;
};

const textBox = $<HTMLDivElement>("#text");
const textInner = $<HTMLDivElement>("#text-inner");
const input = $<HTMLInputElement>("#input");
const timerEl = $<HTMLElement>("#timer");
const liveWpmEl = $<HTMLElement>("#live-wpm");
const hint = $<HTMLParagraphElement>("#hint");
const restartBtn = $<HTMLButtonElement>("#restart");
const durationInputs = document.querySelectorAll<HTMLInputElement>('input[name="duration"]');
const results = $<HTMLElement>("#results");
const resultEls = {
  wpm: $<HTMLElement>("#r-wpm"),
  accuracy: $<HTMLElement>("#r-acc"),
  raw: $<HTMLElement>("#r-raw"),
  chars: $<HTMLElement>("#r-chars"),
  best: $<HTMLElement>("#r-best"),
};

let duration: Duration = 30;
let phase: Phase = "ready";
let target = "";
let typed = "";
let keystrokes = 0;
let mistakes = 0;
let startedAt = 0;
let tick: number | undefined;
let charSpans: HTMLSpanElement[] = [];

function loadBest(): Partial<Record<Duration, number>> {
  try {
    return JSON.parse(localStorage.getItem(BEST_KEY) ?? "{}") as Partial<Record<Duration, number>>;
  } catch {
    return {};
  }
}
function saveBest(best: Partial<Record<Duration, number>>): void {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(best));
  } catch {
    /* ignore */
  }
}

function buildText(): void {
  target = pickWords(WORDS, WORD_COUNT).join(" ");
  const fragment = document.createDocumentFragment();
  charSpans = [...target].map((ch) => {
    const span = document.createElement("span");
    span.className = "ch";
    span.textContent = ch;
    fragment.append(span);
    return span;
  });
  textInner.replaceChildren(fragment);
  textInner.style.transform = "translateY(0)";
}

function paint(from: number, to: number): void {
  for (let i = from; i < Math.min(to, charSpans.length); i++) {
    const span = charSpans[i]!;
    const ch = typed[i];
    span.classList.toggle("ok", ch !== undefined && ch === target[i]);
    span.classList.toggle("bad", ch !== undefined && ch !== target[i]);
    span.classList.toggle("caret", i === typed.length && phase !== "done");
  }
  keepCaretInView();
}

/** Scrolls the text so the line with the caret is always the 2nd visible line. */
function keepCaretInView(): void {
  const caret = charSpans[typed.length];
  const first = charSpans[0];
  if (!caret || !first) return;
  const lineHeight = parseFloat(getComputedStyle(textInner).lineHeight) || 40;
  const line = Math.round((caret.offsetTop - first.offsetTop) / lineHeight);
  const offset = Math.max(0, line - 1) * lineHeight;
  textInner.style.transform = `translateY(${-offset}px)`;
}

function elapsedMs(): number {
  return phase === "ready" ? 0 : Math.min(performance.now() - startedAt, duration * 1000);
}

function currentStats(): Stats {
  return computeStats(target, typed, elapsedMs(), keystrokes, mistakes);
}

function updateHud(): void {
  const remaining = Math.ceil((duration * 1000 - elapsedMs()) / 1000);
  timerEl.textContent = String(Math.max(0, remaining));
  liveWpmEl.textContent = phase === "running" && elapsedMs() > 1000 ? String(currentStats().wpm) : "–";
}

function start(): void {
  phase = "running";
  startedAt = performance.now();
  hint.textContent = "Esc to restart";
  tick = window.setInterval(() => {
    updateHud();
    if (elapsedMs() >= duration * 1000) finish();
  }, 100);
}

function finish(): void {
  window.clearInterval(tick);
  phase = "done";
  input.blur();
  paint(Math.max(0, typed.length - 1), typed.length + 1);

  const stats = currentStats();
  const best = loadBest();
  const previous = best[duration] ?? 0;
  const isRecord = stats.wpm > previous;
  if (isRecord) {
    best[duration] = stats.wpm;
    saveBest(best);
  }

  resultEls.wpm.textContent = String(stats.wpm);
  resultEls.accuracy.textContent = `${stats.accuracy}%`;
  resultEls.raw.textContent = String(stats.rawWpm);
  resultEls.chars.textContent = `${stats.correctChars} / ${stats.incorrectChars}`;
  resultEls.best.textContent = isRecord ? `${stats.wpm} 🎉 new!` : String(previous);
  results.hidden = false;
  textBox.classList.add("done");
  hint.textContent = "Press Enter or click Restart to go again";
  timerEl.textContent = "0";
  restartBtn.focus();
}

function reset(): void {
  window.clearInterval(tick);
  phase = "ready";
  typed = "";
  keystrokes = 0;
  mistakes = 0;
  input.value = "";
  results.hidden = true;
  textBox.classList.remove("done");
  hint.textContent = "Start typing to begin. Click the text if it isn't focused.";
  buildText();
  paint(0, 1);
  updateHud();
  input.focus();
}

input.addEventListener("input", () => {
  if (phase === "done") {
    input.value = typed;
    return;
  }
  if (phase === "ready") start();

  const next = input.value.slice(0, target.length);
  const before = typed.length;

  // Count new keystrokes (not deletions) and whether each was right when typed.
  for (let i = before; i < next.length; i++) {
    keystrokes++;
    if (next[i] !== target[i]) mistakes++;
  }

  typed = next;
  input.value = next;
  const from = Math.max(0, Math.min(before, typed.length) - 1);
  paint(from, Math.max(before, typed.length) + 2);
  updateHud();

  if (typed.length === target.length) finish();
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    e.preventDefault();
    reset();
  }
});

document.addEventListener("keydown", (e) => {
  if (phase === "done" && e.key === "Enter" && document.activeElement !== restartBtn) {
    e.preventDefault();
    reset();
  }
});

input.addEventListener("focus", () => textBox.classList.add("focused"));
input.addEventListener("blur", () => textBox.classList.remove("focused"));
textBox.addEventListener("click", () => {
  if (phase !== "done") input.focus();
});
restartBtn.addEventListener("click", reset);
durationInputs.forEach((radio) =>
  radio.addEventListener("change", () => {
    duration = Number(radio.value) as Duration;
    reset();
  }),
);
window.addEventListener("resize", keepCaretInView);

reset();

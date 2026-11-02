// Pure scoring logic. No DOM, so it's unit-testable in Node.

export interface Stats {
  wpm: number;       // net speed: correct characters / 5 per minute
  rawWpm: number;    // everything typed / 5 per minute
  accuracy: number;  // % of keystrokes that were correct when typed
  correctChars: number;
  incorrectChars: number;
}

/** Compares what was typed with the target text, position by position. */
export function compare(target: string, typed: string): { correct: number; incorrect: number } {
  let correct = 0;
  let incorrect = 0;
  for (let i = 0; i < typed.length; i++) {
    if (typed[i] === target[i]) correct++;
    else incorrect++;
  }
  return { correct, incorrect };
}

export function computeStats(
  target: string,
  typed: string,
  elapsedMs: number,
  keystrokes: number,
  mistakes: number,
): Stats {
  const minutes = elapsedMs / 60_000;
  const { correct, incorrect } = compare(target, typed);
  const perMinute = (chars: number): number => (minutes > 0 ? Math.round(chars / 5 / minutes) : 0);
  return {
    wpm: perMinute(correct),
    rawWpm: perMinute(typed.length),
    accuracy: keystrokes > 0 ? Math.round(((keystrokes - mistakes) / keystrokes) * 100) : 100,
    correctChars: correct,
    incorrectChars: incorrect,
  };
}

/** Small seeded PRNG (mulberry32) so tests can generate the same words every time. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWords(pool: readonly string[], count: number, rng: () => number = Math.random): string[] {
  const words: string[] = [];
  for (let i = 0; i < count; i++) {
    let word = pool[Math.floor(rng() * pool.length)]!;
    if (word === words[i - 1]) word = pool[(pool.indexOf(word) + 1) % pool.length]!; // avoid repeats
    words.push(word);
  }
  return words;
}

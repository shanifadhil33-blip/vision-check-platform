/**
 * Thin two-device trial sequence helpers.
 * Pure numbers / letters in — no browser APIs (AGENTS.md rule 1).
 */

import { SLOAN_LETTERS, type SloanLetter } from "./sloan";

/**
 * Two flankers, each different from the target and from each other.
 */
export function pickFlankers(
  target: SloanLetter,
  random: () => number,
): [SloanLetter, SloanLetter] {
  const pool: SloanLetter[] = [];
  for (const letter of SLOAN_LETTERS) {
    if (letter !== target) {
      pool.push(letter);
    }
  }

  const firstIndex = Math.floor(random() * pool.length);
  const [first] = pool.splice(firstIndex, 1);
  const secondIndex = Math.floor(random() * pool.length);
  const [second] = pool.splice(secondIndex, 1);
  if (first === undefined || second === undefined) {
    return [SLOAN_LETTERS[0], SLOAN_LETTERS[1]];
  }
  return [first, second];
}

/**
 * Target plus four other Sloan letters, shuffled. `random` must return [0, 1).
 */
export function buildTrialChoices(
  target: SloanLetter,
  random: () => number,
): SloanLetter[] {
  const pool: SloanLetter[] = [];
  for (const letter of SLOAN_LETTERS) {
    if (letter !== target) {
      pool.push(letter);
    }
  }

  const distractors: SloanLetter[] = [];
  while (distractors.length < 4 && pool.length > 0) {
    const index = Math.floor(random() * pool.length);
    const [picked] = pool.splice(index, 1);
    if (picked !== undefined) {
      distractors.push(picked);
    }
  }

  const choices: SloanLetter[] = [target, ...distractors];
  for (let i = choices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = choices[i];
    const b = choices[j];
    if (a === undefined || b === undefined) {
      continue;
    }
    choices[i] = b;
    choices[j] = a;
  }
  return choices;
}

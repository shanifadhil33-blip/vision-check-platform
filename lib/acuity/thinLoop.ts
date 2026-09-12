/**
 * Thin two-device trial sequence helpers.
 * Pure numbers / letters in — no browser APIs (AGENTS.md rule 1).
 */

import { letterHeightMmForLogMar } from "./logmar";
import { canRenderLogMar } from "./renderableRange";
import { SLOAN_LETTERS, type SloanLetter } from "./sloan";

/** logMAR step indices offered in order: 0.5 → 0.0. */
export const THIN_LOOP_STEP_INDICES: readonly number[] = [5, 4, 3, 2, 1, 0];

/**
 * Keep only step indices whose logMAR (index / 10) passes the Carkeet floor
 * for the given distance and physical pixel pitch.
 */
export function renderableStepIndices(
  distanceMm: number,
  pixelPitchMmValue: number,
): number[] {
  return THIN_LOOP_STEP_INDICES.filter((stepIndex) =>
    canRenderLogMar(stepIndex / 10, distanceMm, pixelPitchMmValue),
  );
}

/**
 * Triplet steps must also fit canvas 5L wide and L+48 tall inside the viewport
 * margins (viewport sizes are plain numbers measured once at Start).
 */
export function renderableStepIndicesForTriplet(
  distanceMm: number,
  pixelPitchMmValue: number,
  cssPxPerMm: number,
  viewportWidthCssPx: number,
  viewportHeightCssPx: number,
): number[] {
  return THIN_LOOP_STEP_INDICES.filter((stepIndex) => {
    if (!canRenderLogMar(stepIndex / 10, distanceMm, pixelPitchMmValue)) {
      return false;
    }
    const letterHeightCssPx =
      letterHeightMmForLogMar(stepIndex / 10, distanceMm) * cssPxPerMm;
    if (5 * letterHeightCssPx > viewportWidthCssPx - 64) {
      return false;
    }
    if (letterHeightCssPx + 48 > viewportHeightCssPx - 64) {
      return false;
    }
    return true;
  });
}

export function pickTarget(random: () => number): SloanLetter {
  const index = Math.floor(random() * SLOAN_LETTERS.length);
  const letter = SLOAN_LETTERS[index];
  if (letter === undefined) {
    return SLOAN_LETTERS[0];
  }
  return letter;
}

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

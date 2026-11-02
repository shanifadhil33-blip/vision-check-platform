/**
 * Landolt C staircase. Pure state in, new state out (AGENTS.md rule 1).
 * No randomness, no time, no I/O: the gap direction is chosen from an
 * injected random source, and the same outcomes always give the same state.
 *
 * Rules agreed with John, 27 to 29 Oct:
 * - Sizes are step indices, logMAR x 10, from -1 (6/5) to 10 (6/60).
 * - Within a size, at most 5 scored Cs. 4 correct passes the size; the 2nd
 *   wrong answer fails it. "Not sure" counts as wrong and is also counted on
 *   its own. A void C is kept in the record but never scored.
 * - Start at step 3 (6/12) when available, otherwise the available step
 *   nearest to it.
 * - Searching (nothing passed yet): a fail jumps 3 steps coarser, capped at
 *   the coarsest available step. A fail at the coarsest step ends the test
 *   as not-measurable.
 * - The first pass switches to finer: each pass moves one step finer. With
 *   no finer step, the same size is retested (confirming).
 * - Finer: a fail switches to confirming and retests the last size passed.
 * - Confirming: a pass at a size with one pass retests it; a fail moves one
 *   step coarser; a fail at the coarsest step ends the test as inconsistent.
 * - Any size reaching 2 passes ends the test: step -1 is test-floor, the
 *   finest available step is screen-limited, otherwise measured there.
 * - At most 50 scored Cs. The C is applied first; if it ended the test that
 *   result stands, otherwise reaching 50 ends the test as inconsistent.
 * - Practice Cs never enter this module.
 */

export type LandoltDirection = "up" | "down" | "left" | "right";

export const LANDOLT_DIRECTIONS: readonly LandoltDirection[] = ["up", "down", "left", "right"];

export type LandoltAnswer = LandoltDirection | "not_sure";

export type CTrialOutcome = "correct" | "incorrect" | "not_sure" | "void";

/** First size offered when the range contains it: logMAR 0.3 (6/12). */
export const C_START_STEP_INDEX = 3;

/** Scored Cs allowed at one size. Voids do not count toward this. */
export const C_MAX_PER_SIZE = 5;

/** Correct scored Cs that pass a size. */
export const C_PASS_CORRECT = 4;

/** Wrong scored Cs (not_sure included) that fail a size. */
export const C_FAIL_WRONG = 2;

/** Steps moved coarser after a fail while searching. */
export const C_JUMP_STEPS = 3;

/** Scored Cs allowed in the whole test. Voids do not count toward this. */
export const C_MAX_SCORED = 50;

/** Finest step the test can ever offer: logMAR -0.1 (6/5). */
export const C_FINEST_STEP_INDEX = -1;

/** Coarsest step the test can ever offer: logMAR 1.0 (6/60). */
export const C_COARSEST_STEP_INDEX = 10;

export type CMode = "searching" | "finer" | "confirming";

export type CAttempt = {
  readonly stepIndex: number;
  readonly outcomes: readonly CTrialOutcome[];
  readonly correct: number;
  /** Includes not_sure. */
  readonly wrong: number;
  readonly notSure: number;
  readonly voids: number;
  /** null while the attempt is open. */
  readonly passed: boolean | null;
};

export type CResult =
  | { kind: "measured"; stepIndex: number }
  | { kind: "test-floor"; stepIndex: -1 }
  | { kind: "screen-limited"; stepIndex: number }
  | { kind: "not-measurable"; coarsestStepIndex: number }
  | { kind: "inconsistent" };

export type CRunning = {
  status: "running";
  stepIndices: readonly number[];
  mode: CMode;
  currentStepIndex: number;
  attempts: readonly CAttempt[];
  scoredCount: number;
  notSureCount: number;
  lastPassedStepIndex: number | null;
};

export type CFinished = {
  status: "finished";
  stepIndices: readonly number[];
  attempts: readonly CAttempt[];
  scoredCount: number;
  notSureCount: number;
  result: CResult;
};

export type CStaircaseState = CRunning | CFinished;

function isValidRange(stepIndices: readonly number[]): boolean {
  if (stepIndices.length === 0) return false;
  for (let i = 0; i < stepIndices.length; i += 1) {
    const stepIndex = stepIndices[i]!;
    if (!Number.isInteger(stepIndex)) return false;
    if (stepIndex < C_FINEST_STEP_INDEX || stepIndex > C_COARSEST_STEP_INDEX) return false;
    if (i > 0 && stepIndex !== stepIndices[i - 1]! + 1) return false;
  }
  return true;
}

function startStepIndex(stepIndices: readonly number[]): number {
  const finestStepIndex = stepIndices[0]!;
  const coarsestStepIndex = stepIndices[stepIndices.length - 1]!;
  if (finestStepIndex > C_START_STEP_INDEX) return finestStepIndex;
  if (coarsestStepIndex < C_START_STEP_INDEX) return coarsestStepIndex;
  return C_START_STEP_INDEX;
}

export function startCStaircase(
  stepIndices: readonly number[],
): CRunning | { status: "cannot-start" } {
  if (!isValidRange(stepIndices)) return { status: "cannot-start" };
  return {
    status: "running",
    stepIndices: [...stepIndices],
    mode: "searching",
    currentStepIndex: startStepIndex(stepIndices),
    attempts: [],
    scoredCount: 0,
    notSureCount: 0,
    lastPassedStepIndex: null,
  };
}

export function passCountAt(state: CStaircaseState, stepIndex: number): number {
  return state.attempts.filter((attempt) => attempt.stepIndex === stepIndex && attempt.passed === true)
    .length;
}

function emptyAttempt(stepIndex: number): CAttempt {
  return { stepIndex, outcomes: [], correct: 0, wrong: 0, notSure: 0, voids: 0, passed: null };
}

function applyOutcome(attempt: CAttempt, outcome: CTrialOutcome): CAttempt {
  const outcomes = [...attempt.outcomes, outcome];
  if (outcome === "void") {
    return { ...attempt, outcomes, voids: attempt.voids + 1 };
  }
  const correct = attempt.correct + (outcome === "correct" ? 1 : 0);
  const wrong = attempt.wrong + (outcome === "correct" ? 0 : 1);
  const notSure = attempt.notSure + (outcome === "not_sure" ? 1 : 0);
  let passed: boolean | null = null;
  if (correct >= C_PASS_CORRECT) passed = true;
  else if (wrong >= C_FAIL_WRONG || correct + wrong >= C_MAX_PER_SIZE) passed = false;
  return { ...attempt, outcomes, correct, wrong, notSure, passed };
}

function resultForSecondPass(stepIndex: number, stepIndices: readonly number[]): CResult {
  if (stepIndex === C_FINEST_STEP_INDEX) return { kind: "test-floor", stepIndex: C_FINEST_STEP_INDEX };
  if (stepIndex === stepIndices[0]) return { kind: "screen-limited", stepIndex };
  return { kind: "measured", stepIndex };
}

export function recordCTrial(state: CRunning, outcome: CTrialOutcome): CStaircaseState {
  if (state.status !== "running") {
    throw new Error("recordCTrial: the staircase has finished");
  }
  if (state.scoredCount >= C_MAX_SCORED) {
    throw new Error(`recordCTrial: ${C_MAX_SCORED} scored Cs already recorded`);
  }

  const lastAttempt = state.attempts[state.attempts.length - 1];
  const isOpen = lastAttempt !== undefined && lastAttempt.passed === null;
  const openAttempt = isOpen ? lastAttempt : emptyAttempt(state.currentStepIndex);
  const attempt = applyOutcome(openAttempt, outcome);
  const attempts = isOpen ? [...state.attempts.slice(0, -1), attempt] : [...state.attempts, attempt];
  const scoredCount = state.scoredCount + (outcome === "void" ? 0 : 1);
  const notSureCount = state.notSureCount + (outcome === "not_sure" ? 1 : 0);

  const finish = (result: CResult): CFinished => ({
    status: "finished",
    stepIndices: state.stepIndices,
    attempts,
    scoredCount,
    notSureCount,
    result,
  });

  let next: CRunning = { ...state, attempts, scoredCount, notSureCount };

  if (attempt.passed !== null) {
    const stepIndex = attempt.stepIndex;
    const coarsestStepIndex = state.stepIndices[state.stepIndices.length - 1]!;

    if (attempt.passed) {
      if (passCountAt(next, stepIndex) >= 2) {
        return finish(resultForSecondPass(stepIndex, state.stepIndices));
      }
      if (state.mode === "confirming") {
        next = { ...next, currentStepIndex: stepIndex, lastPassedStepIndex: stepIndex };
      } else {
        const finerStepIndex = stepIndex - 1;
        next = state.stepIndices.includes(finerStepIndex)
          ? { ...next, mode: "finer", currentStepIndex: finerStepIndex, lastPassedStepIndex: stepIndex }
          : { ...next, mode: "confirming", currentStepIndex: stepIndex, lastPassedStepIndex: stepIndex };
      }
    } else if (state.mode === "searching") {
      if (stepIndex === coarsestStepIndex) {
        return finish({ kind: "not-measurable", coarsestStepIndex });
      }
      next = { ...next, currentStepIndex: Math.min(stepIndex + C_JUMP_STEPS, coarsestStepIndex) };
    } else if (state.mode === "finer") {
      if (state.lastPassedStepIndex === null) {
        throw new Error("recordCTrial: finer mode without a passed size");
      }
      next = { ...next, mode: "confirming", currentStepIndex: state.lastPassedStepIndex };
    } else {
      if (stepIndex === coarsestStepIndex) {
        return finish({ kind: "inconsistent" });
      }
      next = { ...next, currentStepIndex: stepIndex + 1 };
    }
  }

  if (scoredCount >= C_MAX_SCORED) {
    return finish({ kind: "inconsistent" });
  }
  return next;
}

export function pickDirection(random: () => number): LandoltDirection {
  const rawIndex = Math.floor(random() * LANDOLT_DIRECTIONS.length);
  const index = Number.isFinite(rawIndex)
    ? Math.min(LANDOLT_DIRECTIONS.length - 1, Math.max(0, rawIndex))
    : 0;
  return LANDOLT_DIRECTIONS[index]!;
}

export function isDirectionCorrect(answer: LandoltAnswer, shown: LandoltDirection): boolean {
  return answer !== "not_sure" && answer === shown;
}

export function outcomeFor(
  answer: LandoltAnswer,
  shown: LandoltDirection,
): "correct" | "incorrect" | "not_sure" {
  if (answer === "not_sure") return "not_sure";
  return isDirectionCorrect(answer, shown) ? "correct" : "incorrect";
}

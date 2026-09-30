/**
 * Acuity staircase. Five scored letters at every level, pass mark three.
 * Pure state in, new state out (AGENTS.md rule 1). Randomness is injected.
 */

import { SLOAN_LETTERS, type SloanLetter } from "./sloan";
import { FINEST_TESTED_STEP_INDEX } from "./testLevels";

/** First level offered when the screen can draw it: logMAR 0.3 (6/12). */
export const START_STEP_INDEX = 3;

/** Scored letters shown at every level. Voids do not count toward this. */
export const LETTERS_PER_LEVEL = 5;

/** Correct scored letters required to pass a level. */
export const PASS_MARK = 3;

export type TrialOutcome = "correct" | "incorrect" | "void";

export type LevelRecord = {
  stepIndex: number;
  letters: SloanLetter[];
  outcomes: TrialOutcome[];
  scored: number;
  correct: number;
  passed: boolean | null;
};

export type StaircaseResult =
  | { kind: "measured"; stepIndex: number }
  | { kind: "test-floor"; stepIndex: number }
  | { kind: "screen-limited"; stepIndex: number }
  | { kind: "not-measurable"; coarsestStepIndex: number };

export type RunningStaircase = {
  status: "running";
  stepIndices: readonly number[];
  direction: "start" | "finer" | "coarser";
  currentStepIndex: number;
  levels: LevelRecord[];
  previousTarget: SloanLetter | null;
};

export type FinishedStaircase = {
  status: "finished";
  stepIndices: readonly number[];
  levels: LevelRecord[];
  previousTarget: SloanLetter | null;
  result: StaircaseResult;
};

export type StaircaseState = RunningStaircase | FinishedStaircase;

function emptyLevel(stepIndex: number): LevelRecord {
  return {
    stepIndex,
    letters: [],
    outcomes: [],
    scored: 0,
    correct: 0,
    passed: null,
  };
}

function assertStrictlyAscendingConsecutiveIntegers(stepIndices: readonly number[]): void {
  for (let index = 0; index < stepIndices.length; index += 1) {
    const stepIndex = stepIndices[index];
    if (stepIndex === undefined || !Number.isInteger(stepIndex)) {
      throw new RangeError("step indices must be strictly ascending consecutive integers");
    }
    if (index === 0) {
      continue;
    }
    const previous = stepIndices[index - 1];
    if (previous === undefined || stepIndex !== previous + 1) {
      throw new RangeError("step indices must be strictly ascending consecutive integers");
    }
  }
}

function startingStepIndex(stepIndices: readonly number[]): number {
  if (stepIndices.includes(START_STEP_INDEX)) {
    return START_STEP_INDEX;
  }
  const smallest = stepIndices[0];
  const largest = stepIndices[stepIndices.length - 1];
  if (smallest === undefined || largest === undefined) {
    throw new RangeError("step indices must be strictly ascending consecutive integers");
  }
  if (smallest > START_STEP_INDEX) {
    return smallest;
  }
  return largest;
}

export function startStaircase(
  stepIndices: readonly number[],
): RunningStaircase | { status: "cannot-start" } {
  if (stepIndices.length === 0) {
    return { status: "cannot-start" };
  }
  assertStrictlyAscendingConsecutiveIntegers(stepIndices);
  const ownedStepIndices = [...stepIndices];
  const currentStepIndex = startingStepIndex(ownedStepIndices);
  return {
    status: "running",
    stepIndices: ownedStepIndices,
    direction: "start",
    currentStepIndex,
    levels: [emptyLevel(currentStepIndex)],
    previousTarget: null,
  };
}

function currentLevel(state: RunningStaircase): LevelRecord {
  const level = state.levels.find((entry) => entry.stepIndex === state.currentStepIndex);
  if (level === undefined) {
    throw new Error("current level is missing");
  }
  return level;
}

function lettersExcept(excluded: ReadonlySet<SloanLetter>): SloanLetter[] {
  const pool: SloanLetter[] = [];
  for (const letter of SLOAN_LETTERS) {
    if (!excluded.has(letter)) {
      pool.push(letter);
    }
  }
  return pool;
}

export function pickNextTarget(state: RunningStaircase, random: () => number): SloanLetter {
  const sample = random();
  if (!Number.isFinite(sample) || sample < 0 || sample >= 1) {
    throw new RangeError("random() must return a finite number in [0, 1)");
  }

  const excluded = new Set(currentLevel(state).letters);
  if (state.previousTarget !== null) {
    excluded.add(state.previousTarget);
  }

  let pool = lettersExcept(excluded);
  if (pool.length === 0) {
    const previousOnly = new Set<SloanLetter>();
    if (state.previousTarget !== null) {
      previousOnly.add(state.previousTarget);
    }
    pool = lettersExcept(previousOnly);
  }

  const letter = pool[Math.floor(sample * pool.length)];
  if (letter === undefined) {
    throw new RangeError("letter pool is empty");
  }
  return letter;
}

function finish(state: RunningStaircase, result: StaircaseResult): FinishedStaircase {
  return {
    status: "finished",
    stepIndices: state.stepIndices,
    levels: state.levels,
    previousTarget: state.previousTarget,
    result,
  };
}

function moveTo(state: RunningStaircase, stepIndex: number, direction: "finer" | "coarser"): RunningStaircase {
  return {
    status: "running",
    stepIndices: state.stepIndices,
    direction,
    currentStepIndex: stepIndex,
    levels: [...state.levels, emptyLevel(stepIndex)],
    previousTarget: state.previousTarget,
  };
}

/**
 * After the current level has its pass mark applied.
 * A pass while still heading finer steps one level down when that level is
 * on the screen. Stopping on the finest tested step is the test floor;
 * stopping on any coarser step is the screen. A failure while heading
 * finer reports the last level passed (one step coarser). A failure while
 * still heading coarser steps one level up, or is not measurable at the
 * coarsest level the screen can draw.
 */
function advance(state: RunningStaircase, passed: boolean): StaircaseState {
  const { direction, currentStepIndex, stepIndices } = state;

  if (passed && (direction === "start" || direction === "finer")) {
    const finerStepIndex = currentStepIndex - 1;
    if (stepIndices.includes(finerStepIndex)) {
      return moveTo(state, finerStepIndex, "finer");
    }
    if (currentStepIndex === FINEST_TESTED_STEP_INDEX) {
      return finish(state, { kind: "test-floor", stepIndex: currentStepIndex });
    }
    return finish(state, { kind: "screen-limited", stepIndex: currentStepIndex });
  }

  if (!passed && direction === "finer") {
    return finish(state, { kind: "measured", stepIndex: currentStepIndex + 1 });
  }

  if (!passed && (direction === "start" || direction === "coarser")) {
    const coarserStepIndex = currentStepIndex + 1;
    if (stepIndices.includes(coarserStepIndex)) {
      return moveTo(state, coarserStepIndex, "coarser");
    }
    return finish(state, { kind: "not-measurable", coarsestStepIndex: currentStepIndex });
  }

  return finish(state, { kind: "measured", stepIndex: currentStepIndex });
}

export function recordTrial(
  state: StaircaseState,
  trial: { letter: SloanLetter; outcome: TrialOutcome },
): StaircaseState {
  if (state.status !== "running") {
    throw new Error("recordTrial requires a running staircase");
  }

  const levels = state.levels.map((level) => {
    if (level.stepIndex !== state.currentStepIndex) {
      return level;
    }
    const scored = level.scored + (trial.outcome === "void" ? 0 : 1);
    const correct = level.correct + (trial.outcome === "correct" ? 1 : 0);
    return {
      stepIndex: level.stepIndex,
      letters: [...level.letters, trial.letter],
      outcomes: [...level.outcomes, trial.outcome],
      scored,
      correct,
      passed: level.passed,
    };
  });

  const updatedIndex = levels.findIndex((level) => level.stepIndex === state.currentStepIndex);
  const updated = levels[updatedIndex];
  if (updated === undefined) {
    throw new Error("current level is missing");
  }

  const withTrial: RunningStaircase = {
    status: "running",
    stepIndices: state.stepIndices,
    direction: state.direction,
    currentStepIndex: state.currentStepIndex,
    levels,
    previousTarget: trial.letter,
  };

  if (updated.scored !== LETTERS_PER_LEVEL) {
    return withTrial;
  }

  const passed = updated.correct >= PASS_MARK;
  const closedLevels = levels.map((level, index) =>
    index === updatedIndex ? { ...level, passed } : level,
  );
  return advance({ ...withTrial, levels: closedLevels }, passed);
}

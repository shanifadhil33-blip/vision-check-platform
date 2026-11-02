/**
 * Landolt C run around the scoring module: the two practice Cs, the next C
 * to draw, scoring an answer, voiding a C, and the staff result wording.
 * Pure state in, new state out (AGENTS.md rule 1). Randomness comes only
 * from the injected random source.
 *
 * Practice Cs never enter landoltStaircase and never count toward the 50.
 * Scoring, confirmation, the cap and the result come from that module unchanged.
 */

import type { RunContext } from "@/lib/session/loopState";
import { CORRECTION_OPTIONS } from "./resultWording";
import { metresText } from "./distanceSetup";
import { customerLabelForStep } from "./resultLabel";
import {
  C_COARSEST_STEP_INDEX,
  LANDOLT_DIRECTIONS,
  outcomeFor,
  pickDirection,
  recordCTrial,
  startCStaircase,
  type CAttempt,
  type CResult,
  type CStaircaseState,
  type LandoltAnswer,
  type LandoltDirection,
} from "./landoltStaircase";
import {
  EYE_LABELS,
  MSG_CHOOSE_EYE,
  OUTCOME_FAILED,
  OUTCOME_NOT_FINISHED,
  OUTCOME_PASSED,
  RESULT_BELOW_RANGE,
  RESULT_INCONSISTENT,
  RESULT_TEST_FLOOR,
  type LandoltEye,
} from "./landoltWording";
import { MSG_CHOOSE_WEARING } from "./flowWording";
import { msgDistanceNotConfirmed } from "./distanceSetup";

export const PRACTICE_C_COUNT = 2;

export type LandoltPlan = {
  readonly practiceDirections: readonly LandoltDirection[];
  readonly practiceAnswered: number;
  readonly staircase: CStaircaseState;
};

export type PlannedC = {
  readonly practice: boolean;
  readonly stepIndex: number;
  readonly direction: LandoltDirection;
};

/** A direction from the other three, uniformly. */
export function pickDirectionExcept(
  random: () => number,
  excluded: LandoltDirection,
): LandoltDirection {
  const others = LANDOLT_DIRECTIONS.filter((direction) => direction !== excluded);
  const rawIndex = Math.floor(random() * others.length);
  const index = Number.isFinite(rawIndex)
    ? Math.min(others.length - 1, Math.max(0, rawIndex))
    : 0;
  return others[index]!;
}

/** Two practice directions that always differ. */
export function pickPracticeDirections(random: () => number): [LandoltDirection, LandoltDirection] {
  const first = pickDirection(random);
  return [first, pickDirectionExcept(random, first)];
}

/** Practice is drawn at the coarsest step this screen can show, normally 6/60. */
export function practiceStepIndex(stepIndices: readonly number[]): number {
  const coarsest = stepIndices[stepIndices.length - 1];
  if (coarsest === undefined) {
    throw new RangeError("step indices are empty");
  }
  return coarsest;
}

export function startLandoltPlan(
  stepIndices: readonly number[],
  random: () => number,
): LandoltPlan | null {
  const started = startCStaircase(stepIndices);
  if (started.status !== "running") {
    return null;
  }
  return {
    practiceDirections: pickPracticeDirections(random),
    practiceAnswered: 0,
    staircase: started,
  };
}

export function inPractice(plan: LandoltPlan): boolean {
  return plan.practiceAnswered < PRACTICE_C_COUNT;
}

/** The next C to draw, or null when the module has finished. */
export function planNextC(plan: LandoltPlan, random: () => number): PlannedC | null {
  if (inPractice(plan)) {
    return {
      practice: true,
      stepIndex: practiceStepIndex(plan.staircase.stepIndices),
      direction: plan.practiceDirections[plan.practiceAnswered]!,
    };
  }
  if (plan.staircase.status !== "running") {
    return null;
  }
  return {
    practice: false,
    stepIndex: plan.staircase.currentStepIndex,
    direction: pickDirection(random),
  };
}

export type AnsweredC = {
  plan: LandoltPlan;
  outcome: "correct" | "incorrect" | "not_sure";
  /** The size attempt this answer closed, or null. Always null for practice. */
  closedAttempt: CAttempt | null;
};

/** Scores one answer. A practice answer only moves practice on; it never reaches the module. */
export function answerC(plan: LandoltPlan, shown: PlannedC, answer: LandoltAnswer): AnsweredC {
  const outcome = outcomeFor(answer, shown.direction);
  if (shown.practice) {
    if (!inPractice(plan)) {
      throw new Error("answerC: practice answer after practice ended");
    }
    return {
      plan: { ...plan, practiceAnswered: plan.practiceAnswered + 1 },
      outcome,
      closedAttempt: null,
    };
  }
  if (inPractice(plan)) {
    throw new Error("answerC: scored answer during practice");
  }
  if (plan.staircase.status !== "running") {
    throw new Error("answerC: the staircase has finished");
  }
  const staircase = recordCTrial(plan.staircase, outcome);
  const last = staircase.attempts[staircase.attempts.length - 1];
  const closedAttempt = last !== undefined && last.passed !== null ? last : null;
  return { plan: { ...plan, staircase }, outcome, closedAttempt };
}

/**
 * A C shown or answered while the tab was hidden. A scored void is kept in the
 * module record and never scored; a practice void gets a fresh direction that
 * still differs from the other practice C.
 */
export function voidC(plan: LandoltPlan, shown: PlannedC, random: () => number): LandoltPlan {
  if (shown.practice) {
    if (!inPractice(plan)) {
      throw new Error("voidC: practice void after practice ended");
    }
    const slot = plan.practiceAnswered;
    const otherSlot = slot === 0 ? 1 : 0;
    const otherDirection = plan.practiceDirections[otherSlot]!;
    const practiceDirections = [...plan.practiceDirections];
    practiceDirections[slot] = pickDirectionExcept(random, otherDirection);
    return { ...plan, practiceDirections };
  }
  if (plan.staircase.status !== "running") {
    throw new Error("voidC: the staircase has finished");
  }
  return { ...plan, staircase: recordCTrial(plan.staircase, "void") };
}

export type LandoltStartHint = "eye" | "wearing" | "distance" | null;

/** Order is fixed: eye, then what is worn, then the distance tick box. */
export function landoltStartHint(input: {
  eye: LandoltEye | null;
  correction: RunContext["correction"] | null;
  distanceConfirmed: boolean;
}): LandoltStartHint {
  if (input.eye === null) {
    return "eye";
  }
  if (input.correction === null) {
    return "wearing";
  }
  if (!input.distanceConfirmed) {
    return "distance";
  }
  return null;
}

export function landoltStartMessage(hint: LandoltStartHint, distanceMm: number): string | null {
  if (hint === "eye") {
    return MSG_CHOOSE_EYE;
  }
  if (hint === "wearing") {
    return MSG_CHOOSE_WEARING;
  }
  if (hint === "distance") {
    return msgDistanceNotConfirmed(distanceMm);
  }
  return null;
}

/** The one result line on the staff screen. */
export function landoltResultLine(result: CResult): string {
  switch (result.kind) {
    case "measured":
      return `Approximately ${customerLabelForStep(result.stepIndex)}`;
    case "test-floor":
      return RESULT_TEST_FLOOR;
    case "screen-limited":
      return `${customerLabelForStep(result.stepIndex)} or better. This screen can’t show smaller sizes reliably.`;
    case "not-measurable":
      if (result.coarsestStepIndex >= C_COARSEST_STEP_INDEX) {
        return RESULT_BELOW_RANGE;
      }
      return `Below the largest size this screen can show (${customerLabelForStep(result.coarsestStepIndex)})`;
    case "inconsistent":
      return RESULT_INCONSISTENT;
  }
}

export function landoltDetailLines(input: {
  eye: LandoltEye;
  correction: RunContext["correction"];
  distanceMm: number;
  scoredCount: number;
  notSureCount: number;
}): string[] {
  return [
    `Eye tested: ${EYE_LABELS[input.eye]}`,
    `Wearing: ${CORRECTION_OPTIONS[input.correction]}`,
    `Distance: ${metresText(input.distanceMm)}`,
    `Cs answered: ${input.scoredCount} (practice not counted)`,
    `Not sure answers: ${input.notSureCount}`,
  ];
}

export type LandoltSizeRow = {
  stepIndex: number;
  size: string;
  cs: number;
  correct: number;
  wrong: number;
  outcome: string;
};

/** One row per size attempt, in the order they were shown. Voids are not counted. */
export function landoltSizeRows(attempts: readonly CAttempt[]): LandoltSizeRow[] {
  return attempts.map((attempt) => ({
    stepIndex: attempt.stepIndex,
    size: customerLabelForStep(attempt.stepIndex),
    cs: attempt.correct + attempt.wrong,
    correct: attempt.correct,
    wrong: attempt.wrong,
    outcome:
      attempt.passed === true
        ? OUTCOME_PASSED
        : attempt.passed === false
          ? OUTCOME_FAILED
          : OUTCOME_NOT_FINISHED,
  }));
}

export function eyeLabel(eye: LandoltEye): string {
  return EYE_LABELS[eye];
}

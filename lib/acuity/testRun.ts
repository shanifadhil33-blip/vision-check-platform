/**
 * Rebuild a staircase from saved answers, and shape the test-quality payload.
 * Pure state in, new state out (AGENTS.md rule 1).
 */

import type { RunContext, RunResult } from "@/lib/session/loopState";
import { customerLabelForStep } from "./resultLabel";
import { isResponseCorrect } from "./isResponseCorrect";
import type { SloanLetter } from "./sloan";
import { recordTrial, startStaircase, type StaircaseState } from "./staircase";

export type ReplayTrial = {
  trialIndex: number;
  stepIndex: number;
  target: SloanLetter;
  responseKind: "letter" | "not_sure";
  responseLetter: SloanLetter | null;
};

export type ReplayRunResult =
  | {
      status: "ok";
      staircase: StaircaseState;
      voidedTrialIndices: number[];
      nextTrialIndex: number;
    }
  | { status: "inconsistent"; reason: string };

/**
 * recordTrial requires a Sloan letter even when the outcome is void.
 * A voided trial that was answered uses that trial's target.
 * An index that was presented and never answered has no target in the
 * replay input, so the letter passed is "C", the first Sloan letter.
 * The outcome is void, so the letter is kept and not scored.
 */
const UNANSWERED_PRESENTED_LETTER: SloanLetter = "C";

function inconsistent(reason: string): ReplayRunResult {
  return { status: "inconsistent", reason };
}

export function replayRun(input: {
  stepIndices: readonly number[];
  answered: readonly ReplayTrial[];
  voidedTrialIndices: readonly number[];
  highestPresentedTrialIndex: number | null;
}): ReplayRunResult {
  let started: ReturnType<typeof startStaircase>;
  try {
    started = startStaircase(input.stepIndices);
  } catch (error) {
    if (error instanceof RangeError) {
      return inconsistent(error.message);
    }
    throw error;
  }
  if (started.status !== "running") {
    return inconsistent("staircase cannot start");
  }

  if (
    input.highestPresentedTrialIndex !== null &&
    !Number.isInteger(input.highestPresentedTrialIndex)
  ) {
    return inconsistent("highest presented trial index must be an integer or null");
  }

  const byIndex = new Map<number, ReplayTrial>();
  let highestAnswered = -1;
  for (const trial of input.answered) {
    if (!Number.isInteger(trial.trialIndex) || trial.trialIndex < 0) {
      return inconsistent("answered trial index must be a non-negative integer");
    }
    if (byIndex.has(trial.trialIndex)) {
      return inconsistent(`duplicate answer at trial ${trial.trialIndex}`);
    }
    byIndex.set(trial.trialIndex, trial);
    if (trial.trialIndex > highestAnswered) {
      highestAnswered = trial.trialIndex;
    }
  }

  const highestPresented =
    input.highestPresentedTrialIndex === null ? -1 : input.highestPresentedTrialIndex;
  const highest = Math.max(highestAnswered, highestPresented);
  if (highest < 0) {
    return {
      status: "ok",
      staircase: started,
      voidedTrialIndices: [],
      nextTrialIndex: 0,
    };
  }

  const voidedInput = new Set(input.voidedTrialIndices);
  const voidedTrialIndices: number[] = [];
  let staircase: StaircaseState = started;

  for (let trialIndex = 0; trialIndex <= highest; trialIndex += 1) {
    if (staircase.status !== "running") {
      return inconsistent(`trial ${trialIndex} is after the staircase finished`);
    }

    const answered = byIndex.get(trialIndex);
    if (answered !== undefined && answered.stepIndex !== staircase.currentStepIndex) {
      return inconsistent(
        `trial ${trialIndex} was shown at step ${answered.stepIndex} but the staircase is at step ${staircase.currentStepIndex}`,
      );
    }

    const unanswered = answered === undefined;
    if (voidedInput.has(trialIndex) || unanswered) {
      const letter = answered !== undefined ? answered.target : UNANSWERED_PRESENTED_LETTER;
      staircase = recordTrial(staircase, { letter, outcome: "void" });
      voidedTrialIndices.push(trialIndex);
      continue;
    }

    const correct = isResponseCorrect(
      answered.responseKind,
      answered.responseLetter,
      answered.target,
    );
    staircase = recordTrial(staircase, {
      letter: answered.target,
      outcome: correct ? "correct" : "incorrect",
    });
  }

  return {
    status: "ok",
    staircase,
    voidedTrialIndices,
    nextTrialIndex: highest + 1,
  };
}

export function notSureCount(
  answered: readonly ReplayTrial[],
  voidedTrialIndices: readonly number[],
): number {
  const voided = new Set(voidedTrialIndices);
  let count = 0;
  for (const trial of answered) {
    if (trial.responseKind === "not_sure" && !voided.has(trial.trialIndex)) {
      count += 1;
    }
  }
  return count;
}

export type TestQualityPayload = {
  distance_requested_mm: number;
  renderable_finest_logmar: number;
  renderable_coarsest_logmar: number;
  finest_limited_by: RunContext["finestLimitedBy"];
  coarsest_limited_by: RunContext["coarsestLimitedBy"];
  screen_limited: boolean;
  bounded_result_reason: RunResult["kind"];
  not_sure_count: number;
  interruptions: number;
  final_logmar_step_index?: number;
  final_snellen_label?: string;
};

export function testQualityPayload(input: {
  result: RunResult;
  run: RunContext;
  distanceMm: number;
  notSureCount: number;
}): TestQualityPayload {
  const finestStepIndex = input.run.stepIndices[0];
  const coarsestStepIndex = input.run.stepIndices[input.run.stepIndices.length - 1];
  if (finestStepIndex === undefined || coarsestStepIndex === undefined) {
    throw new RangeError("run step indices are empty");
  }

  const payload: TestQualityPayload = {
    distance_requested_mm: input.distanceMm,
    renderable_finest_logmar: finestStepIndex / 10,
    renderable_coarsest_logmar: coarsestStepIndex / 10,
    finest_limited_by: input.run.finestLimitedBy,
    coarsest_limited_by: input.run.coarsestLimitedBy,
    screen_limited: input.result.kind === "screen-limited",
    bounded_result_reason: input.result.kind,
    not_sure_count: input.notSureCount,
    interruptions: input.run.voidedTrialIndices.length,
  };

  if (input.result.kind !== "not-measurable") {
    payload.final_logmar_step_index = input.result.stepIndex;
    payload.final_snellen_label = customerLabelForStep(input.result.stepIndex);
  }

  return payload;
}

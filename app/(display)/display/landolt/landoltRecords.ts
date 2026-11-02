/**
 * What the Landolt C page saves, as pure builders: no document, no network.
 * The controller passes the C it drew; every saved size and direction is
 * read from that one object.
 */

import { mmToCssPx } from "@/lib/calibration";
import { DEFAULT_TEST_DISTANCE_MM } from "@/lib/acuity/distanceSetup";
import { letterHeightMmForLogMar, strokeWidthMmForLogMar } from "@/lib/acuity/logmar";
import type { CAttempt, CResult, LandoltDirection } from "@/lib/acuity/landoltStaircase";
import { customerLabelForStep } from "@/lib/acuity/resultLabel";
import type { LandoltEye } from "@/lib/acuity/landoltWording";
import type { PresentationPayload } from "@/lib/db/payloads";
import type { Json } from "@/lib/db/types";
import type { LandoltRunContext, RunContext } from "@/lib/session/loopState";

export const LANDOLT_CLIENT_BUILD = "m7-landolt-1";

/** Closes a session left open by a reload of the C page. */
export const RELOAD_CLOSE_REASON = "landolt_reload";

/** The C as drawn: the canvas reports these same values back after drawing. */
export type ShownC = {
  readonly trialIndex: number;
  readonly stepIndex: number;
  readonly direction: LandoltDirection;
  readonly practice: boolean;
};

export function landoltPresentationPayload(input: {
  shown: ShownC;
  eye: LandoltEye;
  distanceMm: number;
  cssPxPerMm: number;
  devicePixelRatio: number;
  actualLetterHeightDevicePx: number;
  renderedAtIso: string;
  visibilityConfirmed: boolean;
}): PresentationPayload {
  const logMar = input.shown.stepIndex / 10;
  const letterHeightMm = letterHeightMmForLogMar(logMar, input.distanceMm);
  const strokeWidthMm = strokeWidthMmForLogMar(logMar, input.distanceMm);
  const letterHeightCssPx = mmToCssPx(letterHeightMm, input.cssPxPerMm);
  return {
    trial_index: input.shown.trialIndex,
    eye: input.eye,
    logmar_step_index: input.shown.stepIndex,
    requested_letter_height_mm: letterHeightMm,
    requested_stroke_width_mm: strokeWidthMm,
    requested_letter_height_css_px: letterHeightCssPx,
    requested_letter_height_device_px: letterHeightCssPx * input.devicePixelRatio,
    optotypes: ["C"],
    target_index: 0,
    format: "landolt",
    distance_mm_requested: input.distanceMm,
    actual_letter_height_device_px: input.actualLetterHeightDevicePx,
    rendered_at: input.renderedAtIso,
    visibility_confirmed: input.visibilityConfirmed,
    landolt_direction: input.shown.direction,
    is_practice: input.shown.practice,
  };
}

export function landoltTestStartedPayload(input: {
  run: LandoltRunContext;
  distanceMm: number;
}): { [key: string]: Json } {
  return {
    test_mode: "landolt",
    eye: input.run.eye,
    correction: input.run.correction,
    distance_mm: input.distanceMm,
    step_indices: [...input.run.stepIndices],
    finest_limited_by: input.run.finestLimitedBy,
    coarsest_limited_by: input.run.coarsestLimitedBy,
    client_build: LANDOLT_CLIENT_BUILD,
  };
}

/** Event c_size_closed, one per size the module closes. */
export function cSizeClosedPayload(attempt: CAttempt): { [key: string]: Json } {
  return {
    step_index: attempt.stepIndex,
    outcomes: [...attempt.outcomes],
    correct: attempt.correct,
    wrong: attempt.wrong,
    not_sure: attempt.notSure,
    voids: attempt.voids,
    passed: attempt.passed,
  };
}

export type LandoltTestQualityPayload = {
  distance_requested_mm: number;
  distance_recommended_mm: number;
  distance_chosen_mm: number;
  renderable_finest_logmar: number;
  renderable_coarsest_logmar: number;
  finest_limited_by: RunContext["finestLimitedBy"];
  coarsest_limited_by: RunContext["coarsestLimitedBy"];
  screen_limited: boolean;
  not_sure_count: number;
  interruptions: number;
  test_mode: "landolt";
  bounded_result_reason?: Exclude<CResult["kind"], "measured">;
  final_logmar_step_index?: number;
  final_snellen_label?: string;
};

/**
 * The test_quality row for a finished C run. final_* is written for measured,
 * test-floor and screen-limited; bounded_result_reason for every kind but measured.
 * interruptions counts scored voids only: a voided practice C keeps its
 * trial_voided event but is left out of the count.
 */
export function landoltTestQualityPayload(input: {
  result: CResult;
  run: LandoltRunContext;
  distanceMm: number;
  notSureCount: number;
  practiceTrialIndices: readonly number[];
}): LandoltTestQualityPayload {
  const finestStepIndex = input.run.stepIndices[0];
  const coarsestStepIndex = input.run.stepIndices[input.run.stepIndices.length - 1];
  if (finestStepIndex === undefined || coarsestStepIndex === undefined) {
    throw new RangeError("run step indices are empty");
  }
  const payload: LandoltTestQualityPayload = {
    distance_requested_mm: input.distanceMm,
    distance_recommended_mm: DEFAULT_TEST_DISTANCE_MM,
    distance_chosen_mm: input.distanceMm,
    renderable_finest_logmar: finestStepIndex / 10,
    renderable_coarsest_logmar: coarsestStepIndex / 10,
    finest_limited_by: input.run.finestLimitedBy,
    coarsest_limited_by: input.run.coarsestLimitedBy,
    screen_limited: input.result.kind === "screen-limited",
    not_sure_count: input.notSureCount,
    interruptions: scoredVoidCount(input.run.voidedTrialIndices, input.practiceTrialIndices),
    test_mode: "landolt",
  };
  if (input.result.kind !== "measured") {
    payload.bounded_result_reason = input.result.kind;
  }
  if (
    input.result.kind === "measured" ||
    input.result.kind === "test-floor" ||
    input.result.kind === "screen-limited"
  ) {
    payload.final_logmar_step_index = input.result.stepIndex;
    payload.final_snellen_label = customerLabelForStep(input.result.stepIndex);
  }
  return payload;
}

function scoredVoidCount(
  voidedTrialIndices: readonly number[],
  practiceTrialIndices: readonly number[],
): number {
  const practice = new Set(practiceTrialIndices);
  return voidedTrialIndices.filter((trialIndex) => !practice.has(trialIndex)).length;
}

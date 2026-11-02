import { describe, expect, it } from "vitest";
import type { LandoltRunContext } from "@/lib/session/loopState";
import {
  cSizeClosedPayload,
  LANDOLT_CLIENT_BUILD,
  landoltPresentationPayload,
  landoltTestQualityPayload,
  landoltTestStartedPayload,
} from "./landoltRecords";

const RUN: LandoltRunContext = {
  correction: "glasses",
  stepIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  finestLimitedBy: "screen-resolution",
  coarsestLimitedBy: "requested-bound",
  voidedTrialIndices: [4, 9],
  testMode: "landolt",
  eye: "right",
};

const COMMON = {
  distance_requested_mm: 3000,
  distance_recommended_mm: 3000,
  distance_chosen_mm: 3000,
  renderable_finest_logmar: 0,
  renderable_coarsest_logmar: 1,
  finest_limited_by: "screen-resolution",
  coarsest_limited_by: "requested-bound",
  not_sure_count: 3,
  interruptions: 2,
  test_mode: "landolt",
};

function quality(result: Parameters<typeof landoltTestQualityPayload>[0]["result"]) {
  return landoltTestQualityPayload({
    result,
    run: RUN,
    distanceMm: 3000,
    notSureCount: 3,
    practiceTrialIndices: [],
  });
}

describe("landoltTestQualityPayload", () => {
  it("measured: final step and label, no bounded reason", () => {
    expect(quality({ kind: "measured", stepIndex: 2 })).toEqual({
      ...COMMON,
      screen_limited: false,
      final_logmar_step_index: 2,
      final_snellen_label: "6/9",
    });
  });

  it("test-floor: bounded reason, final step -1 and 6/5", () => {
    expect(quality({ kind: "test-floor", stepIndex: -1 })).toEqual({
      ...COMMON,
      screen_limited: false,
      bounded_result_reason: "test-floor",
      final_logmar_step_index: -1,
      final_snellen_label: "6/5",
    });
  });

  it("screen-limited: screen_limited true, bounded reason, final step and label", () => {
    expect(quality({ kind: "screen-limited", stepIndex: 0 })).toEqual({
      ...COMMON,
      screen_limited: true,
      bounded_result_reason: "screen-limited",
      final_logmar_step_index: 0,
      final_snellen_label: "6/6",
    });
  });

  it("not-measurable: bounded reason, no final step", () => {
    expect(quality({ kind: "not-measurable", coarsestStepIndex: 10 })).toEqual({
      ...COMMON,
      screen_limited: false,
      bounded_result_reason: "not-measurable",
    });
  });

  it("inconsistent: bounded reason, no final step", () => {
    expect(quality({ kind: "inconsistent" })).toEqual({
      ...COMMON,
      screen_limited: false,
      bounded_result_reason: "inconsistent",
    });
  });

  it("refuses an empty step list", () => {
    expect(() =>
      landoltTestQualityPayload({
        result: { kind: "inconsistent" },
        run: { ...RUN, stepIndices: [] },
        distanceMm: 3000,
        notSureCount: 0,
        practiceTrialIndices: [],
      }),
    ).toThrow(RangeError);
  });

  it("interruptions counts scored voids only: 1 practice void and 2 scored voids give 2", () => {
    const payload = landoltTestQualityPayload({
      result: { kind: "measured", stepIndex: 2 },
      run: { ...RUN, voidedTrialIndices: [1, 4, 9] },
      distanceMm: 3000,
      notSureCount: 3,
      practiceTrialIndices: [0, 1],
    });
    expect(payload.interruptions).toBe(2);
  });

  it("interruptions is 0 when only practice Cs were voided", () => {
    const payload = landoltTestQualityPayload({
      result: { kind: "measured", stepIndex: 2 },
      run: { ...RUN, voidedTrialIndices: [0, 1] },
      distanceMm: 3000,
      notSureCount: 3,
      practiceTrialIndices: [0, 1],
    });
    expect(payload.interruptions).toBe(0);
  });
});

describe("landoltPresentationPayload", () => {
  it("records format landolt, one C at index 0, the eye, the drawn direction and practice flag, letter-style sizes", () => {
    const payload = landoltPresentationPayload({
      shown: { trialIndex: 5, stepIndex: 10, direction: "left", practice: true },
      eye: "left",
      distanceMm: 3000,
      cssPxPerMm: 4,
      devicePixelRatio: 2,
      actualLetterHeightDevicePx: 349,
      renderedAtIso: "2026-11-01T12:00:00.000Z",
      visibilityConfirmed: true,
    });
    expect(payload).toMatchObject({
      trial_index: 5,
      eye: "left",
      logmar_step_index: 10,
      optotypes: ["C"],
      target_index: 0,
      format: "landolt",
      distance_mm_requested: 3000,
      actual_letter_height_device_px: 349,
      rendered_at: "2026-11-01T12:00:00.000Z",
      visibility_confirmed: true,
      landolt_direction: "left",
      is_practice: true,
    });
    expect(payload.requested_letter_height_mm).toBeCloseTo(43.6335, 9);
    expect(payload.requested_stroke_width_mm).toBeCloseTo(8.7267, 9);
    expect(payload.requested_letter_height_css_px).toBeCloseTo(174.534, 9);
    expect(payload.requested_letter_height_device_px).toBeCloseTo(349.068, 9);
    expect("crowding_spec" in payload).toBe(false);
    expect("actual_stroke_width_device_px" in payload).toBe(false);
  });
});

describe("landoltTestStartedPayload", () => {
  it("has exactly the agreed keys, in order", () => {
    expect(JSON.stringify(landoltTestStartedPayload({ run: RUN, distanceMm: 2000 }))).toBe(
      `{"test_mode":"landolt","eye":"right","correction":"glasses","distance_mm":2000,"step_indices":[0,1,2,3,4,5,6,7,8,9,10],"finest_limited_by":"screen-resolution","coarsest_limited_by":"requested-bound","client_build":"${LANDOLT_CLIENT_BUILD}"}`,
    );
    expect(LANDOLT_CLIENT_BUILD).toBe("m7-landolt-1");
  });
});

describe("cSizeClosedPayload", () => {
  it("records step, outcomes, counts and whether the size passed", () => {
    expect(
      cSizeClosedPayload({
        stepIndex: 3,
        outcomes: ["correct", "void", "not_sure", "incorrect"],
        correct: 1,
        wrong: 2,
        notSure: 1,
        voids: 1,
        passed: false,
      }),
    ).toEqual({
      step_index: 3,
      outcomes: ["correct", "void", "not_sure", "incorrect"],
      correct: 1,
      wrong: 2,
      not_sure: 1,
      voids: 1,
      passed: false,
    });
  });
});

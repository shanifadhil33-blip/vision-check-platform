import { describe, expect, it } from "vitest";
import type { RunContext } from "../session/loopState";
import type { SloanLetter } from "./sloan";
import {
  notSureCount,
  replayRun,
  setupCheck,
  testQualityPayload,
  type ReplayTrial,
} from "./testRun";

const FULL_STEPS = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function letterTrial(
  trialIndex: number,
  stepIndex: number,
  target: SloanLetter,
  responseLetter: SloanLetter,
): ReplayTrial {
  return {
    trialIndex,
    stepIndex,
    target,
    responseKind: "letter",
    responseLetter,
  };
}

function correctAt(trialIndex: number, stepIndex: number): ReplayTrial {
  return letterTrial(trialIndex, stepIndex, "C", "C");
}

function wrongAt(trialIndex: number, stepIndex: number): ReplayTrial {
  return letterTrial(trialIndex, stepIndex, "C", "D");
}

function notSureAt(trialIndex: number, stepIndex: number): ReplayTrial {
  return {
    trialIndex,
    stepIndex,
    target: "C",
    responseKind: "not_sure",
    responseLetter: null,
  };
}

function runWith(overrides: Partial<RunContext> & Pick<RunContext, "stepIndices">): RunContext {
  return {
    correction: "glasses",
    finestLimitedBy: "requested-bound",
    coarsestLimitedBy: "requested-bound",
    voidedTrialIndices: [],
    ...overrides,
  };
}

describe("replayRun", () => {
  it("R1 finishes at the test floor after five correct levels from 3 down to -1", () => {
    const answered: ReplayTrial[] = [];
    let trialIndex = 0;
    for (const stepIndex of [3, 2, 1, 0, -1]) {
      for (let offset = 0; offset < 5; offset += 1) {
        answered.push(correctAt(trialIndex, stepIndex));
        trialIndex += 1;
      }
    }

    const result = replayRun({
      stepIndices: FULL_STEPS,
      answered,
      voidedTrialIndices: [],
      highestPresentedTrialIndex: null,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.staircase.status).toBe("finished");
    if (result.staircase.status !== "finished") {
      return;
    }
    expect(result.staircase.result).toEqual({ kind: "test-floor", stepIndex: -1 });
    expect(result.voidedTrialIndices).toEqual([]);
    expect(result.nextTrialIndex).toBe(25);
  });

  it("R2 passes level 3 on 3 of 5 scored when one trial is voided", () => {
    const answered: ReplayTrial[] = [
      correctAt(0, 3),
      correctAt(1, 3),
      correctAt(2, 3),
      correctAt(3, 3),
      wrongAt(4, 3),
      wrongAt(5, 3),
    ];

    const result = replayRun({
      stepIndices: FULL_STEPS,
      answered,
      voidedTrialIndices: [2],
      highestPresentedTrialIndex: 5,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.staircase.status).toBe("running");
    if (result.staircase.status !== "running") {
      return;
    }
    expect(result.staircase.currentStepIndex).toBe(2);
    expect(result.voidedTrialIndices).toEqual([2]);
    expect(result.nextTrialIndex).toBe(6);
    const level = result.staircase.levels.find((entry) => entry.stepIndex === 3);
    expect(level).toMatchObject({
      scored: 5,
      correct: 3,
      passed: true,
      outcomes: ["correct", "correct", "void", "correct", "incorrect", "incorrect"],
    });
  });

  it("R3 records an unanswered presented trial as void and keeps four scored letters", () => {
    const answered: ReplayTrial[] = [
      correctAt(0, 3),
      correctAt(1, 3),
      correctAt(2, 3),
      correctAt(3, 3),
    ];

    const result = replayRun({
      stepIndices: FULL_STEPS,
      answered,
      voidedTrialIndices: [],
      highestPresentedTrialIndex: 4,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.staircase.status).toBe("running");
    if (result.staircase.status !== "running") {
      return;
    }
    expect(result.staircase.currentStepIndex).toBe(3);
    expect(result.voidedTrialIndices).toEqual([4]);
    expect(result.nextTrialIndex).toBe(5);
    const level = result.staircase.levels.find((entry) => entry.stepIndex === 3);
    expect(level).toMatchObject({ scored: 4, outcomes: ["correct", "correct", "correct", "correct", "void"] });
  });

  it("R4 is inconsistent when the first answer is at step 2 and the start is 3", () => {
    const result = replayRun({
      stepIndices: FULL_STEPS,
      answered: [correctAt(0, 2)],
      voidedTrialIndices: [],
      highestPresentedTrialIndex: null,
    });
    expect(result.status).toBe("inconsistent");
  });

  it("R5 fails level 3 on 2 correct, 2 not sure and 1 wrong, and counts 2 not sure", () => {
    const answered: ReplayTrial[] = [
      correctAt(0, 3),
      correctAt(1, 3),
      notSureAt(2, 3),
      notSureAt(3, 3),
      wrongAt(4, 3),
    ];

    const result = replayRun({
      stepIndices: FULL_STEPS,
      answered,
      voidedTrialIndices: [],
      highestPresentedTrialIndex: null,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.staircase.status).toBe("running");
    if (result.staircase.status !== "running") {
      return;
    }
    expect(result.staircase.currentStepIndex).toBe(4);
    const level = result.staircase.levels.find((entry) => entry.stepIndex === 3);
    expect(level).toMatchObject({ scored: 5, correct: 2, passed: false });
    expect(notSureCount(answered, [])).toBe(2);
  });
});

describe("notSureCount", () => {
  it("R6 does not count a not sure answer on a voided trial", () => {
    expect(notSureCount([notSureAt(0, 3)], [0])).toBe(0);
  });
});

describe("testQualityPayload", () => {
  it("Q1 builds the measured quality payload", () => {
    expect(
      testQualityPayload({
        result: { kind: "measured", stepIndex: 2 },
        run: runWith({ stepIndices: FULL_STEPS }),
        distanceMm: 2000,
        notSureCount: 1,
      }),
    ).toEqual({
      distance_requested_mm: 2000,
      renderable_finest_logmar: -0.1,
      renderable_coarsest_logmar: 1,
      finest_limited_by: "requested-bound",
      coarsest_limited_by: "requested-bound",
      screen_limited: false,
      bounded_result_reason: "measured",
      not_sure_count: 1,
      interruptions: 0,
      final_logmar_step_index: 2,
      final_snellen_label: "6/9",
    });
  });

  it("Q2 labels a test-floor result at -1 as 6/5", () => {
    const payload = testQualityPayload({
      result: { kind: "test-floor", stepIndex: -1 },
      run: runWith({ stepIndices: FULL_STEPS }),
      distanceMm: 2000,
      notSureCount: 0,
    });
    expect(payload.final_snellen_label).toBe("6/5");
    expect(payload.screen_limited).toBe(false);
    expect(payload.bounded_result_reason).toBe("test-floor");
  });

  it("Q3 marks a screen-limited result and counts the void as an interruption", () => {
    const payload = testQualityPayload({
      result: { kind: "screen-limited", stepIndex: 5 },
      run: runWith({
        stepIndices: [5, 6, 7, 8, 9, 10],
        finestLimitedBy: "screen-resolution",
        voidedTrialIndices: [7],
      }),
      distanceMm: 3000,
      notSureCount: 0,
    });
    expect(payload.screen_limited).toBe(true);
    expect(payload.renderable_finest_logmar).toBe(0.5);
    expect(payload.final_snellen_label).toBe("6/18");
    expect(payload.interruptions).toBe(1);
    expect(payload.distance_requested_mm).toBe(3000);
  });

  it("Q4 omits final step and label when the result is not measurable", () => {
    const payload = testQualityPayload({
      result: { kind: "not-measurable", coarsestStepIndex: 10 },
      run: runWith({ stepIndices: FULL_STEPS }),
      distanceMm: 2000,
      notSureCount: 0,
    });
    expect(payload).not.toHaveProperty("final_logmar_step_index");
    expect(payload).not.toHaveProperty("final_snellen_label");
    expect(payload.bounded_result_reason).toBe("not-measurable");
  });

  it("Q5 reports a measured result as measured when the finest level is limited by screen resolution", () => {
    const payload = testQualityPayload({
      result: { kind: "measured", stepIndex: 2 },
      run: runWith({
        stepIndices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        finestLimitedBy: "screen-resolution",
      }),
      distanceMm: 2000,
      notSureCount: 0,
    });
    expect(payload.screen_limited).toBe(false);
    expect(payload.bounded_result_reason).toBe("measured");
    expect(payload.final_snellen_label).toBe("6/9");
  });
});

describe("setupCheck", () => {
  const drawable = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  it("S1 returns ok when validity, zoom and the current step all pass", () => {
    expect(
      setupCheck({
        validityOk: true,
        zoomState: "default",
        drawableStepIndices: drawable,
        currentStepIndex: 3,
      }),
    ).toBe("ok");
  });

  it("S2 returns calibration before zoom or window when validity has failed", () => {
    expect(
      setupCheck({
        validityOk: false,
        zoomState: "not-default",
        drawableStepIndices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        currentStepIndex: 0,
      }),
    ).toBe("calibration");
  });

  it("S3 returns zoom when zoom is not default and the rest is fine", () => {
    expect(
      setupCheck({
        validityOk: true,
        zoomState: "not-default",
        drawableStepIndices: drawable,
        currentStepIndex: 3,
      }),
    ).toBe("zoom");
  });

  it("S4 returns ok when zoom is unknown and the rest is fine", () => {
    expect(
      setupCheck({
        validityOk: true,
        zoomState: "unknown",
        drawableStepIndices: drawable,
        currentStepIndex: 3,
      }),
    ).toBe("ok");
  });

  it("S5 returns window when the current step is not drawable", () => {
    expect(
      setupCheck({
        validityOk: true,
        zoomState: "default",
        drawableStepIndices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        currentStepIndex: 0,
      }),
    ).toBe("window");
  });

  it("S6 returns ok when there is no current step, even if nothing is drawable", () => {
    expect(
      setupCheck({
        validityOk: true,
        zoomState: "default",
        drawableStepIndices: [],
        currentStepIndex: null,
      }),
    ).toBe("ok");
  });
});

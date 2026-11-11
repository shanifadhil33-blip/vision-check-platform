import { describe, expect, it } from "vitest";
import { decideDistance, letterHeightMmForDecision, type ScreenGeometry, smoothedDistanceMm } from "./decide";
import {
  initialMovementState,
  type MovementContext,
  type MovementState,
  onClockTick,
  onDistanceReading,
} from "./movementState";
import { MOVEMENT_PARAMS } from "./params";

/** A 1920 x 1080 laptop at DPR 1.5 with 4.176 CSS px per mm, maximised Chrome. */
const LAPTOP: ScreenGeometry = {
  pixelPitchMm: 1 / (4.176 * 1.5),
  cssPxPerMm: 4.176,
  viewportWidthCssPx: 1280,
  viewportHeightCssPx: 585,
  format: "flanked-triplet",
};

const STEP_6_60 = 10;

/** Five identical estimates 250 ms apart, the latest at 1000 ms, decided at 1100 ms, default params. */
function decideAtDefaults(confirmedDistanceMm: number, smoothedMm: number) {
  return decideDistance({
    confirmedDistanceMm,
    estimatesMm: [smoothedMm, smoothedMm, smoothedMm, smoothedMm, smoothedMm],
    estimateTimesMs: [0, 250, 500, 750, 1000],
    lastReadingAtMs: 1000,
    nowMs: 1100,
    stepIndex: STEP_6_60,
    screen: LAPTOP,
  });
}

describe("decision at the default thresholds", () => {
  it("the defaults are the trial values", () => {
    expect(MOVEMENT_PARAMS).toEqual({
      deadbandFraction: 0.05,
      maxResizeFraction: 0.25,
      smoothing: { kind: "time-window", windowMs: 2000, minReadings: 3 },
      lostAfterMs: 2000,
      resumeAfterReadings: 4,
    });
  });

  it("D0 3000, D 3150: f exactly 0.05 keeps the confirmed distance (inclusive)", () => {
    const decision = decideAtDefaults(3000, 3150);
    expect(decision.kind).toBe("keep");
    expect(decision.kind === "keep" && decision.effectiveDistanceMm).toBe(3000);
  });

  it("D0 3000, D 3160: resize, 6/60 is 45.9606 mm", () => {
    // 3160 x 0.00029089 x 5 x 10 = 45.96062
    const decision = decideAtDefaults(3000, 3160);
    expect(decision.kind).toBe("resize");
    if (decision.kind !== "resize") {
      return;
    }
    expect(decision.effectiveDistanceMm).toBe(3160);
    expect(letterHeightMmForDecision(STEP_6_60, decision)).toBeCloseTo(45.9606, 4);
  });
});

describe("time-window smoothing", () => {
  it("only estimates from the last 2000 ms count; one exactly 2000 ms old is outside", () => {
    // At 3000 ms the window is (1000, 3000]: 3000, 3010, 3020 are inside; 4000 at 1000 is not.
    const estimatesMm = [4000, 3000, 3010, 3020];
    const estimateTimesMs = [1000, 1250, 2000, 3000];
    expect(smoothedDistanceMm(estimatesMm, MOVEMENT_PARAMS, { estimateTimesMs, nowMs: 3000 })).toBe(3010);
  });

  it("with fewer than 3 in the window, the latest 3 are used", () => {
    const estimatesMm = [4000, 3000, 5000, 3020];
    const estimateTimesMs = [0, 100, 200, 2900];
    // Only 3020 is inside (900, 2900]; the latest three are 3000, 5000, 3020: median 3020.
    expect(smoothedDistanceMm(estimatesMm, MOVEMENT_PARAMS, { estimateTimesMs, nowMs: 2900 })).toBe(3020);
  });
});

function context(letterOnScreen: boolean): MovementContext {
  return { confirmedDistanceMm: 3000, stepIndex: STEP_6_60, screen: LAPTOP, letterOnScreen };
}

describe("lost and resume at the default thresholds", () => {
  it("last reading at 0 ms: tracking at 1999 ms, paused lost at 2000 ms", () => {
    const { state } = onDistanceReading(initialMovementState(), { estimateMm: 3000, atMs: 0 }, context(true));
    expect(onClockTick(state, 1999, context(true)).action).toEqual({ kind: "none" });
    expect(onClockTick(state, 2000, context(true)).action).toEqual({ kind: "pause", reason: "lost", voidLetter: true });
  });

  it("from a pause, 3 good readings stay paused and the 4th resumes", () => {
    let state: MovementState = {
      phase: "paused-lost",
      estimatesMm: [],
      estimateTimesMs: [],
      lastReadingAtMs: null,
      goodReadingsInRow: 0,
    };
    const actions: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const result = onDistanceReading(state, { estimateMm: 3010, atMs: i * 250 }, context(false));
      state = result.state;
      actions.push(result.action.kind);
    }
    expect(actions).toEqual(["none", "none", "none", "resume"]);
    expect(state.phase).toBe("tracking");
  });

  it("keeps only what the window can use: old estimates are dropped once 3 newer ones exist", () => {
    let state = initialMovementState();
    for (let i = 0; i < 20; i += 1) {
      state = onDistanceReading(state, { estimateMm: 3000 + i, atMs: i * 250 }, context(false)).state;
    }
    // Newest at 4750 ms: the window (2750, 4750] holds 8 estimates.
    expect(state.estimatesMm).toEqual([3012, 3013, 3014, 3015, 3016, 3017, 3018, 3019]);
    expect(state.estimateTimesMs).toEqual([3000, 3250, 3500, 3750, 4000, 4250, 4500, 4750]);
  });
});

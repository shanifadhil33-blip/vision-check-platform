import { describe, expect, it } from "vitest";
import { canRenderLogMar, maxPixelPitchMmForLogMar } from "@/lib/acuity/renderableRange";
import {
  decideDistance,
  type DistanceDecision,
  letterHeightMmForDecision,
  median,
  type ScreenGeometry,
} from "./decide";
import type { MovementParams } from "./params";

/** The thresholds these worked values were written against, before the hand-held trial. */
const OLD_PARAMS: MovementParams = {
  deadbandFraction: 0.03,
  maxResizeFraction: 0.25,
  smoothing: { kind: "latest-count", readings: 5 },
  lostAfterMs: 1500,
  resumeAfterReadings: 3,
};

/** A 1920 x 1080 laptop at DPR 1.5 with 4.176 CSS px per mm, maximised Chrome. */
const LAPTOP: ScreenGeometry = {
  pixelPitchMm: 1 / (4.176 * 1.5),
  cssPxPerMm: 4.176,
  viewportWidthCssPx: 1280,
  viewportHeightCssPx: 585,
  format: "flanked-triplet",
};

const STEP_6_60 = 10;
const STEP_6_5 = -1;

/** Five identical estimates, the latest at 0 ms, decided at 100 ms. */
function decideAt(confirmedDistanceMm: number, smoothedMm: number, stepIndex: number, screen = LAPTOP) {
  return decideDistance({
    confirmedDistanceMm,
    estimatesMm: [smoothedMm, smoothedMm, smoothedMm, smoothedMm, smoothedMm],
    lastReadingAtMs: 0,
    nowMs: 100,
    stepIndex,
    screen,
    params: OLD_PARAMS,
  });
}

function height(stepIndex: number, decision: DistanceDecision): number {
  if (decision.kind !== "keep" && decision.kind !== "resize") {
    throw new Error(`expected keep or resize, got ${decision.kind}`);
  }
  return letterHeightMmForDecision(stepIndex, decision);
}

describe("decision for one smoothed distance", () => {
  it("D0 3000, D 3060: f 0.02 is inside the deadband, effective 3000, 6/60 is 43.634 mm (exactly 43.6335)", () => {
    const decision = decideAt(3000, 3060, STEP_6_60);
    expect(decision.kind).toBe("keep");
    expect(decision.kind === "keep" && decision.effectiveDistanceMm).toBe(3000);
    expect(height(STEP_6_60, decision)).toBeCloseTo(43.6335, 4);
  });

  it("D0 3000, D 3150: f 0.05 resizes, 6/60 is 45.815 mm (further, larger)", () => {
    // 3150 x 0.00029089 x 5 x 10 = 45.8152. The brief says 45.816, which is 43.634 x 1.05
    // from an already-rounded height; the formula itself gives 45.815.
    const decision = decideAt(3000, 3150, STEP_6_60);
    expect(decision.kind).toBe("resize");
    expect(decision.kind === "resize" && decision.effectiveDistanceMm).toBe(3150);
    expect(height(STEP_6_60, decision)).toBeCloseTo(45.8152, 4);
  });

  it("D0 2000, D 2500: f exactly 0.25 still resizes (inclusive), 6/60 is 36.361 mm", () => {
    const decision = decideAt(2000, 2500, STEP_6_60);
    expect(decision.kind).toBe("resize");
    expect(height(STEP_6_60, decision)).toBeCloseTo(36.36125, 4);
  });

  it("D0 2000, D 2520: f 0.26 is over the limit, pause because moved", () => {
    const decision = decideAt(2000, 2520, STEP_6_60);
    expect(decision).toMatchObject({ kind: "moved", reason: "beyond-max-resize" });
  });

  it("D0 2000, D 1800 at 6/5 with a 0.311 mm pixel pitch: pause, not drawable at 1800", () => {
    const coarseScreen: ScreenGeometry = {
      pixelPitchMm: 0.311,
      cssPxPerMm: 1 / 0.311,
      viewportWidthCssPx: 1920,
      viewportHeightCssPx: 1080,
      format: "flanked-triplet",
    };
    // Carkeet floor at 1800 mm for logMAR -0.1: 0.6 x 10^-0.1 x 1800 x 0.00029089 = 0.24955 mm.
    // The pixels (0.311 mm) are coarser than that, so the existing rule says no.
    expect(maxPixelPitchMmForLogMar(-0.1, 1800)).toBeCloseTo(0.24955, 5);
    expect(canRenderLogMar(-0.1, 1800, 0.311)).toBe(false);
    // f = -0.1 is inside the resize limit, so it is rule 3 (not drawable) that pauses.
    const decision = decideAt(2000, 1800, STEP_6_5, coarseScreen);
    expect(decision).toMatchObject({ kind: "moved", reason: "not-drawable" });
    expect(decision.kind === "moved" && decision.fraction).toBeCloseTo(-0.1, 10);
  });
});

describe("smoothing", () => {
  it("median of 3000, 3010, 3600, 2990, 3005 is 3005", () => {
    expect(median([3000, 3010, 3600, 2990, 3005])).toBe(3005);
  });

  it("one wild estimate does not move D: those five at D0 3000 keep the size", () => {
    const decision = decideDistance({
      confirmedDistanceMm: 3000,
      estimatesMm: [3000, 3010, 3600, 2990, 3005],
      lastReadingAtMs: 0,
      nowMs: 10,
      stepIndex: STEP_6_60,
      screen: LAPTOP,
      params: OLD_PARAMS,
    });
    expect(decision).toMatchObject({ kind: "keep", smoothedDistanceMm: 3005 });
  });
});

/**
 * Turns distance estimates into a decision for one moment. Pure numbers in,
 * a decision out. No timers: the time comes in as an argument, in ms.
 *
 * D0 = the confirmed test distance. D = median of the latest estimates.
 * f = (D − D0) / D0. Decision order:
 *   1. lost: no estimate yet, or the latest is lostAfterMs old or older
 *   2. moved: |f| over maxResizeFraction
 *   3. moved: the current level is not drawable at D
 *   4. keep: |f| within deadbandFraction, letters drawn at D0
 *   5. resize: letters drawn at D
 */

import { letterHeightMmForLogMar } from "@/lib/acuity/logmar";
import { computeTestLevels, type TestFormat } from "@/lib/acuity/testLevels";
import { MOVEMENT_PARAMS, type MovementParams } from "./params";

/** The screen, as the existing level logic needs it. */
export type ScreenGeometry = {
  pixelPitchMm: number;
  cssPxPerMm: number;
  viewportWidthCssPx: number;
  viewportHeightCssPx: number;
  format: TestFormat;
};

export type DistanceDecision =
  | { kind: "lost" }
  | {
      kind: "moved";
      reason: "beyond-max-resize" | "not-drawable";
      smoothedDistanceMm: number;
      fraction: number;
    }
  | { kind: "keep"; effectiveDistanceMm: number; smoothedDistanceMm: number; fraction: number }
  | { kind: "resize"; effectiveDistanceMm: number; smoothedDistanceMm: number; fraction: number };

/** True when the decision stops the test. */
export function isPauseDecision(decision: DistanceDecision): boolean {
  return decision.kind === "lost" || decision.kind === "moved";
}

/** Median of a non-empty list; the mean of the two middle values when the count is even. */
export function median(values: readonly number[]): number {
  if (values.length === 0) {
    return Number.NaN;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle]!;
  }
  return (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/** D: the median of the last smoothingWindow estimates. */
export function smoothedDistanceMm(
  estimatesMm: readonly number[],
  params: Readonly<MovementParams> = MOVEMENT_PARAMS,
): number {
  return median(estimatesMm.slice(-params.smoothingWindow));
}

/** f = (D − D0) / D0. Positive when the person is further away than the mark. */
export function distanceFraction(smoothedMm: number, confirmedDistanceMm: number): number {
  return (smoothedMm - confirmedDistanceMm) / confirmedDistanceMm;
}

/**
 * Whether this level can be drawn at distance D, by the existing rules:
 * computeTestLevels runs canRenderLogMar (pixel pitch) and levelFitsViewport
 * (window size) for every tested step at the distance it is given.
 */
export function isLevelDrawableAt(
  stepIndex: number,
  distanceMm: number,
  screen: ScreenGeometry,
): boolean {
  if (!Number.isFinite(distanceMm) || distanceMm <= 0) {
    return false;
  }
  const levels = computeTestLevels({
    distanceMm,
    pixelPitchMm: screen.pixelPitchMm,
    cssPxPerMm: screen.cssPxPerMm,
    viewportWidthCssPx: screen.viewportWidthCssPx,
    viewportHeightCssPx: screen.viewportHeightCssPx,
    format: screen.format,
  });
  return levels.stepIndices.includes(stepIndex);
}

export function decideDistance(input: {
  confirmedDistanceMm: number;
  estimatesMm: readonly number[];
  lastReadingAtMs: number | null;
  nowMs: number;
  stepIndex: number;
  screen: ScreenGeometry;
  params?: Readonly<MovementParams>;
}): DistanceDecision {
  const params = input.params ?? MOVEMENT_PARAMS;
  if (
    input.estimatesMm.length === 0 ||
    input.lastReadingAtMs === null ||
    input.nowMs - input.lastReadingAtMs >= params.lostAfterMs
  ) {
    return { kind: "lost" };
  }

  const smoothedMm = smoothedDistanceMm(input.estimatesMm, params);
  const fraction = distanceFraction(smoothedMm, input.confirmedDistanceMm);

  if (Math.abs(fraction) > params.maxResizeFraction) {
    return { kind: "moved", reason: "beyond-max-resize", smoothedDistanceMm: smoothedMm, fraction };
  }
  if (!isLevelDrawableAt(input.stepIndex, smoothedMm, input.screen)) {
    return { kind: "moved", reason: "not-drawable", smoothedDistanceMm: smoothedMm, fraction };
  }
  if (Math.abs(fraction) <= params.deadbandFraction) {
    return {
      kind: "keep",
      effectiveDistanceMm: input.confirmedDistanceMm,
      smoothedDistanceMm: smoothedMm,
      fraction,
    };
  }
  return { kind: "resize", effectiveDistanceMm: smoothedMm, smoothedDistanceMm: smoothedMm, fraction };
}

/**
 * Letter height for a NEW letter: the existing logMAR formula at the
 * effective distance. Closer (smaller D) gives a smaller letter, further a
 * larger one, because height is proportional to distance.
 */
export function letterHeightMmForDecision(
  stepIndex: number,
  decision: Extract<DistanceDecision, { kind: "keep" | "resize" }>,
): number {
  return letterHeightMmForLogMar(stepIndex / 10, decision.effectiveDistanceMm);
}

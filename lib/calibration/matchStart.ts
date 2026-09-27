import { disagreementPercent } from "./matchAgreement";

/** Smallest fractional offset from the last final. */
export const START_OFFSET_MIN_FRACTION = 0.08;

/** Largest fractional offset from the last final. */
export const START_OFFSET_MAX_FRACTION = 0.15;

/** A start width must be at least this percent away from every earlier final. */
export const START_MIN_SEPARATION_PERCENT = 5;

function isUnitInterval(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value < 1;
}

function clampedInteger(widthCssPx: number, minCssPx: number, maxCssPx: number): number {
  return Math.min(maxCssPx, Math.max(minCssPx, Math.round(widthCssPx)));
}

function minimumDisagreement(widthCssPx: number, previousFinalsCssPx: readonly number[]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const previousCssPx of previousFinalsCssPx) {
    const disagreement = disagreementPercent(widthCssPx, previousCssPx);
    if (disagreement < minimum) {
      minimum = disagreement;
    }
  }
  return minimum;
}

function separatedFromEveryFinal(
  widthCssPx: number,
  previousFinalsCssPx: readonly number[],
): boolean {
  for (const previousCssPx of previousFinalsCssPx) {
    if (disagreementPercent(widthCssPx, previousCssPx) < START_MIN_SEPARATION_PERCENT) {
      return false;
    }
  }
  return true;
}

/**
 * Starting width for the next card match. offsetRandom and directionRandom
 * are in [0, 1). The primary direction is up when directionRandom is below 0.5.
 */
export function pickStartWidthCssPx(input: {
  previousFinalsCssPx: readonly number[];
  minCssPx: number;
  maxCssPx: number;
  offsetRandom: number;
  directionRandom: number;
}): number {
  if (input.previousFinalsCssPx.length === 0) {
    throw new RangeError("pickStartWidthCssPx requires a previous final.");
  }
  if (!isUnitInterval(input.offsetRandom) || !isUnitInterval(input.directionRandom)) {
    throw new RangeError("offsetRandom and directionRandom must be in [0, 1).");
  }

  const lastCssPx = input.previousFinalsCssPx[input.previousFinalsCssPx.length - 1];
  if (lastCssPx === undefined) {
    throw new RangeError("pickStartWidthCssPx requires a previous final.");
  }

  const offset =
    START_OFFSET_MIN_FRACTION +
    input.offsetRandom * (START_OFFSET_MAX_FRACTION - START_OFFSET_MIN_FRACTION);
  const primaryUp = input.directionRandom < 0.5;
  const primaryCssPx = clampedInteger(
    primaryUp ? lastCssPx * (1 + offset) : lastCssPx * (1 - offset),
    input.minCssPx,
    input.maxCssPx,
  );
  const oppositeCssPx = clampedInteger(
    primaryUp ? lastCssPx * (1 - offset) : lastCssPx * (1 + offset),
    input.minCssPx,
    input.maxCssPx,
  );

  if (separatedFromEveryFinal(primaryCssPx, input.previousFinalsCssPx)) {
    return primaryCssPx;
  }
  if (separatedFromEveryFinal(oppositeCssPx, input.previousFinalsCssPx)) {
    return oppositeCssPx;
  }

  const primaryMinimum = minimumDisagreement(primaryCssPx, input.previousFinalsCssPx);
  const oppositeMinimum = minimumDisagreement(oppositeCssPx, input.previousFinalsCssPx);
  if (oppositeMinimum > primaryMinimum) {
    return oppositeCssPx;
  }
  return primaryCssPx;
}

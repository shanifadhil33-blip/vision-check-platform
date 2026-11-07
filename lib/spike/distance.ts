/**
 * Distance from marker size against a baseline. Apparent length scales as
 * 1 / distance, so distance = baseline distance × baseline px / current px.
 */

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite number greater than 0`);
  }
}

/** Ratio = baseline px / current px. Above 1 means further away than the baseline. */
export function baselineRatio(baselineSizeCameraPx: number, currentSizeCameraPx: number): number {
  assertPositiveFinite("baselineSizeCameraPx", baselineSizeCameraPx);
  assertPositiveFinite("currentSizeCameraPx", currentSizeCameraPx);
  return baselineSizeCameraPx / currentSizeCameraPx;
}

/** Estimated distance = baseline distance × baseline px / current px. */
export function estimatedDistanceMm(
  baselineDistanceMm: number,
  baselineSizeCameraPx: number,
  currentSizeCameraPx: number,
): number {
  assertPositiveFinite("baselineDistanceMm", baselineDistanceMm);
  return baselineDistanceMm * baselineRatio(baselineSizeCameraPx, currentSizeCameraPx);
}

/**
 * Acuity size maths from VISION-CHECK-PLATFORM.md section 5.4.
 *
 * logMAR 0.0 (6/6) is a letter subtending 5 arcmin with stroke 1 arcmin:
 *   stroke_mm = distance_mm × tan(1 arcmin) ≈ distance_mm × 0.00029089
 *   letter_mm = stroke_mm × 5
 *
 * Each +0.1 logMAR scales linear size by 10^0.1:
 *   size_at_logMAR(L) = size_at_0 × 10^L
 * so stroke at L is distance_mm × ARCMIN_TAN × 10^L.
 *
 * Snellen label is display-only: denominator = reference_m × 10^L.
 * Conventional chart labels (6/7.5 not 6/7.6) are preferred on the 0.1 ladder.
 */

/** tan(1 arcmin) ≈ tan(π / (180 × 60)). */
export const ARCMIN_TAN = 0.00029089;

/**
 * Conventional Snellen denominators at 6 m for each 0.1 logMAR step from
 * −0.3 to 1.0 (ETDRS-style labels; 0.1 → 7.5 not the raw 7.553… round).
 */
const CONVENTIONAL_SNELLEN_DENOMINATOR_AT_6M: Readonly<Record<string, string>> = {
  "-0.3": "3",
  "-0.2": "3.8",
  "-0.1": "4.8",
  "0": "6",
  "0.1": "7.5",
  "0.2": "9.5",
  "0.3": "12",
  "0.4": "15",
  "0.5": "19",
  "0.6": "24",
  "0.7": "30",
  "0.8": "38",
  "0.9": "48",
  "1": "60",
};

function logMarLookupKey(logMar: number): string {
  const rounded = Math.round(logMar * 10) / 10;
  if (Object.is(rounded, -0) || rounded === 0) {
    return "0";
  }
  return String(rounded);
}

export function strokeWidthMmForLogMar(logMar: number, distanceMm: number): number {
  return distanceMm * ARCMIN_TAN * 10 ** logMar;
}

export function letterHeightMmForLogMar(logMar: number, distanceMm: number): number {
  return strokeWidthMmForLogMar(logMar, distanceMm) * 5;
}

/** Raw computed Snellen label from denominator = reference_m × 10^logMar. */
export function computedLogMarToSnellenLabel(
  logMar: number,
  referenceDistanceM = 6,
): string {
  const denominator = referenceDistanceM * 10 ** logMar;
  const rounded = Math.round(denominator * 10) / 10;
  const denominatorLabel = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${referenceDistanceM}/${denominatorLabel}`;
}

/**
 * Display Snellen label: conventional chart wording on the −0.3…1.0 ladder
 * at 6 m; otherwise the computed value.
 */
export function logMarToSnellenLabel(logMar: number, referenceDistanceM = 6): string {
  if (referenceDistanceM === 6) {
    const conventional = CONVENTIONAL_SNELLEN_DENOMINATOR_AT_6M[logMarLookupKey(logMar)];
    if (conventional !== undefined) {
      return `6/${conventional}`;
    }
  }
  return computedLogMarToSnellenLabel(logMar, referenceDistanceM);
}

/**
 * Build a ladder from integer step indices so values stay on the intended
 * grid instead of drifting through repeated floating-point addition.
 */
export function logMarLadder(
  minLogMar: number,
  maxLogMar: number,
  stepLogMar = 0.1,
): number[] {
  const minIndex = Math.round(minLogMar / stepLogMar);
  const maxIndex = Math.round(maxLogMar / stepLogMar);
  const values: number[] = [];
  for (let index = minIndex; index <= maxIndex; index += 1) {
    values.push(index * stepLogMar);
  }
  return values;
}

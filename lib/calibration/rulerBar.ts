/** Claimed length of the ruler bar, in millimetres. */
export const RULER_BAR_TARGET_MM = 100;

/** CSS px width of a ruler bar drawn from a px-per-mm estimate. */
export function rulerBarCssPx(input: { cssPxPerMmEstimate: number; maxCssPx: number }): number {
  const roundedCssPx = Math.round(RULER_BAR_TARGET_MM * input.cssPxPerMmEstimate);
  return Math.min(input.maxCssPx, Math.max(1, roundedCssPx));
}

/** cssPxPerMm from a drawn bar and the length a ruler actually measured. */
export function cssPxPerMmFromRulerBar(barCssPx: number, measuredMm: number): number {
  if (!Number.isFinite(barCssPx) || barCssPx <= 0 || !Number.isFinite(measuredMm) || measuredMm <= 0) {
    throw new RangeError("Ruler bar width and measured length must be finite and greater than 0.");
  }
  return barCssPx / measuredMm;
}

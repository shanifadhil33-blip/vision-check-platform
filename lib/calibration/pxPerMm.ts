import { CARD_HEIGHT_MM, CARD_WIDTH_MM } from "./card";

/** Millimetres in one inch (for diagonal reporting only; never used as CSS). */
const MM_PER_INCH = 25.4;

export function cssPxPerMmFromCardWidth(cardWidthCssPx: number): number {
  return cardWidthCssPx / CARD_WIDTH_MM;
}

export function cardHeightCssPxFromWidth(cardWidthCssPx: number): number {
  return cardWidthCssPx * (CARD_HEIGHT_MM / CARD_WIDTH_MM);
}

export function physicalPxPerMm(cssPxPerMm: number, devicePixelRatio: number): number {
  return cssPxPerMm * devicePixelRatio;
}

/**
 * Physical size of one device pixel in millimetres. Input for later
 * renderable-range work (VISION-CHECK-PLATFORM.md section 2.2).
 */
export function pixelPitchMm(cssPxPerMm: number, devicePixelRatio: number): number {
  return 1 / physicalPxPerMm(cssPxPerMm, devicePixelRatio);
}

export function mmToCssPx(valueMm: number, cssPxPerMm: number): number {
  return valueMm * cssPxPerMm;
}

export function screenPhysicalSizeMm(
  screenWidthCssPx: number,
  screenHeightCssPx: number,
  cssPxPerMm: number,
): { widthMm: number; heightMm: number; diagonalInches: number } {
  const widthMm = screenWidthCssPx / cssPxPerMm;
  const heightMm = screenHeightCssPx / cssPxPerMm;
  const diagonalMm = Math.hypot(widthMm, heightMm);
  const diagonalInches = diagonalMm / MM_PER_INCH;
  return { widthMm, heightMm, diagonalInches };
}

/**
 * Renderable acuity range from VISION-CHECK-PLATFORM.md sections 2.2 and 5.4.
 * Pure numbers in / numbers out — no browser APIs (AGENTS.md rule 1).
 */

import { pixelPitchMm } from "@/lib/calibration";
import {
  ARCMIN_TAN,
  letterHeightMmForLogMar,
  logMarLadder,
  strokeWidthMmForLogMar,
} from "./logmar";

/**
 * Flanked triplet crowding: flanker + one-letter gap + target + gap + flanker
 * = 5 letter widths across, 1 letter tall (Sloan width equals height).
 */
export const CROWDING_WIDTH_LETTER_MULTIPLE = 5;
export const CROWDING_HEIGHT_LETTER_MULTIPLE = 1;

export type RangeLimit =
  | "screen-resolution" // floor: pixels too coarse
  | "viewport-size" // ceiling: letter plus surround too big
  | "requested-bound"; // hit the caller's own min or max

export type RenderableRange = {
  finestLogMar: number;
  coarsestLogMar: number;
  finestLimitedBy: RangeLimit;
  coarsestLimitedBy: RangeLimit;
  pixelPitchMm: number;
  maxPixelPitchMmAtFinest: number;
  strokeWidthDevicePxAtFinest: number;
  reachesRequestedFinest: boolean;
};

/**
 * Carkeet filtered-optotype floor (section 2.2):
 * max_pixel_pitch_mm = 0.6 × MAR_arcmin × distance_mm × 0.00029089
 * with MAR_arcmin = 10^logMar. Coefficient 0.6 assumes anti-aliasing on.
 */
export function maxPixelPitchMmForLogMar(
  logMar: number,
  distanceMm: number,
  carkeetCoefficient = 0.6,
): number {
  return carkeetCoefficient * 10 ** logMar * distanceMm * ARCMIN_TAN;
}

export function canRenderLogMar(
  logMar: number,
  distanceMm: number,
  pixelPitchMmValue: number,
  carkeetCoefficient = 0.6,
): boolean {
  return (
    pixelPitchMmValue <=
    maxPixelPitchMmForLogMar(logMar, distanceMm, carkeetCoefficient)
  );
}

function letterFitsViewport(
  logMar: number,
  distanceMm: number,
  cssPxPerMm: number,
  viewportWidthCssPx: number,
  viewportHeightCssPx: number,
): boolean {
  const letterHeightMm = letterHeightMmForLogMar(logMar, distanceMm);
  const letterHeightCssPx = letterHeightMm * cssPxPerMm;
  const widthNeededCssPx = letterHeightCssPx * CROWDING_WIDTH_LETTER_MULTIPLE;
  const heightNeededCssPx = letterHeightCssPx * CROWDING_HEIGHT_LETTER_MULTIPLE;
  return widthNeededCssPx <= viewportWidthCssPx && heightNeededCssPx <= viewportHeightCssPx;
}

function emptyRange(pixelPitchMmValue: number): RenderableRange {
  return {
    finestLogMar: Number.NaN,
    coarsestLogMar: Number.NaN,
    finestLimitedBy: "screen-resolution",
    coarsestLimitedBy: "viewport-size",
    pixelPitchMm: pixelPitchMmValue,
    maxPixelPitchMmAtFinest: Number.NaN,
    strokeWidthDevicePxAtFinest: Number.NaN,
    reachesRequestedFinest: false,
  };
}

export function computeRenderableRange(input: {
  cssPxPerMm: number;
  devicePixelRatio: number;
  viewportWidthCssPx: number;
  viewportHeightCssPx: number;
  distanceMm: number;
  requestedFinestLogMar?: number;
  requestedCoarsestLogMar?: number;
  /** @deprecated Flanked-triplet geometry uses 5× width and 1× height; this is ignored. */
  crowdingMultiple?: number;
  carkeetCoefficient?: number;
}): RenderableRange {
  void input.crowdingMultiple;

  // Default −0.1 (6/5): one rung better than normal vision. −0.3 (6/3) is
  // beyond a home test and made the floor almost always 'requested-bound'.
  const requestedFinestLogMar = input.requestedFinestLogMar ?? -0.1;
  const requestedCoarsestLogMar = input.requestedCoarsestLogMar ?? 1.0;
  const carkeetCoefficient = input.carkeetCoefficient ?? 0.6;
  const pitchMm = pixelPitchMm(input.cssPxPerMm, input.devicePixelRatio);
  const ladder = logMarLadder(requestedFinestLogMar, requestedCoarsestLogMar);

  const renderable = ladder.filter(
    (logMar) =>
      canRenderLogMar(logMar, input.distanceMm, pitchMm, carkeetCoefficient) &&
      letterFitsViewport(
        logMar,
        input.distanceMm,
        input.cssPxPerMm,
        input.viewportWidthCssPx,
        input.viewportHeightCssPx,
      ),
  );

  if (renderable.length === 0) {
    return emptyRange(pitchMm);
  }

  const finestLogMar = renderable[0]!;
  const coarsestLogMar = renderable[renderable.length - 1]!;
  const reachesRequestedFinest = canRenderLogMar(
    requestedFinestLogMar,
    input.distanceMm,
    pitchMm,
    carkeetCoefficient,
  );

  const finestLimitedBy: RangeLimit = reachesRequestedFinest
    ? "requested-bound"
    : "screen-resolution";

  const coarsestFitsRequested = letterFitsViewport(
    requestedCoarsestLogMar,
    input.distanceMm,
    input.cssPxPerMm,
    input.viewportWidthCssPx,
    input.viewportHeightCssPx,
  );
  const coarsestLimitedBy: RangeLimit = coarsestFitsRequested
    ? "requested-bound"
    : "viewport-size";

  const strokeWidthMm = strokeWidthMmForLogMar(finestLogMar, input.distanceMm);
  const strokeWidthDevicePxAtFinest =
    strokeWidthMm * input.cssPxPerMm * input.devicePixelRatio;

  return {
    finestLogMar,
    coarsestLogMar,
    finestLimitedBy,
    coarsestLimitedBy,
    pixelPitchMm: pitchMm,
    maxPixelPitchMmAtFinest: maxPixelPitchMmForLogMar(
      finestLogMar,
      input.distanceMm,
      carkeetCoefficient,
    ),
    strokeWidthDevicePxAtFinest,
    reachesRequestedFinest,
  };
}

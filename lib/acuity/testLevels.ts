/**
 * Which logMAR step indices this screen can draw at this distance.
 * Pure numbers in, step indices out (AGENTS.md rule 1).
 */

import { letterHeightMmForLogMar } from "./logmar";
import { canRenderLogMar, CROWDING_WIDTH_LETTER_MULTIPLE } from "./renderableRange";

/** Finest step the test is allowed to use: logMAR −0.3. */
export const FINEST_TESTED_STEP_INDEX = -3;

/** Coarsest step the test is allowed to use: logMAR 1.0. */
export const COARSEST_TESTED_STEP_INDEX = 10;

/** Clear space kept inside each viewport edge, in CSS pixels. */
export const VIEWPORT_MARGIN_CSS_PX = 64;

/** Extra CSS pixels below the letter for the response arrow. */
export const ARROW_ALLOWANCE_CSS_PX = 48;

export type TestFormat = "flanked-triplet" | "single";

export type LevelLimit = "screen-resolution" | "viewport-size" | "requested-bound";

export type TestLevels = {
  stepIndices: number[];
  finestLimitedBy: LevelLimit;
  coarsestLimitedBy: LevelLimit;
};

function assertPositiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite number greater than 0`);
  }
}

function widthLetterMultiple(format: TestFormat): number {
  if (format === "flanked-triplet") {
    return CROWDING_WIDTH_LETTER_MULTIPLE;
  }
  return 1;
}

/**
 * A level is drawable when it passes the Carkeet pitch check, and it fits when
 * the row is no wider than the viewport minus the margin and the letter plus
 * the arrow allowance is no taller than the viewport minus the margin.
 * Same inequality direction as the flanked-triplet filter: exclude a level
 * when widthMultiple * h > width − 64, or h + 48 > height − 64.
 */
function levelFitsViewport(
  letterHeightCssPx: number,
  widthMultiple: number,
  viewportWidthCssPx: number,
  viewportHeightCssPx: number,
): boolean {
  const widthNeededCssPx = widthMultiple * letterHeightCssPx;
  const heightNeededCssPx = letterHeightCssPx + ARROW_ALLOWANCE_CSS_PX;
  return (
    widthNeededCssPx <= viewportWidthCssPx - VIEWPORT_MARGIN_CSS_PX &&
    heightNeededCssPx <= viewportHeightCssPx - VIEWPORT_MARGIN_CSS_PX
  );
}

export function computeTestLevels(input: {
  distanceMm: number;
  pixelPitchMm: number;
  cssPxPerMm: number;
  viewportWidthCssPx: number;
  viewportHeightCssPx: number;
  format: TestFormat;
}): TestLevels {
  assertPositiveFinite("distanceMm", input.distanceMm);
  assertPositiveFinite("pixelPitchMm", input.pixelPitchMm);
  assertPositiveFinite("cssPxPerMm", input.cssPxPerMm);
  assertPositiveFinite("viewportWidthCssPx", input.viewportWidthCssPx);
  assertPositiveFinite("viewportHeightCssPx", input.viewportHeightCssPx);

  const widthMultiple = widthLetterMultiple(input.format);
  const stepIndices: number[] = [];
  let finestDrawable = false;
  let coarsestFits = false;

  for (
    let stepIndex = FINEST_TESTED_STEP_INDEX;
    stepIndex <= COARSEST_TESTED_STEP_INDEX;
    stepIndex += 1
  ) {
    const logMar = stepIndex / 10;
    const drawable = canRenderLogMar(logMar, input.distanceMm, input.pixelPitchMm);
    const letterHeightCssPx =
      letterHeightMmForLogMar(logMar, input.distanceMm) * input.cssPxPerMm;
    const fits = levelFitsViewport(
      letterHeightCssPx,
      widthMultiple,
      input.viewportWidthCssPx,
      input.viewportHeightCssPx,
    );

    if (stepIndex === FINEST_TESTED_STEP_INDEX) {
      finestDrawable = drawable;
    }
    if (stepIndex === COARSEST_TESTED_STEP_INDEX) {
      coarsestFits = fits;
    }
    if (drawable && fits) {
      stepIndices.push(stepIndex);
    }
  }

  const finestLimitedBy: LevelLimit = stepIndices.includes(FINEST_TESTED_STEP_INDEX)
    ? "requested-bound"
    : finestDrawable
      ? "viewport-size"
      : "screen-resolution";

  const coarsestLimitedBy: LevelLimit = stepIndices.includes(COARSEST_TESTED_STEP_INDEX)
    ? "requested-bound"
    : coarsestFits
      ? "screen-resolution"
      : "viewport-size";

  return { stepIndices, finestLimitedBy, coarsestLimitedBy };
}

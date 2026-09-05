export {
  ARCMIN_TAN,
  computedLogMarToSnellenLabel,
  letterHeightMmForLogMar,
  logMarLadder,
  logMarToSnellenLabel,
  strokeWidthMmForLogMar,
} from "./logmar";

export {
  SLOAN_GRID_UNITS,
  SLOAN_LETTERS,
  SLOAN_STROKE_UNITS,
  sloanPath,
  validateAllSloanPaths,
  validateSloanPath,
} from "./sloan";
export type { SloanLetter, SloanPathValidation } from "./sloan";

export {
  measureAllRuns,
  measureInkBounds,
  measureStrokeWidth,
} from "./measure";
export type { InkBounds, InkRun } from "./measure";

export {
  canRenderLogMar,
  computeRenderableRange,
  CROWDING_HEIGHT_LETTER_MULTIPLE,
  CROWDING_WIDTH_LETTER_MULTIPLE,
  maxPixelPitchMmForLogMar,
} from "./renderableRange";
export type { RangeLimit, RenderableRange } from "./renderableRange";

export { describeBoundedResult, describeRenderableRange } from "./boundedResult";

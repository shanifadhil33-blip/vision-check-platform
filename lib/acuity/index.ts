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

export {
  ARROW_ALLOWANCE_CSS_PX,
  COARSEST_TESTED_STEP_INDEX,
  computeTestLevels,
  FINEST_TESTED_STEP_INDEX,
  VIEWPORT_MARGIN_CSS_PX,
} from "./testLevels";
export type { LevelLimit, TestFormat, TestLevels } from "./testLevels";

export {
  LETTERS_PER_LEVEL,
  PASS_MARK,
  pickNextTarget,
  recordTrial,
  START_STEP_INDEX,
  startStaircase,
} from "./staircase";
export type {
  FinishedStaircase,
  LevelRecord,
  RunningStaircase,
  StaircaseResult,
  StaircaseState,
  TrialOutcome,
} from "./staircase";

export { CUSTOMER_LABELS, customerLabelForStep } from "./resultLabel";

export { isResponseCorrect } from "./isResponseCorrect";

export { notSureCount, replayRun, testQualityPayload } from "./testRun";
export type { ReplayRunResult, ReplayTrial, TestQualityPayload } from "./testRun";

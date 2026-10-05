export {
  CARD_ASPECT_RATIO,
  CARD_CORNER_RADIUS_MM,
  CARD_HEIGHT_MM,
  CARD_WIDTH_MM,
} from "./card";
export {
  cardHeightCssPxFromWidth,
  cssPxPerMmFromCardWidth,
  mmToCssPx,
  physicalPxPerMm,
  pixelPitchMm,
  screenPhysicalSizeMm,
} from "./pxPerMm";
export { formatDiagnosticsLine } from "./diagnostics";
export {
  MATCH_AGREEMENT_LIMIT_PERCENT,
  disagreementPercent,
  evaluateMatches,
} from "./matchAgreement";
export type { MatchEvaluation } from "./matchAgreement";
export {
  START_MIN_SEPARATION_PERCENT,
  START_OFFSET_MAX_FRACTION,
  START_OFFSET_MIN_FRACTION,
  pickStartWidthCssPx,
} from "./matchStart";
export { isPlausiblePixelPitch } from "./plausibility";
export {
  RULER_BAR_TARGET_MM,
  cssPxPerMmFromRulerBar,
  rulerBarCssPx,
} from "./rulerBar";
export type {
  Calibration,
  CalibrationMethod,
  CalibrationVerification,
  CardMatchAgreement,
  CardMatchAttempt,
  DeviceContext,
  PlausibilityResult,
  RulerBarMeasurement,
  ValidityResult,
} from "./types";
export { calibrationForTestRecord } from "./forTestRecord";
export { isCalibrationStillValid } from "./validity";
export {
  ZOOM_SIGNAL_DEFAULT_TOLERANCE,
  zoomSignal,
  type ZoomSignal,
  type ZoomSignalState,
} from "./zoomSignal";

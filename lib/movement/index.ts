export {
  MAX_KEPT_ESTIMATES,
  MOVEMENT_DEFAULT_ON,
  MOVEMENT_PARAMS,
  type MovementParams,
  type SmoothingRule,
} from "./params";
export {
  decideDistance,
  distanceFraction,
  type DistanceDecision,
  type EstimateTiming,
  isLevelDrawableAt,
  isPauseDecision,
  letterHeightMmForDecision,
  median,
  type ScreenGeometry,
  smoothedDistanceMm,
  smoothingSampleMm,
} from "./decide";
export {
  initialMovementState,
  type MovementAction,
  type MovementContext,
  type MovementPhase,
  type MovementState,
  type NextLetterPlan,
  onClockTick,
  onDistanceReading,
  planNextLetter,
} from "./movementState";

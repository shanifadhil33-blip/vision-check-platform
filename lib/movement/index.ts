export { MOVEMENT_PARAMS, type MovementParams } from "./params";
export {
  decideDistance,
  distanceFraction,
  type DistanceDecision,
  isLevelDrawableAt,
  isPauseDecision,
  letterHeightMmForDecision,
  median,
  type ScreenGeometry,
  smoothedDistanceMm,
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

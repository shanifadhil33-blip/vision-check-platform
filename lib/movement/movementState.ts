/**
 * Movement state across readings and letters. Pure reducers: every function
 * takes the state and returns a new state plus what the caller must do.
 * No timers and no React; the time always comes in as an argument, in ms.
 *
 * Rules:
 *   - A letter already on screen never changes size.
 *   - A pause condition while a letter is on screen voids that letter and pauses.
 *   - A small move while a letter is on screen changes nothing until the next letter.
 *   - From either pause, resume needs resumeAfterReadings consecutive smoothed
 *     readings that would not pause.
 */

import {
  decideDistance,
  type DistanceDecision,
  isPauseDecision,
  letterHeightMmForDecision,
  type ScreenGeometry,
} from "./decide";
import { MOVEMENT_PARAMS, type MovementParams } from "./params";

export type MovementPhase = "tracking" | "paused-moved" | "paused-lost";

export type MovementState = {
  phase: MovementPhase;
  /** Latest estimates, oldest first, at most smoothingWindow long. */
  estimatesMm: number[];
  lastReadingAtMs: number | null;
  /** While paused: consecutive readings in a row that would not pause. */
  goodReadingsInRow: number;
};

/** What the test does next with this letter or this pause. */
export type MovementAction =
  | { kind: "none" }
  | { kind: "pause"; reason: "moved" | "lost"; voidLetter: boolean }
  | { kind: "resume" };

export type MovementContext = {
  confirmedDistanceMm: number;
  stepIndex: number;
  screen: ScreenGeometry;
  /** True while a letter is being shown and not yet answered. */
  letterOnScreen: boolean;
  params?: Readonly<MovementParams>;
};

export type NextLetterPlan =
  | {
      kind: "show";
      effectiveDistanceMm: number;
      letterHeightMm: number;
      decision: Extract<DistanceDecision, { kind: "keep" | "resize" }>;
    }
  | { kind: "pause"; reason: "moved" | "lost" };

export function initialMovementState(): MovementState {
  return { phase: "tracking", estimatesMm: [], lastReadingAtMs: null, goodReadingsInRow: 0 };
}

function decide(state: MovementState, nowMs: number, context: MovementContext): DistanceDecision {
  return decideDistance({
    confirmedDistanceMm: context.confirmedDistanceMm,
    estimatesMm: state.estimatesMm,
    lastReadingAtMs: state.lastReadingAtMs,
    nowMs,
    stepIndex: context.stepIndex,
    screen: context.screen,
    params: context.params ?? MOVEMENT_PARAMS,
  });
}

function pauseReason(decision: DistanceDecision): "moved" | "lost" {
  return decision.kind === "lost" ? "lost" : "moved";
}

function pausedPhase(reason: "moved" | "lost"): MovementPhase {
  return reason === "lost" ? "paused-lost" : "paused-moved";
}

/**
 * One new distance estimate from the camera. A non-finite or non-positive
 * estimate is not a reading and is ignored, so silence still leads to lost.
 */
export function onDistanceReading(
  state: MovementState,
  reading: { estimateMm: number; atMs: number },
  context: MovementContext,
): { state: MovementState; action: MovementAction; decision: DistanceDecision } {
  const params = context.params ?? MOVEMENT_PARAMS;
  if (!Number.isFinite(reading.estimateMm) || reading.estimateMm <= 0) {
    return { state, action: { kind: "none" }, decision: decide(state, reading.atMs, context) };
  }
  const next: MovementState = {
    ...state,
    estimatesMm: [...state.estimatesMm, reading.estimateMm].slice(-params.smoothingWindow),
    lastReadingAtMs: reading.atMs,
  };
  const decision = decide(next, reading.atMs, context);

  if (next.phase === "tracking") {
    if (isPauseDecision(decision)) {
      const reason = pauseReason(decision);
      return {
        state: { ...next, phase: pausedPhase(reason), goodReadingsInRow: 0 },
        action: { kind: "pause", reason, voidLetter: context.letterOnScreen },
        decision,
      };
    }
    // Keep or resize: never touches a letter on screen; the next letter reads it.
    return { state: next, action: { kind: "none" }, decision };
  }

  if (isPauseDecision(decision)) {
    const reason = pauseReason(decision);
    return {
      state: { ...next, phase: pausedPhase(reason), goodReadingsInRow: 0 },
      action: { kind: "none" },
      decision,
    };
  }
  const goodReadingsInRow = next.goodReadingsInRow + 1;
  if (goodReadingsInRow >= params.resumeAfterReadings) {
    return {
      state: { ...next, phase: "tracking", goodReadingsInRow: 0 },
      action: { kind: "resume" },
      decision,
    };
  }
  return { state: { ...next, goodReadingsInRow }, action: { kind: "none" }, decision };
}

/** The clock moved on with no new reading: only the lost rule can fire. */
export function onClockTick(
  state: MovementState,
  nowMs: number,
  context: MovementContext,
): { state: MovementState; action: MovementAction } {
  const decision = decide(state, nowMs, context);
  if (decision.kind !== "lost") {
    return { state, action: { kind: "none" } };
  }
  if (state.phase === "tracking") {
    return {
      state: { ...state, phase: "paused-lost", goodReadingsInRow: 0 },
      action: { kind: "pause", reason: "lost", voidLetter: context.letterOnScreen },
    };
  }
  return { state: { ...state, phase: "paused-lost", goodReadingsInRow: 0 }, action: { kind: "none" } };
}

/**
 * Size for the next letter, decided once when it is put up and then fixed
 * for as long as it is on screen. Pauses instead when the test is paused or
 * the decision now would pause.
 */
export function planNextLetter(
  state: MovementState,
  nowMs: number,
  context: MovementContext,
): NextLetterPlan {
  if (state.phase !== "tracking") {
    return { kind: "pause", reason: state.phase === "paused-lost" ? "lost" : "moved" };
  }
  const decision = decide(state, nowMs, context);
  if (decision.kind === "lost" || decision.kind === "moved") {
    return { kind: "pause", reason: pauseReason(decision) };
  }
  return {
    kind: "show",
    effectiveDistanceMm: decision.effectiveDistanceMm,
    letterHeightMm: letterHeightMmForDecision(context.stepIndex, decision),
    decision,
  };
}

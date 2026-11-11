/**
 * Movement detection on the main screen. Loaded by testController only when
 * the address has movement=1 (dynamic import), so with the switch off none
 * of this, the marker, the broadcasts or the readings code is ever loaded.
 *
 * Takes the phone's distance broadcasts, turns each ratio into an estimate
 * (confirmed distance × ratio), runs lib/movement on them, decides each new
 * letter's size and layout, holds the test while the person is away from
 * their mark, and saves every reading through vcp_record_distance_readings.
 * The controller owns the letters; this owns only the movement state.
 */

import { letterHeightMmForLogMar } from "@/lib/acuity/logmar";
import type { TestFormat } from "@/lib/acuity/testLevels";
import { mmToCssPx, pixelPitchMm } from "@/lib/calibration";
import { type DistanceReading, recordDistanceReadings } from "@/lib/db/distanceReadings";
import type { Json } from "@/lib/db/types";
import {
  initialDistanceStream,
  MOVEMENT_BROADCAST_EVENTS,
  DISTANCE_BASELINE_EVENT,
  DISTANCE_EVENT,
  DISTANCE_UNAVAILABLE_EVENT,
  parseBaselineBroadcast,
  parseUnavailableBroadcast,
  receiveDistance,
  type BaselineBroadcast,
  type DistanceStream,
} from "@/lib/movement/broadcast";
import { type DistanceDecision, isPauseDecision } from "@/lib/movement/decide";
import { letterLayout, type LetterLayout, markerSlot, type MarkerSlot } from "@/lib/movement/markerSlot";
import {
  initialMovementState,
  type MovementContext,
  type MovementState,
  onClockTick,
  onDistanceReading,
  planNextLetter,
} from "@/lib/movement/movementState";
import { MOVEMENT_PARAMS } from "@/lib/movement/params";
import { sendReadingBatches } from "@/lib/movement/readingBatches";
import { joinSessionChannelWithBroadcasts, type SessionChannel } from "@/lib/session/channel";

export const CLOCK_TICK_MS = 250;
export const SAVE_INTERVAL_MS = 2000;
/** Between letters: the check screen waits for this many fresh readings... */
export const CHECK_MIN_FRESH_READINGS = 3;
/** ...or this long, whichever comes first. */
export const CHECK_MAX_MS = 3000;
/**
 * After the countdown, the waiting line stays up at most this long without a
 * baseline; then the test carries on without movement detection. Covers a
 * phone that was closed, killed, or opened without movement=1.
 */
export const BASELINE_WAIT_MAX_MS = 30_000;

export type HoldScreen = "waiting" | "paused-moved" | "paused-lost" | "check";

export type DisplayMovementView = {
  slot: MarkerSlot;
  /** What the hold screen shows, or null when no hold. */
  hold: HoldScreen | null;
  /** How the letter on screen is laid out; null between letters. */
  letterLayout: LetterLayout | null;
  /** The effective distance the letter on screen is drawn and saved at. */
  letterDistanceMm: number | null;
};

export type LetterPlan =
  | {
      kind: "show";
      effectiveDistanceMm: number;
      observedDistanceMm: number;
      layout: LetterLayout;
    }
  /** Movement detection is unavailable: draw and save exactly as with the switch off. */
  | { kind: "plain" }
  | { kind: "hold"; screen: HoldScreen };

export type DisplayMovementHooks = {
  /** Fire and forget; the caller logs failures. */
  appendEvent: (type: string, payload: Json) => void;
  /** A pause condition while a letter is on screen: void it, then hold. */
  pauseLetter: (reason: "moved" | "marker_lost") => void;
  /** A hold is over: put up the next letter. */
  resume: () => void;
  viewChanged: (view: DisplayMovementView | null) => void;
};

export type DisplayMovementDeps = {
  nowMs: () => number;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
  joinChannel: typeof joinSessionChannelWithBroadcasts;
  recordReadings: typeof recordDistanceReadings;
};

const DEFAULT_DEPS: DisplayMovementDeps = {
  nowMs: () => Date.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  joinChannel: joinSessionChannelWithBroadcasts,
  recordReadings: recordDistanceReadings,
};

export type DisplayMovement = {
  joinChannel: (sessionId: string, onNudge: () => void) => SessionChannel;
  planLetter: (stepIndex: number) => LetterPlan;
  /** The staircase's current step, once known (after a reload's replay). */
  setStepIndex: (stepIndex: number) => void;
  letterShown: (plan: Extract<LetterPlan, { kind: "show" }>) => void;
  letterRecorded: (presentationId: string) => void;
  letterEnded: () => void;
  letterScored: (observedDistanceMm: number | undefined) => void;
  viewportChanged: (viewportWidthCssPx: number, viewportHeightCssPx: number) => void;
  view: () => DisplayMovementView | null;
  enabledPayload: () => Json;
  qualityExtras: () => { distance_observed_min_mm: number; distance_observed_max_mm: number } | null;
  isUnavailable: () => boolean;
  flush: () => Promise<void>;
  stop: () => void;
  /** For tests: what a broadcast does when it arrives. */
  receive: (event: string, payload: unknown) => void;
  /** For tests: one clock tick. */
  tick: () => void;
};

export function createDisplayMovement(input: {
  sessionId: string;
  confirmedDistanceMm: number;
  cssPxPerMm: number;
  devicePixelRatio: number;
  viewportWidthCssPx: number;
  viewportHeightCssPx: number;
  format: TestFormat;
  /** The staircase step the first letter will use; null when not known yet. */
  initialStepIndex: number | null;
  hooks: DisplayMovementHooks;
  deps?: DisplayMovementDeps;
}): DisplayMovement {
  const deps = input.deps ?? DEFAULT_DEPS;
  const hooks = input.hooks;
  const confirmedDistanceMm = input.confirmedDistanceMm;
  let viewportWidthCssPx = input.viewportWidthCssPx;
  let viewportHeightCssPx = input.viewportHeightCssPx;
  let slot = slotFor();

  let state: MovementState = initialMovementState();
  let stream: DistanceStream = initialDistanceStream();
  let baseline: BaselineBroadcast | null = null;
  let unavailable: string | null = null;
  /** The step decisions are made for; readings wait in the save queue until it is known. */
  let stepIndex: number | null = input.initialStepIndex;
  let hold: HoldScreen | null = null;
  let letterOnScreen: { layout: LetterLayout; distanceMm: number; presentationId: string | null } | null = null;
  /** A letter was shown with the marker hidden: the next letter waits for a check. */
  let needsCheck = false;
  let checkStartedAtMs: number | null = null;
  let freshReadings = 0;
  let waitStartedAtMs: number | null = null;
  let observedMinMm: number | null = null;
  let observedMaxMm: number | null = null;
  let queue: DistanceReading[] = [];
  let flushChain: Promise<void> = Promise.resolve();
  let stopped = false;

  const tickHandle = deps.setInterval(() => tick(), CLOCK_TICK_MS);
  const saveHandle = deps.setInterval(() => {
    void flush();
  }, SAVE_INTERVAL_MS);

  function slotFor(): MarkerSlot {
    return markerSlot({
      viewportWidthCssPx,
      viewportHeightCssPx,
      cssPxPerMm: input.cssPxPerMm,
      devicePixelRatio: input.devicePixelRatio,
    });
  }

  function context(step: number): MovementContext {
    return {
      confirmedDistanceMm,
      stepIndex: step,
      screen: {
        pixelPitchMm: pixelPitchMm(input.cssPxPerMm, input.devicePixelRatio),
        cssPxPerMm: input.cssPxPerMm,
        viewportWidthCssPx,
        viewportHeightCssPx,
        format: input.format,
      },
      letterOnScreen: letterOnScreen !== null,
      params: MOVEMENT_PARAMS,
    };
  }

  function view(): DisplayMovementView | null {
    if (unavailable !== null && letterOnScreen === null) {
      return null;
    }
    return {
      slot,
      hold,
      letterLayout: letterOnScreen?.layout ?? null,
      letterDistanceMm: letterOnScreen?.distanceMm ?? null,
    };
  }

  function emitView(): void {
    hooks.viewChanged(view());
  }

  function setHold(next: HoldScreen | null): void {
    if (hold !== next) {
      hold = next;
      emitView();
    }
  }

  function startCheck(): void {
    checkStartedAtMs = deps.nowMs();
    freshReadings = 0;
    setHold("check");
  }

  function endHold(): void {
    const wasHolding = hold !== null;
    checkStartedAtMs = null;
    freshReadings = 0;
    setHold(null);
    if (wasHolding) {
      hooks.resume();
    }
  }

  function pausedPayload(reason: "moved" | "marker_lost", decision: DistanceDecision | null): Json {
    const moved = decision !== null && decision.kind === "moved" ? decision : null;
    return {
      reason,
      smoothed_mm: moved?.smoothedDistanceMm ?? null,
      fraction: moved?.fraction ?? null,
    };
  }

  function pause(reason: "moved" | "lost", decision: DistanceDecision | null): void {
    const eventReason = reason === "lost" ? "marker_lost" : "moved";
    hooks.appendEvent("movement_paused", pausedPayload(eventReason, decision));
    checkStartedAtMs = null;
    freshReadings = 0;
    const screen: HoldScreen = reason === "lost" ? "paused-lost" : "paused-moved";
    if (letterOnScreen !== null) {
      letterOnScreen = null;
      hold = screen;
      hooks.pauseLetter(eventReason);
      emitView();
      return;
    }
    setHold(screen);
  }

  function markUnavailable(reason: string, source: "phone" | "main"): void {
    if (unavailable !== null || stopped) {
      return;
    }
    unavailable = reason;
    hooks.appendEvent("movement_unavailable", { reason, source });
    waitStartedAtMs = null;
    endHold();
    emitView();
  }

  function onReading(raw: unknown): void {
    const received = receiveDistance(stream, raw);
    stream = received.stream;
    const reading = received.reading;
    if (reading === null || !reading.found || reading.ratio === null || reading.sizePx === null) {
      return;
    }
    if (baseline === null || unavailable !== null || stopped) {
      return;
    }
    const estimateMm = confirmedDistanceMm * reading.ratio;
    if (stepIndex === null) {
      queue.push({
        method: "marker-camera",
        rawValue: reading.sizePx,
        baselineRatio: reading.ratio,
        absoluteMm: estimateMm,
        flagged: false,
        capturedAtIso: reading.capturedAt,
      });
      return;
    }
    const result = onDistanceReading(state, { estimateMm, atMs: deps.nowMs() }, context(stepIndex));
    state = result.state;
    const saved: DistanceReading = {
      method: "marker-camera",
      rawValue: reading.sizePx,
      baselineRatio: reading.ratio,
      absoluteMm: estimateMm,
      flagged: isPauseDecision(result.decision),
      capturedAtIso: reading.capturedAt,
    };
    if (letterOnScreen !== null && letterOnScreen.presentationId !== null) {
      saved.presentationId = letterOnScreen.presentationId;
    }
    queue.push(saved);

    if (result.action.kind === "pause") {
      pause(result.action.reason, result.decision);
      return;
    }
    if (result.action.kind === "resume") {
      hooks.appendEvent("movement_resumed", {});
      needsCheck = false;
      endHold();
      return;
    }
    if (hold === "check") {
      freshReadings += 1;
      if (freshReadings >= CHECK_MIN_FRESH_READINGS) {
        needsCheck = false;
        endHold();
      }
    }
  }

  function onBaseline(raw: unknown): void {
    const parsed = parseBaselineBroadcast(raw);
    if (parsed === null || baseline !== null || unavailable !== null || stopped) {
      return;
    }
    baseline = parsed;
    hooks.appendEvent("movement_baseline_set", { baseline_px: parsed.baselinePx, frames: parsed.frames });
    waitStartedAtMs = null;
    if (hold === "waiting") {
      startCheck();
    }
  }

  function receive(event: string, payload: unknown): void {
    if (stopped) {
      return;
    }
    if (event === DISTANCE_EVENT) {
      onReading(payload);
    } else if (event === DISTANCE_BASELINE_EVENT) {
      onBaseline(payload);
    } else if (event === DISTANCE_UNAVAILABLE_EVENT) {
      const parsed = parseUnavailableBroadcast(payload);
      if (parsed !== null) {
        markUnavailable(parsed.reason, "phone");
      }
    }
  }

  function tick(): void {
    if (stopped || unavailable !== null) {
      return;
    }
    const nowMs = deps.nowMs();
    if (baseline === null) {
      if (hold === "waiting" && waitStartedAtMs !== null && nowMs - waitStartedAtMs >= BASELINE_WAIT_MAX_MS) {
        markUnavailable("no_baseline", "main");
      }
      return;
    }
    if (hold === "check") {
      if (checkStartedAtMs !== null && nowMs - checkStartedAtMs >= CHECK_MAX_MS) {
        needsCheck = false;
        endHold();
      }
      return;
    }
    // The marker is hidden on purpose while a between-letters letter is up.
    if (letterOnScreen !== null && letterOnScreen.layout === "between-letters") {
      return;
    }
    if (stepIndex === null) {
      return;
    }
    const result = onClockTick(state, nowMs, context(stepIndex));
    state = result.state;
    if (result.action.kind === "pause") {
      pause("lost", null);
    }
  }

  function planLetter(nextStepIndex: number): LetterPlan {
    stepIndex = nextStepIndex;
    if (unavailable !== null) {
      return { kind: "plain" };
    }
    if (baseline === null) {
      waitStartedAtMs ??= deps.nowMs();
      setHold("waiting");
      return { kind: "hold", screen: "waiting" };
    }
    if (state.phase !== "tracking") {
      const screen: HoldScreen = state.phase === "paused-lost" ? "paused-lost" : "paused-moved";
      setHold(screen);
      return { kind: "hold", screen };
    }
    if (needsCheck || state.lastReadingAtMs === null) {
      if (hold !== "check") {
        startCheck();
      }
      return { kind: "hold", screen: "check" };
    }
    const nowMs = deps.nowMs();
    const plan = planNextLetter(state, nowMs, context(nextStepIndex));
    if (plan.kind === "pause") {
      state = {
        ...state,
        phase: plan.reason === "lost" ? "paused-lost" : "paused-moved",
        goodReadingsInRow: 0,
      };
      pause(plan.reason, null);
      const screen: HoldScreen = plan.reason === "lost" ? "paused-lost" : "paused-moved";
      return { kind: "hold", screen };
    }
    const letterHeightCssPx = mmToCssPx(
      letterHeightMmForLogMar(nextStepIndex / 10, plan.effectiveDistanceMm),
      input.cssPxPerMm,
    );
    return {
      kind: "show",
      effectiveDistanceMm: plan.effectiveDistanceMm,
      observedDistanceMm: plan.decision.smoothedDistanceMm,
      layout: letterLayout({ slot, viewportHeightCssPx, letterHeightCssPx }),
    };
  }

  function letterShown(plan: Extract<LetterPlan, { kind: "show" }>): void {
    letterOnScreen = { layout: plan.layout, distanceMm: plan.effectiveDistanceMm, presentationId: null };
    if (plan.layout === "between-letters") {
      needsCheck = true;
    }
    hold = null;
    checkStartedAtMs = null;
    emitView();
  }

  function letterRecorded(presentationId: string): void {
    if (letterOnScreen !== null) {
      letterOnScreen.presentationId = presentationId;
    }
  }

  function letterEnded(): void {
    if (letterOnScreen !== null) {
      letterOnScreen = null;
      emitView();
    }
  }

  function letterScored(observedDistanceMm: number | undefined): void {
    if (observedDistanceMm === undefined || !Number.isFinite(observedDistanceMm)) {
      return;
    }
    observedMinMm = observedMinMm === null ? observedDistanceMm : Math.min(observedMinMm, observedDistanceMm);
    observedMaxMm = observedMaxMm === null ? observedDistanceMm : Math.max(observedMaxMm, observedDistanceMm);
  }

  function flush(): Promise<void> {
    const run = async (): Promise<void> => {
      if (queue.length === 0) {
        return;
      }
      const pending = queue;
      queue = [];
      await sendReadingBatches(
        pending,
        async (batch) => {
          const result = await deps.recordReadings(input.sessionId, batch);
          return result.ok ? { ok: true } : { ok: false, message: result.error.message };
        },
        (message, droppedCount) => {
          console.error("distance readings not saved", message);
          hooks.appendEvent("client_error", {
            reason: "distance_readings_failed",
            message,
            dropped: droppedCount,
          });
        },
      );
    };
    flushChain = flushChain.then(run, run);
    return flushChain;
  }

  return {
    joinChannel(sessionId, onNudge) {
      return deps.joinChannel(sessionId, onNudge, MOVEMENT_BROADCAST_EVENTS, receive);
    },
    planLetter,
    setStepIndex(next) {
      stepIndex = next;
    },
    letterShown,
    letterRecorded,
    letterEnded,
    letterScored,
    viewportChanged(widthCssPx, heightCssPx) {
      if (widthCssPx === viewportWidthCssPx && heightCssPx === viewportHeightCssPx) {
        return;
      }
      viewportWidthCssPx = widthCssPx;
      viewportHeightCssPx = heightCssPx;
      slot = slotFor();
      emitView();
    },
    view,
    enabledPayload() {
      const smoothing = MOVEMENT_PARAMS.smoothing;
      return {
        method: "marker-camera",
        marker_side_mm: slot.drawnSideMm,
        marker_cell_device_px: slot.cellDevicePx,
        deadband_fraction: MOVEMENT_PARAMS.deadbandFraction,
        max_resize_fraction: MOVEMENT_PARAMS.maxResizeFraction,
        smoothing_window_ms: smoothing.kind === "time-window" ? smoothing.windowMs : null,
        smoothing_min_readings: smoothing.kind === "time-window" ? smoothing.minReadings : null,
        lost_after_ms: MOVEMENT_PARAMS.lostAfterMs,
        resume_after_readings: MOVEMENT_PARAMS.resumeAfterReadings,
      };
    },
    qualityExtras() {
      if (observedMinMm === null || observedMaxMm === null) {
        return null;
      }
      return { distance_observed_min_mm: observedMinMm, distance_observed_max_mm: observedMaxMm };
    },
    isUnavailable: () => unavailable !== null,
    flush,
    stop() {
      if (stopped) {
        return;
      }
      stopped = true;
      deps.clearInterval(tickHandle);
      deps.clearInterval(saveHandle);
    },
    receive,
    tick,
  };
}

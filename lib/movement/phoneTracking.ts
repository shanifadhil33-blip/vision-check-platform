/**
 * The phone's own view of its camera readings: the baseline, the ratio it
 * sends, and the status line it shows. Pure numbers; time comes in as ms.
 */

import { median } from "./decide";
import { MOVEMENT_PARAMS } from "./params";

/** Refined sizes the baseline is the median of, taken right after the tap. */
export const BASELINE_FRAMES = 30;
/** No marker this long or longer (inclusive): the phone says it is lost. */
export const PHONE_LOST_AFTER_MS = MOVEMENT_PARAMS.lostAfterMs;
/** |ratio - 1| over this: the phone asks the person to go back. */
export const PHONE_GO_BACK_FRACTION = MOVEMENT_PARAMS.maxResizeFraction;
/** No marker within this long of the tap: movement detection is unavailable. */
export const FIRST_MARKER_TIMEOUT_MS = 10_000;
/** Marker seen but no baseline within this long of the tap: unavailable. */
export const BASELINE_TIMEOUT_MS = 20_000;
/** At most 4 distance broadcasts a second. */
export const MIN_SEND_INTERVAL_MS = 250;
/** The baseline and an unavailable notice are sent again this often, in case one is lost. */
export const RESEND_INTERVAL_MS = 5000;

export type Baseline = { baselinePx: number; frames: number };

/** The median of the first BASELINE_FRAMES sizes; null until there are that many. */
export function baselineFromSizes(sizesCameraPx: readonly number[]): Baseline | null {
  if (sizesCameraPx.length < BASELINE_FRAMES) {
    return null;
  }
  return { baselinePx: median(sizesCameraPx.slice(0, BASELINE_FRAMES)), frames: BASELINE_FRAMES };
}

/** baseline px / current px. Above 1: further from the screen than at the tap. */
export function distanceRatio(baselinePx: number, currentPx: number): number | null {
  if (!Number.isFinite(baselinePx) || !Number.isFinite(currentPx) || baselinePx <= 0 || currentPx <= 0) {
    return null;
  }
  return baselinePx / currentPx;
}

export type PhoneMovementStatus = "ok" | "lost" | "go-back";

export function phoneMovementStatus(input: {
  nowMs: number;
  lastFoundAtMs: number | null;
  latestRatio: number | null;
}): PhoneMovementStatus {
  if (input.lastFoundAtMs === null || input.nowMs - input.lastFoundAtMs >= PHONE_LOST_AFTER_MS) {
    return "lost";
  }
  if (input.latestRatio !== null && Math.abs(input.latestRatio - 1) > PHONE_GO_BACK_FRACTION) {
    return "go-back";
  }
  return "ok";
}

/**
 * The sequence number for the next send. Starts from the clock so a camera
 * restarted after a reload carries on above every number it sent before
 * (sends are far slower than one per ms).
 */
export function nextSeq(lastSeq: number | null, nowEpochMs: number): number {
  return lastSeq === null ? Math.floor(nowEpochMs) : lastSeq + 1;
}

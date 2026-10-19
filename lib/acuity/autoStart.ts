/**
 * When the main screen may start the test after the phone tap, and the
 * customer wording for that step. Pure values in, decision out (AGENTS.md rule 1).
 */

import { metresText, storedDistanceMatches } from "./distanceSetup";

export type SetupOutcome = "ok" | "calibration" | "zoom" | "window" | null;

export type AutoStartDecision =
  | { kind: "wait" }
  | { kind: "stop-distance" }
  | { kind: "stop-setup"; reason: "calibration" | "zoom" | "window" }
  | { kind: "start-countdown" };

/** Order is fixed: screen phase, session status, phone tap, distance, then setup. */
export function autoStartDecision(input: {
  uiPhase: string;
  sessionStatus: string | null;
  positionConfirmed: boolean;
  storedDistanceMm: number | null;
  snapshotDistanceMm: number | null;
  setup: SetupOutcome;
}): AutoStartDecision {
  if (input.uiPhase !== "ready") {
    return { kind: "wait" };
  }
  if (input.sessionStatus !== "paired") {
    return { kind: "wait" };
  }
  if (input.positionConfirmed !== true) {
    return { kind: "wait" };
  }
  if (
    input.snapshotDistanceMm === null ||
    !storedDistanceMatches(input.snapshotDistanceMm, input.storedDistanceMm)
  ) {
    return { kind: "stop-distance" };
  }
  if (input.setup === null) {
    return { kind: "wait" };
  }
  if (input.setup !== "ok") {
    return { kind: "stop-setup", reason: input.setup };
  }
  return { kind: "start-countdown" };
}

export type AfterCountdown =
  | { kind: "begin" }
  | { kind: "stop-setup"; reason: "calibration" | "zoom" | "window" }
  | { kind: "abort" };

export function afterCountdown(setup: SetupOutcome): AfterCountdown {
  if (setup === "ok") {
    return { kind: "begin" };
  }
  if (setup === null) {
    return { kind: "abort" };
  }
  return { kind: "stop-setup", reason: setup };
}

export function zoomBlocksStart(zoomState: "default" | "not-default" | "unknown"): boolean {
  return zoomState === "not-default";
}

export type PhoneBeforeFirstLetter = "go_to_mark" | "at_mark" | null;

export function phoneScreenBeforeFirstLetter(
  status: string,
  positionConfirmed: boolean,
): PhoneBeforeFirstLetter {
  if (status === "paired") {
    return positionConfirmed ? "at_mark" : "go_to_mark";
  }
  if (status === "running") {
    return "at_mark";
  }
  return null;
}

const PHONE_PHASES_AFTER_TAP: readonly string[] = [
  "at_mark",
  "waiting",
  "choosing",
  "sent",
  "send_failed",
];

/** True when the phone is sent back to go_to_mark from any screen reached after a tap. */
export function phonePositionWasReset(previousPhase: string, nextPhase: string): boolean {
  return nextPhase === "go_to_mark" && PHONE_PHASES_AFTER_TAP.includes(previousPhase);
}

export const PHONE_STILL_WAITING_MS = 60_000;

const PHONE_STILL_WAITING_PHASES: readonly string[] = ["at_mark", "waiting", "sent"];

export function phoneCanBeStillWaiting(phase: string): boolean {
  return PHONE_STILL_WAITING_PHASES.includes(phase);
}

export const PHONE_RECONNECTING_AFTER_FAILURES = 3;

export function phoneShowsReconnecting(consecutiveFailedRefreshes: number): boolean {
  return consecutiveFailedRefreshes >= PHONE_RECONNECTING_AFTER_FAILURES;
}

export const COUNTDOWN_NUMBERS: readonly number[] = [3, 2, 1];
export const COUNTDOWN_STEP_MS = 1000;

export const MAIN_PHONE_CONNECTED = "Phone connected ✓";
export const PHONE_CONNECTED = "Phone connected ✓";

export function mainGoToMark(distanceMm: number): string {
  return `Go to your mark, ${metresText(distanceMm)} from this screen, and tap “I’m at my mark” on your phone.`;
}

/** null when the phone has not read the session's distance. */
export function phoneGoToMark(distanceMm: number | null): string {
  if (distanceMm === null) {
    return "Now go to your mark and keep this phone with you.";
  }
  return `Now go to your mark, ${metresText(distanceMm)} from the computer screen, and keep this phone with you.`;
}

export const PHONE_AT_MARK_BUTTON = "I’m at my mark";
export const PHONE_LOOK_AT_SCREEN =
  "Look at the large screen and use your phone to select the letter you see.";
export const PHONE_POSITION_FAILED = "Couldn’t reach the main screen. Tap the button again.";
export const PHONE_CONNECTING = "Connecting…";
export const MSG_ZOOM_AT_START =
  "Set your browser zoom to 100% (press Ctrl+0, or Cmd+0 on a Mac) and close any side panel, then press Start again.";

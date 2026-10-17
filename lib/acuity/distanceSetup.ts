/**
 * Test distance gate for a new test, and the customer wording for that step.
 * Pure values in, decision out (AGENTS.md rule 1).
 */

export const DEFAULT_TEST_DISTANCE_MM = 3000;
export const ALLOWED_TEST_DISTANCES_MM: readonly number[] = [3000];

export type DistanceConfirmation = { distanceMm: number; confirmed: boolean };

export type DistanceGateResult =
  | { ok: true; distanceMm: number }
  | { ok: false; reason: "not-confirmed" | "not-allowed" };

export const DISTANCE_HEADING = "Set up your test position";
export const DISTANCE_INSTRUCTION =
  "Measure 3 metres from where your eyes will be to this computer screen, and mark that spot on the floor.";
export const DISTANCE_PHONE_NOTE =
  "Your phone stays with you at that spot. You’ll use it to answer.";
export const DISTANCE_CONFIRM_LABEL = "I’ve measured and marked 3 metres from the screen";
export const MSG_DISTANCE_NOT_CONFIRMED =
  "Tick the box to confirm you’ve marked 3 metres from the screen, then press Start.";
export const MSG_SCREEN_CANNOT_SHOW_AT_3M =
  "This screen can’t show the test letters at 3 metres. Make the browser window full size, then press Start again. If it’s already full size, use a larger screen.";
export const MSG_SETUP_FAILED = "The test couldn’t be set up. Refresh the page and try again.";

/** Confirmation is checked before the distance, so an unticked box always reports not-confirmed. */
export function checkDistanceBeforeStart(input: DistanceConfirmation): DistanceGateResult {
  if (input.confirmed !== true) {
    return { ok: false, reason: "not-confirmed" };
  }
  if (
    !Number.isFinite(input.distanceMm) ||
    !ALLOWED_TEST_DISTANCES_MM.includes(input.distanceMm)
  ) {
    return { ok: false, reason: "not-allowed" };
  }
  return { ok: true, distanceMm: input.distanceMm };
}

/** Exact equality, no tolerance. */
export function storedDistanceMatches(confirmedMm: number, storedMm: number | null): boolean {
  if (storedMm === null) {
    return false;
  }
  if (!Number.isFinite(confirmedMm) || !Number.isFinite(storedMm)) {
    return false;
  }
  return storedMm === confirmedMm;
}

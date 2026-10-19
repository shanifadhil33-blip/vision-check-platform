/**
 * Test distance gate for a new test, and the customer wording for that step.
 * Pure values in, decision out (AGENTS.md rule 1).
 */

export const DEFAULT_TEST_DISTANCE_MM = 3000;
export const ALLOWED_TEST_DISTANCES_MM: readonly number[] = [3000, 2000];

export type DistanceConfirmation = { distanceMm: number; confirmed: boolean };

export type DistanceGateResult =
  | { ok: true; distanceMm: number }
  | { ok: false; reason: "not-confirmed" | "not-allowed" };

export const DISTANCE_HEADING = "Set up your test position";
export const DISTANCE_PHONE_NOTE =
  "Your phone stays with you at that spot. You’ll use it to answer.";
export const SMALL_ROOM_LINK = "I don’t have 3 metres of space";
export const USE_3M_LINK = "Use 3 metres instead";
export const TWO_M_NOTE = "3 metres is recommended. Use 2 metres only if your room is too small.";
export const MSG_SETUP_FAILED = "The test couldn’t be set up. Refresh the page and try again.";

export function metresText(distanceMm: number): string {
  return `${distanceMm / 1000} metres`;
}

export function distanceInstruction(distanceMm: number): string {
  return `Measure ${metresText(distanceMm)} from where your eyes will be to this computer screen, and mark that spot on the floor.`;
}

export function distanceConfirmLabel(distanceMm: number): string {
  return `I’ve measured and marked ${metresText(distanceMm)} from the screen`;
}

export function msgDistanceNotConfirmed(distanceMm: number): string {
  return `Tick the box to confirm you’ve marked ${metresText(distanceMm)} from the screen, then press Start.`;
}

export function msgScreenCannotShow(distanceMm: number): string {
  return `This screen can’t show the test letters at ${metresText(distanceMm)}. Make the browser window full size, then press Start again. If it’s already full size, use a larger screen.`;
}

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

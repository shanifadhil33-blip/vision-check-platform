/**
 * Every threshold for movement detection from the baseline, in one place.
 * Pure numbers. Nothing else in lib/movement holds a threshold.
 */

export type MovementParams = {
  /** |f| at or under this keeps the confirmed distance D0. */
  deadbandFraction: number;
  /** |f| at or under this (inclusive) resizes the next letter; over it pauses. */
  maxResizeFraction: number;
  /** Number of latest distance estimates whose median is D. */
  smoothingWindow: number;
  /** No reading for this long or longer (inclusive) means the marker is lost. */
  lostAfterMs: number;
  /** Consecutive smoothed readings that would not pause, needed to resume. */
  resumeAfterReadings: number;
};

export const MOVEMENT_PARAMS: Readonly<MovementParams> = {
  // PROVISIONAL until the camera trial
  deadbandFraction: 0.03,
  // PROVISIONAL until the camera trial
  maxResizeFraction: 0.25,
  // PROVISIONAL until the camera trial
  smoothingWindow: 5,
  // PROVISIONAL until the camera trial
  lostAfterMs: 1500,
  // PROVISIONAL until the camera trial
  resumeAfterReadings: 3,
};

/**
 * Every threshold for movement detection from the baseline, in one place,
 * and the staff switch's default. Pure numbers. Nothing else in lib/movement
 * holds a threshold.
 */

/**
 * Movement detection runs only when the main screen's address has
 * movement=1, unless this is true. Customers never see it while it is false.
 */
export const MOVEMENT_DEFAULT_ON: boolean = false;

/** How D, the smoothed distance, is taken from the latest estimates. */
export type SmoothingRule =
  /** Median of the latest `readings` estimates, whatever their age. */
  | { kind: "latest-count"; readings: number }
  /**
   * Median of the estimates taken in the last windowMs (an estimate exactly
   * windowMs old is outside), or of the latest minReadings when the window
   * holds fewer.
   */
  | { kind: "time-window"; windowMs: number; minReadings: number };

export type MovementParams = {
  /** |f| at or under this (inclusive) keeps the confirmed distance D0. */
  deadbandFraction: number;
  /** |f| at or under this (inclusive) resizes the next letter; over it pauses. */
  maxResizeFraction: number;
  smoothing: SmoothingRule;
  /** No reading for this long or longer (inclusive) means the marker is lost. */
  lostAfterMs: number;
  /** Consecutive smoothed readings that would not pause, needed to resume. */
  resumeAfterReadings: number;
};

/**
 * From the hand-held trial: within one hold the size jittered 0.2 to 0.6
 * percent; between holds the arm moved the phone up to 7.5 percent at 2 m.
 */
export const MOVEMENT_PARAMS: Readonly<MovementParams> = {
  // PROVISIONAL until a trial with customers
  deadbandFraction: 0.05,
  // PROVISIONAL until a trial with customers
  maxResizeFraction: 0.25,
  // PROVISIONAL until a trial with customers
  smoothing: { kind: "time-window", windowMs: 2000, minReadings: 3 },
  // PROVISIONAL until a trial with customers
  lostAfterMs: 2000,
  // PROVISIONAL until a trial with customers
  resumeAfterReadings: 4,
};

/** At most this many estimates are kept in the movement state. */
export const MAX_KEPT_ESTIMATES = 64;

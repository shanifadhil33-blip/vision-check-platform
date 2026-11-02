/**
 * Staff and phone wording for the Landolt C comparison test. Pure values
 * (AGENTS.md rule 1). Letter test wording is reused from its own modules and
 * is never redefined here.
 */

import type { LandoltDirection } from "./landoltStaircase";

export type LandoltEye = "right" | "left" | "both";

export const LANDOLT_EYES: readonly LandoltEye[] = ["right", "left", "both"];

export const LANDOLT_PAGE_TITLE = "Landolt C comparison test";
export const LANDOLT_STAFF_LINE = "Staff only. The letter test stays unchanged.";
export const EYE_QUESTION = "Which eye are you testing?";
export const EYE_LABELS: Readonly<Record<LandoltEye, string>> = {
  right: "Right eye",
  left: "Left eye",
  both: "Both eyes together",
};
const EYE_COVER_INSTRUCTIONS: Readonly<Record<LandoltEye, string>> = {
  right: "Cover your left eye.",
  left: "Cover your right eye.",
  both: "Keep both eyes open.",
};

/** Said before the first C, on both screens: which eye to cover, or both open. */
export function eyeCoverInstruction(eye: LandoltEye): string {
  return EYE_COVER_INSTRUCTIONS[eye];
}

export const MSG_CHOOSE_EYE = "Choose which eye you’re testing, then press Start.";
export const PRACTICE_LABEL = "Practice";

export const RESULT_HEADING = "Result";
export const RESULT_TEST_FLOOR = "6/5 or better";
export const RESULT_BELOW_RANGE = "Below the test’s measurable range";
export const RESULT_INCONSISTENT = "Inconsistent result";

export const SIZE_TABLE_HEADINGS = ["Size", "Cs", "Correct", "Wrong", "Outcome"] as const;
export const OUTCOME_PASSED = "Passed";
export const OUTCOME_FAILED = "Failed";
export const OUTCOME_NOT_FINISHED = "Not finished";

export const START_ANOTHER_TEST = "Start another test";
export const INTERRUPTED_HEADING = "The test was interrupted";
export const INTERRUPTED_TEXT =
  "The page was reloaded, so this test can’t continue. The answers so far are saved.";

/** Copied text from the letter page, which keeps it unexported in TestClient.tsx. */
export const PAIRING_INSTRUCTION =
  "Scan this code with your phone’s camera to use it for your answers.";
export const WAITING_FOR_PHONE = "Waiting for the phone to connect…";
export const SETTING_UP = "Setting up…";
export const CHECKING_CALIBRATION = "Checking calibration…";
export const SET_UP_SCREEN_FIRST = "Please set up your screen before the test.";
export const SET_UP_SCREEN_LINK = "Set up your screen";
export const MSG_C_NOT_MEASURED = "The C could not be measured on this screen.";
/**
 * The letter page says to refresh and carry on, because it resumes. The C page
 * has no resume, so its connection message says to start a new test instead.
 */
export const MSG_C_CONNECTION =
  "The test lost its connection, so it can’t continue. Check the connection, then start a new test.";

export const PHONE_C_LOOK_AT_SCREEN =
  "Look at the large screen and use your phone to choose which way the gap in the C faces.";
export const PHONE_C_PROMPT = "Which way is the gap?";
export const PHONE_C_PRACTICE_PROMPT = "Practice: which way is the gap?";
export const PHONE_C_WAITING_FIRST = "Connected. Waiting for the first C…";
export const PHONE_C_WAITING_NEXT = "Waiting for the next C…";
export const PHONE_NOT_SURE = "Not sure";

export const DIRECTION_BUTTON_LABELS: Readonly<Record<LandoltDirection, string>> = {
  up: "↑ Up",
  left: "← Left",
  right: "→ Right",
  down: "↓ Down",
};

export const DIRECTION_SENT_LABELS: Readonly<Record<LandoltDirection, string>> = {
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
};

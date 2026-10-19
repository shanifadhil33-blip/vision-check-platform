/**
 * Customer wording for the test page and the phone page around the letters:
 * the start check, the stopped and error screens, and the phone's status lines.
 * Pure values (AGENTS.md rule 1).
 */

export const MSG_CHOOSE_WEARING = "Choose what you’ll be wearing, then press Start.";
export const STOPPED_HEADING = "The test has stopped";
export const STOP_REASON_CALIBRATION =
  "Your screen scaling changed, so the screen needs setting up again.";
export const STOP_REASON_ZOOM =
  "Your browser zoom changed, or a side panel opened. Set zoom back to 100% (press Ctrl+0, or Cmd+0 on a Mac) and close any side panel.";
export const STOP_REASON_WINDOW = "The browser window got smaller. Make it full size again.";
export const BACK_TO_START = "Back to the start";
export const START_NEW_TEST = "Start a new test";
export const RESULT_UNAVAILABLE_HEADING = "Something went wrong";
export const QR_ALT = "QR code to connect your phone";
export const MSG_LETTER_NOT_MEASURED = "The letter could not be measured on this screen.";
export const PHONE_SESSION_ENDED =
  "This test has ended. Follow the steps on the main screen to start again.";
export const PHONE_POSITION_RESET =
  "The main screen restarted. Tap the button when you’re at your mark.";
export const PHONE_STILL_WAITING = "Still waiting? Check the main screen.";
export const PHONE_RECONNECTING = "Trying to reconnect…";
export const PHONE_SENDING = "Sending…";
export const PHONE_TRY_AGAIN = "Try again";
export const PHONE_LINK_INCOMPLETE =
  "This link isn’t complete. Scan the code on the main screen again.";
export const REFRESH_PAGE = "Refresh the page";
export const SHOW_CODE_AGAIN = "Show the code again";

export function stopReasonText(reason: "calibration" | "zoom" | "window" | null): string | null {
  if (reason === "calibration") {
    return STOP_REASON_CALIBRATION;
  }
  if (reason === "zoom") {
    return STOP_REASON_ZOOM;
  }
  if (reason === "window") {
    return STOP_REASON_WINDOW;
  }
  return null;
}

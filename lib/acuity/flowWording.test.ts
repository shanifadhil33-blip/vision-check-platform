import { describe, expect, it } from "vitest";
import {
  BACK_TO_START,
  MSG_CHOOSE_WEARING,
  MSG_LETTER_NOT_MEASURED,
  PHONE_LINK_INCOMPLETE,
  PHONE_POSITION_RESET,
  PHONE_RECONNECTING,
  PHONE_SENDING,
  PHONE_SESSION_ENDED,
  PHONE_STILL_WAITING,
  PHONE_TRY_AGAIN,
  QR_ALT,
  REFRESH_PAGE,
  RESULT_UNAVAILABLE_HEADING,
  SHOW_CODE_AGAIN,
  START_NEW_TEST,
  STOP_REASON_CALIBRATION,
  STOP_REASON_WINDOW,
  STOP_REASON_ZOOM,
  STOPPED_HEADING,
  stopReasonText,
} from "./flowWording";

describe("flow wording", () => {
  it("FW1 MSG_CHOOSE_WEARING", () => {
    expect(MSG_CHOOSE_WEARING).toBe("Choose what you\u2019ll be wearing, then press Start.");
  });

  it("FW2 STOPPED_HEADING", () => {
    expect(STOPPED_HEADING).toBe("The test has stopped");
  });

  it("FW3 STOP_REASON_CALIBRATION", () => {
    expect(STOP_REASON_CALIBRATION).toBe(
      "Your screen scaling changed, so the screen needs setting up again.",
    );
  });

  it("FW4 STOP_REASON_ZOOM", () => {
    expect(STOP_REASON_ZOOM).toBe(
      "Your browser zoom changed, or a side panel opened. Set zoom back to 100% (press Ctrl+0, or Cmd+0 on a Mac) and close any side panel.",
    );
  });

  it("FW5 STOP_REASON_WINDOW", () => {
    expect(STOP_REASON_WINDOW).toBe("The browser window got smaller. Make it full size again.");
  });

  it("FW6 BACK_TO_START", () => {
    expect(BACK_TO_START).toBe("Back to the start");
  });

  it("FW7 START_NEW_TEST", () => {
    expect(START_NEW_TEST).toBe("Start a new test");
  });

  it("FW8 RESULT_UNAVAILABLE_HEADING", () => {
    expect(RESULT_UNAVAILABLE_HEADING).toBe("Something went wrong");
  });

  it("FW9 QR_ALT", () => {
    expect(QR_ALT).toBe("QR code to connect your phone");
  });

  it("FW10 MSG_LETTER_NOT_MEASURED", () => {
    expect(MSG_LETTER_NOT_MEASURED).toBe("The letter could not be measured on this screen.");
  });

  it("FW11 PHONE_SESSION_ENDED", () => {
    expect(PHONE_SESSION_ENDED).toBe(
      "This test has ended. Follow the steps on the main screen to start again.",
    );
  });

  it("FW12 PHONE_POSITION_RESET", () => {
    expect(PHONE_POSITION_RESET).toBe(
      "The main screen restarted. Tap the button when you\u2019re at your mark.",
    );
  });

  it("FW13 PHONE_STILL_WAITING", () => {
    expect(PHONE_STILL_WAITING).toBe("Still waiting? Check the main screen.");
  });

  it("FW14 PHONE_RECONNECTING", () => {
    expect(PHONE_RECONNECTING).toBe("Trying to reconnect\u2026");
  });

  it("FW15 PHONE_SENDING", () => {
    expect(PHONE_SENDING).toBe("Sending\u2026");
  });

  it("FW16 PHONE_TRY_AGAIN", () => {
    expect(PHONE_TRY_AGAIN).toBe("Try again");
  });

  it("FW17 PHONE_LINK_INCOMPLETE", () => {
    expect(PHONE_LINK_INCOMPLETE).toBe(
      "This link isn\u2019t complete. Scan the code on the main screen again.",
    );
  });

  it("FW18 REFRESH_PAGE", () => {
    expect(REFRESH_PAGE).toBe("Refresh the page");
  });

  it("FW19 SHOW_CODE_AGAIN", () => {
    expect(SHOW_CODE_AGAIN).toBe("Show the code again");
  });
});

describe("stopReasonText", () => {
  it("SR1 calibration gives the screen scaling reason", () => {
    expect(stopReasonText("calibration")).toBe(
      "Your screen scaling changed, so the screen needs setting up again.",
    );
  });

  it("SR2 zoom gives the zoom and side panel reason", () => {
    expect(stopReasonText("zoom")).toBe(
      "Your browser zoom changed, or a side panel opened. Set zoom back to 100% (press Ctrl+0, or Cmd+0 on a Mac) and close any side panel.",
    );
  });

  it("SR3 window gives the window size reason", () => {
    expect(stopReasonText("window")).toBe(
      "The browser window got smaller. Make it full size again.",
    );
  });

  it("SR4 null gives null", () => {
    expect(stopReasonText(null)).toBeNull();
  });
});

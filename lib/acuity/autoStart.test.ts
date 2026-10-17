import { describe, expect, it } from "vitest";
import {
  afterCountdown,
  autoStartDecision,
  COUNTDOWN_NUMBERS,
  COUNTDOWN_STEP_MS,
  MAIN_GO_TO_MARK,
  MAIN_PHONE_CONNECTED,
  MSG_ZOOM_AT_START,
  PHONE_AT_MARK_BUTTON,
  PHONE_CONNECTED,
  PHONE_CONNECTING,
  PHONE_GO_TO_MARK,
  PHONE_LOOK_AT_SCREEN,
  PHONE_POSITION_FAILED,
  PHONE_STILL_WAITING_MS,
  phoneCanBeStillWaiting,
  phonePositionWasReset,
  phoneScreenBeforeFirstLetter,
  phoneShowsReconnecting,
  zoomBlocksStart,
} from "./autoStart";

const GOOD = {
  uiPhase: "ready",
  sessionStatus: "paired",
  positionConfirmed: true,
  storedDistanceMm: 3000,
  snapshotDistanceMm: 3000,
  setup: "ok",
} as const;

describe("autoStartDecision", () => {
  it("A1 waits while the screen is still waiting for the phone", () => {
    expect(autoStartDecision({ ...GOOD, uiPhase: "waiting_for_phone" })).toEqual({
      kind: "wait",
    });
  });

  it("A2 waits while the session is only created", () => {
    expect(autoStartDecision({ ...GOOD, sessionStatus: "created" })).toEqual({ kind: "wait" });
  });

  it("A3 waits until the phone tap confirms the position", () => {
    expect(autoStartDecision({ ...GOOD, positionConfirmed: false })).toEqual({ kind: "wait" });
  });

  it("A4 starts the countdown when every check passes", () => {
    expect(autoStartDecision(GOOD)).toEqual({ kind: "start-countdown" });
  });

  it("A5 stops for distance when the stored distance is 2999 or 3001", () => {
    expect(autoStartDecision({ ...GOOD, storedDistanceMm: 2999 })).toEqual({
      kind: "stop-distance",
    });
    expect(autoStartDecision({ ...GOOD, storedDistanceMm: 3001 })).toEqual({
      kind: "stop-distance",
    });
  });

  it("A6 stops for distance when the stored distance is missing", () => {
    expect(autoStartDecision({ ...GOOD, storedDistanceMm: null })).toEqual({
      kind: "stop-distance",
    });
  });

  it("A7 stops for distance when the drawn distance is missing", () => {
    expect(autoStartDecision({ ...GOOD, snapshotDistanceMm: null })).toEqual({
      kind: "stop-distance",
    });
  });

  it("A8 stops for setup with the failing reason", () => {
    expect(autoStartDecision({ ...GOOD, setup: "zoom" })).toEqual({
      kind: "stop-setup",
      reason: "zoom",
    });
    expect(autoStartDecision({ ...GOOD, setup: "window" })).toEqual({
      kind: "stop-setup",
      reason: "window",
    });
    expect(autoStartDecision({ ...GOOD, setup: "calibration" })).toEqual({
      kind: "stop-setup",
      reason: "calibration",
    });
  });

  it("A9 waits when the setup check cannot run yet", () => {
    expect(autoStartDecision({ ...GOOD, setup: null })).toEqual({ kind: "wait" });
  });

  it("A10 checks distance before setup", () => {
    expect(autoStartDecision({ ...GOOD, storedDistanceMm: 2999, setup: "zoom" })).toEqual({
      kind: "stop-distance",
    });
  });

  it("A11 waits while a countdown is already running", () => {
    expect(autoStartDecision({ ...GOOD, uiPhase: "countdown" })).toEqual({ kind: "wait" });
  });

  it("A12 checks the phone tap before the distance", () => {
    expect(
      autoStartDecision({ ...GOOD, positionConfirmed: false, storedDistanceMm: 2999 }),
    ).toEqual({ kind: "wait" });
  });

  it("A13 checks the screen phase before the distance", () => {
    expect(autoStartDecision({ ...GOOD, uiPhase: "countdown", storedDistanceMm: 2999 })).toEqual({
      kind: "wait",
    });
  });
});

describe("afterCountdown", () => {
  it("C1 begins when setup is ok", () => {
    expect(afterCountdown("ok")).toEqual({ kind: "begin" });
  });

  it("C2 stops for setup with the failing reason", () => {
    expect(afterCountdown("window")).toEqual({ kind: "stop-setup", reason: "window" });
  });

  it("C3 aborts when the setup check cannot run", () => {
    expect(afterCountdown(null)).toEqual({ kind: "abort" });
  });
});

describe("zoomBlocksStart", () => {
  it("Z1 blocks only a zoom that is known not to be 100%", () => {
    expect(zoomBlocksStart("not-default")).toBe(true);
    expect(zoomBlocksStart("default")).toBe(false);
    expect(zoomBlocksStart("unknown")).toBe(false);
  });
});

describe("phoneScreenBeforeFirstLetter", () => {
  it("P1 paired without the tap shows go_to_mark", () => {
    expect(phoneScreenBeforeFirstLetter("paired", false)).toBe("go_to_mark");
  });

  it("P2 paired with the tap shows at_mark", () => {
    expect(phoneScreenBeforeFirstLetter("paired", true)).toBe("at_mark");
  });

  it("P3 running shows at_mark", () => {
    expect(phoneScreenBeforeFirstLetter("running", false)).toBe("at_mark");
  });

  it("P4 created shows nothing new", () => {
    expect(phoneScreenBeforeFirstLetter("created", false)).toBeNull();
  });
});

describe("phonePositionWasReset", () => {
  it("R1 is a reset when at_mark goes back to go_to_mark", () => {
    expect(phonePositionWasReset("at_mark", "go_to_mark")).toBe(true);
  });

  it("R2 is a reset from every screen reached after a tap", () => {
    expect(phonePositionWasReset("waiting", "go_to_mark")).toBe(true);
    expect(phonePositionWasReset("choosing", "go_to_mark")).toBe(true);
    expect(phonePositionWasReset("sent", "go_to_mark")).toBe(true);
    expect(phonePositionWasReset("send_failed", "go_to_mark")).toBe(true);
  });

  it("R3 is not a reset on the first arrival at go_to_mark", () => {
    expect(phonePositionWasReset("loading", "go_to_mark")).toBe(false);
    expect(phonePositionWasReset("connect", "go_to_mark")).toBe(false);
    expect(phonePositionWasReset("go_to_mark", "go_to_mark")).toBe(false);
  });

  it("R4 is not a reset when the next screen is not go_to_mark", () => {
    expect(phonePositionWasReset("at_mark", "waiting")).toBe(false);
  });
});

describe("phoneCanBeStillWaiting", () => {
  it("S1 applies to at_mark, waiting and sent", () => {
    expect(phoneCanBeStillWaiting("at_mark")).toBe(true);
    expect(phoneCanBeStillWaiting("waiting")).toBe(true);
    expect(phoneCanBeStillWaiting("sent")).toBe(true);
  });

  it("S2 does not apply where the customer has something to do", () => {
    expect(phoneCanBeStillWaiting("go_to_mark")).toBe(false);
    expect(phoneCanBeStillWaiting("choosing")).toBe(false);
    expect(phoneCanBeStillWaiting("send_failed")).toBe(false);
    expect(phoneCanBeStillWaiting("complete")).toBe(false);
  });

  it("S3 waits 60000 ms", () => {
    expect(PHONE_STILL_WAITING_MS).toBe(60000);
  });
});

describe("phoneShowsReconnecting", () => {
  it("N1 does not show at 2 failed refreshes in a row", () => {
    expect(phoneShowsReconnecting(2)).toBe(false);
  });

  it("N2 shows at exactly 3", () => {
    expect(phoneShowsReconnecting(3)).toBe(true);
  });

  it("N3 shows above 3", () => {
    expect(phoneShowsReconnecting(4)).toBe(true);
  });

  it("N4 does not show with no failures", () => {
    expect(phoneShowsReconnecting(0)).toBe(false);
  });
});

describe("countdown constants", () => {
  it("K1 counts 3, 2, 1 at 1000 ms per number", () => {
    expect(COUNTDOWN_NUMBERS).toEqual([3, 2, 1]);
    expect(COUNTDOWN_STEP_MS).toBe(1000);
  });
});

describe("customer strings", () => {
  it("W1 MAIN_PHONE_CONNECTED", () => {
    expect(MAIN_PHONE_CONNECTED).toBe("Phone connected \u2713");
  });

  it("W2 MAIN_GO_TO_MARK", () => {
    expect(MAIN_GO_TO_MARK).toBe(
      "Go to your mark, 3 metres from this screen, and tap \u201CI\u2019m at my mark\u201D on your phone.",
    );
  });

  it("W3 PHONE_CONNECTED", () => {
    expect(PHONE_CONNECTED).toBe("Phone connected \u2713");
  });

  it("W4 PHONE_GO_TO_MARK", () => {
    expect(PHONE_GO_TO_MARK).toBe(
      "Now go to your mark, 3 metres from the computer screen, and keep this phone with you.",
    );
  });

  it("W5 PHONE_AT_MARK_BUTTON", () => {
    expect(PHONE_AT_MARK_BUTTON).toBe("I\u2019m at my mark");
  });

  it("W6 PHONE_LOOK_AT_SCREEN", () => {
    expect(PHONE_LOOK_AT_SCREEN).toBe(
      "Look at the large screen and use your phone to select the letter you see.",
    );
  });

  it("W7 PHONE_POSITION_FAILED", () => {
    expect(PHONE_POSITION_FAILED).toBe(
      "Couldn\u2019t reach the main screen. Tap the button again.",
    );
  });

  it("W8 PHONE_CONNECTING", () => {
    expect(PHONE_CONNECTING).toBe("Connecting\u2026");
  });

  it("W9 MSG_ZOOM_AT_START", () => {
    expect(MSG_ZOOM_AT_START).toBe(
      "Set your browser zoom to 100% (press Ctrl+0, or Cmd+0 on a Mac) and close any side panel, then press Start again.",
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  CAL_CONTINUE,
  CAL_DONE,
  CAL_EXTRA_MATCH_NOTE,
  CAL_INTRO,
  CAL_NEXT_MATCH_NOTE,
  CAL_OUTLINE_TOO_LARGE,
  CAL_OUTLINE_TOO_SMALL,
  CAL_PAGE_TITLE,
  CAL_SLIDER_HINT,
  CAL_SLIDER_LABEL,
  CAL_STEP_1,
  CAL_STEP_2,
  CAL_ZOOM_HINT,
  CAL_ZOOM_WARNING_BODY,
  HOME_NEEDS,
  HOME_START_TEST,
  outlineSizeWarning,
} from "./calibrateWording";
import { isPlausiblePixelPitch } from "./plausibility";

describe("calibrateWording", () => {
  it("CW1 CAL_INTRO is the exact intro sentence", () => {
    expect(CAL_INTRO).toBe(
      "Match a bank card to the outline on this screen, twice. This sets the size of the test letters.",
    );
  });

  it("CW2 CAL_ZOOM_HINT is the exact zoom hint", () => {
    expect(CAL_ZOOM_HINT).toBe(
      "Set your browser zoom to 100% first (press Ctrl+0, or Cmd+0 on a Mac).",
    );
  });

  it("CW3 CAL_STEP_1 is the exact first step", () => {
    expect(CAL_STEP_1).toBe(
      "Hold a bank card flat on the screen over the outline, a little higher, so you can see the bottom edges of both.",
    );
  });

  it("CW4 CAL_STEP_2 is the exact second step", () => {
    expect(CAL_STEP_2).toBe(
      "Change the width until the left and right edges of the outline line up exactly with the edges of the card.",
    );
  });

  it("CW5 CAL_SLIDER_LABEL is the exact slider label", () => {
    expect(CAL_SLIDER_LABEL).toBe("Card width");
  });

  it("CW6 CAL_SLIDER_HINT is the exact slider hint", () => {
    expect(CAL_SLIDER_HINT).toBe(
      "Use the buttons or the slider. Arrow keys work too; hold Shift for bigger steps.",
    );
  });

  it("CW7 CAL_NEXT_MATCH_NOTE is the exact note above match 2", () => {
    expect(CAL_NEXT_MATCH_NOTE).toBe(
      "Take the card off the screen and match it once more. The outline now starts at a different size.",
    );
  });

  it("CW8 CAL_EXTRA_MATCH_NOTE is the exact note above the extra match", () => {
    expect(CAL_EXTRA_MATCH_NOTE).toBe(
      "The two matches were a little different. Take the card off the screen and match it one more time.",
    );
  });

  it("CW9 CAL_DONE is the exact done line", () => {
    expect(CAL_DONE).toBe("This screen is set up.");
  });

  it("CW10 CAL_CONTINUE is the exact continue link text", () => {
    expect(CAL_CONTINUE).toBe("Continue to the test");
  });

  it("CW11 HOME_START_TEST is the exact home button text", () => {
    expect(HOME_START_TEST).toBe("2. Start the test");
  });

  it("CW12 CAL_OUTLINE_TOO_LARGE is the exact too-large warning", () => {
    expect(CAL_OUTLINE_TOO_LARGE).toBe(
      "The outline looks larger than a bank card. Make it narrower until the card\u2019s edges line up.",
    );
  });

  it("CW13 CAL_OUTLINE_TOO_SMALL is the exact too-small warning", () => {
    expect(CAL_OUTLINE_TOO_SMALL).toBe(
      "The outline looks smaller than a bank card. Make it wider until the card\u2019s edges line up.",
    );
  });

  it("CW14 CAL_ZOOM_WARNING_BODY is the exact zoom warning body", () => {
    expect(CAL_ZOOM_WARNING_BODY).toBe(
      "Press Ctrl+0, or Cmd+0 on a Mac, and close any panel open at the side of the browser.",
    );
  });

  it("CW15 CAL_PAGE_TITLE is the exact page title", () => {
    expect(CAL_PAGE_TITLE).toBe("Set up your screen");
  });

  it("CW16 HOME_NEEDS is the exact what-you'll-need line", () => {
    expect(HOME_NEEDS).toBe(
      "You\u2019ll need a bank card (or a ruler), your phone, and ideally 3 metres of space in front of the screen.",
    );
  });
});

describe("outlineSizeWarning", () => {
  it("OW1 a pitch finer than real displays gives the too-large warning", () => {
    expect(outlineSizeWarning(isPlausiblePixelPitch(0.001))).toBe(CAL_OUTLINE_TOO_LARGE);
  });

  it("OW2 a pitch coarser than real displays gives the too-small warning", () => {
    expect(outlineSizeWarning(isPlausiblePixelPitch(10))).toBe(CAL_OUTLINE_TOO_SMALL);
  });

  it("OW3 a plausible pitch gives no warning", () => {
    expect(outlineSizeWarning(isPlausiblePixelPitch(0.25))).toBeNull();
  });

  it("OW4 a pitch that is not a usable number gives no warning", () => {
    expect(outlineSizeWarning(isPlausiblePixelPitch(Number.NaN))).toBeNull();
  });
});

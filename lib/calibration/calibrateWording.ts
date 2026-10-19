import type { PlausibilityResult } from "./types";

export const CAL_INTRO =
  "Match a bank card to the outline on this screen, twice. This sets the size of the test letters.";

export const CAL_ZOOM_HINT =
  "Set your browser zoom to 100% first (press Ctrl+0, or Cmd+0 on a Mac).";

export const CAL_STEP_1 =
  "Hold a bank card flat on the screen over the outline, a little higher, so you can see the bottom edges of both.";

export const CAL_STEP_2 =
  "Change the width until the left and right edges of the outline line up exactly with the edges of the card.";

export const CAL_SLIDER_LABEL = "Card width";

export const CAL_SLIDER_HINT =
  "Use the buttons or the slider. Arrow keys work too; hold Shift for bigger steps.";

export const CAL_NEXT_MATCH_NOTE =
  "Take the card off the screen and match it once more. The outline now starts at a different size.";

export const CAL_EXTRA_MATCH_NOTE =
  "The two matches were a little different. Take the card off the screen and match it one more time.";

export const CAL_DONE = "This screen is set up.";

export const CAL_CONTINUE = "Continue to the test";

export const HOME_START_TEST = "2. Start the test";

export const CAL_OUTLINE_TOO_LARGE =
  "The outline looks larger than a bank card. Make it narrower until the card’s edges line up.";

export const CAL_OUTLINE_TOO_SMALL =
  "The outline looks smaller than a bank card. Make it wider until the card’s edges line up.";

export const CAL_ZOOM_WARNING_BODY =
  "Press Ctrl+0, or Cmd+0 on a Mac, and close any panel open at the side of the browser.";

export const CAL_PAGE_TITLE = "Set up your screen";

export const HOME_NEEDS =
  "You’ll need a bank card (or a ruler), your phone, and ideally 3 metres of space in front of the screen.";

/**
 * Customer warning for an implausible card match, read from the reason text
 * isPlausiblePixelPitch returns: "finer than" means the outline is too large,
 * "coarser than" means it is too small. Any other result gives no warning.
 */
export function outlineSizeWarning(plausibility: PlausibilityResult): string | null {
  if (plausibility.ok) {
    return null;
  }
  if (plausibility.reason.includes("finer than")) {
    return CAL_OUTLINE_TOO_LARGE;
  }
  if (plausibility.reason.includes("coarser than")) {
    return CAL_OUTLINE_TOO_SMALL;
  }
  return null;
}

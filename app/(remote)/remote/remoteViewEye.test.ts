import { describe, expect, it } from "vitest";
import {
  awaitingResponseState,
  parseAnyLoopState,
  readyState,
  type LandoltRunContext,
  type RunContext,
} from "@/lib/session/loopState";
import type { LandoltEye } from "@/lib/acuity/landoltWording";
import { phoneEyeLine, phoneLookAtScreen } from "./remoteView";

const LETTER_RUN: RunContext = {
  correction: "none",
  stepIndices: [0, 1, 2, 3],
  finestLimitedBy: "viewport-size",
  coarsestLimitedBy: "viewport-size",
  voidedTrialIndices: [],
};

function parsed(json: ReturnType<typeof readyState>) {
  const state = parseAnyLoopState(json);
  if (state === null) {
    throw new Error("setup");
  }
  return state;
}

function cAtMark(eye: LandoltEye) {
  const run: LandoltRunContext = { ...LETTER_RUN, testMode: "landolt", eye };
  return parsed(readyState(run, { positionConfirmed: true }));
}

describe("phoneEyeLine on the C at-mark screen", () => {
  it("follows the C look-at-screen line", () => {
    expect(phoneLookAtScreen("landolt")).toBe(
      "Look at the large screen and use your phone to choose which way the gap in the C faces.",
    );
  });

  it("right eye: cover the left", () => {
    expect(phoneEyeLine(cAtMark("right"))).toBe("Cover your left eye.");
  });

  it("left eye: cover the right", () => {
    expect(phoneEyeLine(cAtMark("left"))).toBe("Cover your right eye.");
  });

  it("both eyes: keep both open", () => {
    expect(phoneEyeLine(cAtMark("both"))).toBe("Keep both eyes open.");
  });

  it("a letter state shows no eye line", () => {
    expect(phoneEyeLine(parsed(readyState(LETTER_RUN, { positionConfirmed: true })))).toBeNull();
    expect(
      phoneEyeLine(
        parsed(
          awaitingResponseState({
            trialIndex: 0,
            presentationId: "p-0",
            choices: ["C", "D", "H", "K", "N"],
            run: LETTER_RUN,
          }),
        ),
      ),
    ).toBeNull();
  });
});

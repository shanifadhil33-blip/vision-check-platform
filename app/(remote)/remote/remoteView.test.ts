import { describe, expect, it } from "vitest";
import {
  awaitingResponseState,
  landoltAwaitingResponseState,
  parseAnyLoopState,
  type LandoltRunContext,
  type RunContext,
} from "@/lib/session/loopState";
import {
  choosingPatch,
  phoneLookAtScreen,
  phonePrompt,
  phoneSentLabel,
  phoneWaitingLine,
  respondedStateFor,
  testModeOf,
} from "./remoteView";

const LETTER_RUN: RunContext = {
  correction: "none",
  stepIndices: [0, 1, 2, 3],
  finestLimitedBy: "viewport-size",
  coarsestLimitedBy: "viewport-size",
  voidedTrialIndices: [],
};

const C_RUN: LandoltRunContext = { ...LETTER_RUN, testMode: "landolt", eye: "right" };

function awaitingLetter() {
  const state = parseAnyLoopState(
    awaitingResponseState({
      trialIndex: 6,
      presentationId: "p-6",
      choices: ["C", "D", "H", "K", "N"],
      run: LETTER_RUN,
    }),
  );
  if (state === null || state.phase !== "awaiting_response") {
    throw new Error("setup");
  }
  return state;
}

function awaitingC(practice: boolean) {
  const state = parseAnyLoopState(
    landoltAwaitingResponseState({ trialIndex: 1, presentationId: "p-1", practice, run: C_RUN }),
  );
  if (state === null || state.phase !== "awaiting_response") {
    throw new Error("setup");
  }
  return state;
}

describe("choosingPatch", () => {
  it("a letter state gives exactly the patch the phone built before the C build", () => {
    // Literal copy of the object remoteController.applyLoopState patched inline at b0579d9.
    expect(JSON.stringify(choosingPatch(awaitingLetter()))).toBe(
      '{"phase":"choosing","choices":["C","D","H","K","N"],"presentationId":"p-6","trialIndex":6,"choiceLocked":false,"errorMessage":null,"everSawTrial":true,"lastSentLabel":null,"selectedChoice":null,"positionFailed":false}',
    );
  });

  it("a C state shows the direction pad: no letter choices, the practice flag set", () => {
    expect(choosingPatch(awaitingC(true))).toEqual({
      phase: "choosing",
      choices: [],
      presentationId: "p-1",
      trialIndex: 1,
      choiceLocked: false,
      errorMessage: null,
      everSawTrial: true,
      lastSentLabel: null,
      selectedChoice: null,
      positionFailed: false,
      practice: true,
    });
    expect(choosingPatch(awaitingC(false)).practice).toBe(false);
    expect(testModeOf(awaitingC(false))).toBe("landolt");
    expect(testModeOf(awaitingLetter())).toBe("letters");
  });
});

describe("phone wording", () => {
  it("C states use the C strings; letter states keep the letter strings", () => {
    expect(phonePrompt("landolt", true)).toBe("Practice: which way is the gap?");
    expect(phonePrompt("landolt", false)).toBe("Which way is the gap?");
    expect(phonePrompt("letters", true)).toBe("Which letter do you see?");
    expect(phoneWaitingLine("landolt", false)).toBe("Connected. Waiting for the first C…");
    expect(phoneWaitingLine("landolt", true)).toBe("Waiting for the next C…");
    expect(phoneWaitingLine("letters", false)).toBe("Connected. Waiting for the first letter…");
    expect(phoneWaitingLine("letters", true)).toBe("Waiting for the next letter…");
    expect(phoneLookAtScreen("landolt")).toBe(
      "Look at the large screen and use your phone to choose which way the gap in the C faces.",
    );
    expect(phoneLookAtScreen("letters")).toBe(
      "Look at the large screen and use your phone to select the letter you see.",
    );
  });

  it("sent labels: Up, Down, Left, Right, Not sure, and the letter itself", () => {
    expect(phoneSentLabel({ kind: "direction", direction: "up" })).toBe("Up");
    expect(phoneSentLabel({ kind: "direction", direction: "down" })).toBe("Down");
    expect(phoneSentLabel({ kind: "direction", direction: "left" })).toBe("Left");
    expect(phoneSentLabel({ kind: "direction", direction: "right" })).toBe("Right");
    expect(phoneSentLabel({ kind: "direction_not_sure" })).toBe("Not sure");
    expect(phoneSentLabel({ kind: "not_sure" })).toBe("Not sure");
    expect(phoneSentLabel({ kind: "letter", letter: "K" })).toBe("K");
  });
});

describe("respondedStateFor", () => {
  const answered = { trialIndex: 6, presentationId: "p-6", responseId: "r-6" };

  it("writes a letter answer exactly as the letter writer does", () => {
    expect(JSON.stringify(respondedStateFor(awaitingLetter(), answered, { kind: "letter", letter: "H" }))).toBe(
      '{"phase":"responded","trialIndex":6,"presentationId":"p-6","responseId":"r-6","responseKind":"letter","responseLetter":"H","run":{"correction":"none","stepIndices":[0,1,2,3],"finestLimitedBy":"viewport-size","coarsestLimitedBy":"viewport-size","voidedTrialIndices":[]}}',
    );
  });

  it("writes a C answer as a direction, and C not sure with a null direction", () => {
    const direction = respondedStateFor(awaitingC(false), answered, { kind: "direction", direction: "down" }) as {
      responseKind: string;
      responseDirection: string | null;
    };
    expect(direction.responseKind).toBe("direction");
    expect(direction.responseDirection).toBe("down");
    const notSure = respondedStateFor(awaitingC(false), answered, { kind: "direction_not_sure" }) as {
      responseKind: string;
      responseDirection: string | null;
    };
    expect(notSure.responseKind).toBe("not_sure");
    expect(notSure.responseDirection).toBeNull();
  });

  it("refuses a C answer for a letter state and a letter answer for a C state", () => {
    expect(respondedStateFor(awaitingLetter(), answered, { kind: "direction", direction: "up" })).toBeNull();
    expect(respondedStateFor(awaitingLetter(), answered, { kind: "direction_not_sure" })).toBeNull();
    expect(respondedStateFor(awaitingC(false), answered, { kind: "letter", letter: "C" })).toBeNull();
    expect(respondedStateFor(awaitingC(false), answered, { kind: "not_sure" })).toBeNull();
  });
});

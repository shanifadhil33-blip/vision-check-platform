import { describe, expect, it } from "vitest";
import {
  awaitingResponseState,
  isLandoltState,
  landoltAwaitingResponseState,
  landoltCompleteState,
  landoltRespondedState,
  parseAnyLoopState,
  parseCResult,
  parseLoopState,
  readyState,
  respondedState,
  type LandoltRunContext,
  type RunContext,
} from "./loopState";

const LETTER_RUN: RunContext = {
  correction: "glasses",
  stepIndices: [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  finestLimitedBy: "requested-bound",
  coarsestLimitedBy: "viewport-size",
  voidedTrialIndices: [],
};

const C_RUN: LandoltRunContext = {
  correction: "contacts",
  stepIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  finestLimitedBy: "screen-resolution",
  coarsestLimitedBy: "viewport-size",
  voidedTrialIndices: [3],
  testMode: "landolt",
  eye: "left",
};

const C_RUN_JSON =
  '{"correction":"contacts","stepIndices":[0,1,2,3,4,5,6,7,8,9],"finestLimitedBy":"screen-resolution","coarsestLimitedBy":"viewport-size","voidedTrialIndices":[3],"testMode":"landolt","eye":"left"}';

function roundTrip(json: unknown): unknown {
  return parseAnyLoopState(JSON.parse(JSON.stringify(json)));
}

describe("Landolt C loop-state writers", () => {
  it("ready keeps the letter keys and adds testMode and eye to the run, in that order", () => {
    expect(JSON.stringify(readyState(C_RUN, { positionConfirmed: true }))).toBe(
      `{"phase":"ready","positionConfirmed":true,"run":${C_RUN_JSON}}`,
    );
  });

  it("awaiting_response carries testMode and practice and no choices", () => {
    expect(
      JSON.stringify(
        landoltAwaitingResponseState({ trialIndex: 0, presentationId: "p-0", practice: true, run: C_RUN }),
      ),
    ).toBe(
      `{"phase":"awaiting_response","testMode":"landolt","trialIndex":0,"presentationId":"p-0","practice":true,"run":${C_RUN_JSON}}`,
    );
  });

  it("responded carries responseKind direction and responseDirection, never a letter", () => {
    expect(
      JSON.stringify(
        landoltRespondedState({
          trialIndex: 2,
          presentationId: "p-2",
          responseId: "r-2",
          responseKind: "direction",
          responseDirection: "up",
          run: C_RUN,
        }),
      ),
    ).toBe(
      `{"phase":"responded","testMode":"landolt","trialIndex":2,"presentationId":"p-2","responseId":"r-2","responseKind":"direction","responseDirection":"up","run":${C_RUN_JSON}}`,
    );
  });

  it("responded not_sure always writes a null direction", () => {
    const json = landoltRespondedState({
      trialIndex: 2,
      presentationId: "p-2",
      responseId: "r-2",
      responseKind: "not_sure",
      responseDirection: "up",
      run: C_RUN,
    }) as { responseDirection: unknown };
    expect(json.responseDirection).toBeNull();
  });

  it("complete carries the C result, including inconsistent", () => {
    expect(
      JSON.stringify(landoltCompleteState(17, { run: C_RUN, result: { kind: "inconsistent" } })),
    ).toBe(
      `{"phase":"complete","testMode":"landolt","trialsCompleted":17,"run":${C_RUN_JSON},"result":{"kind":"inconsistent"}}`,
    );
  });
});

describe("Landolt C loop-state round trip", () => {
  it("ready, awaiting, responded and complete come back unchanged", () => {
    const states = [
      { phase: "ready", run: C_RUN },
      { phase: "ready", run: C_RUN, positionConfirmed: true },
      {
        phase: "awaiting_response",
        testMode: "landolt",
        trialIndex: 4,
        presentationId: "p-4",
        practice: false,
        run: C_RUN,
      },
      {
        phase: "responded",
        testMode: "landolt",
        trialIndex: 4,
        presentationId: "p-4",
        responseId: "r-4",
        responseKind: "direction",
        responseDirection: "left",
        run: C_RUN,
      },
      {
        phase: "responded",
        testMode: "landolt",
        trialIndex: 5,
        presentationId: "p-5",
        responseId: "r-5",
        responseKind: "not_sure",
        responseDirection: null,
        run: C_RUN,
      },
      {
        phase: "complete",
        testMode: "landolt",
        trialsCompleted: 9,
        run: C_RUN,
        result: { kind: "measured", stepIndex: 2 },
        nextSessionId: null,
      },
    ];
    const written = [
      readyState(C_RUN),
      readyState(C_RUN, { positionConfirmed: true }),
      landoltAwaitingResponseState({ trialIndex: 4, presentationId: "p-4", practice: false, run: C_RUN }),
      landoltRespondedState({
        trialIndex: 4,
        presentationId: "p-4",
        responseId: "r-4",
        responseKind: "direction",
        responseDirection: "left",
        run: C_RUN,
      }),
      landoltRespondedState({
        trialIndex: 5,
        presentationId: "p-5",
        responseId: "r-5",
        responseKind: "not_sure",
        responseDirection: null,
        run: C_RUN,
      }),
      landoltCompleteState(9, { run: C_RUN, result: { kind: "measured", stepIndex: 2 } }),
    ];
    expect(written.map(roundTrip)).toEqual(states);
    for (const state of written.map(roundTrip)) {
      expect(state).not.toBeNull();
      expect(isLandoltState(state as never)).toBe(true);
    }
  });

  it("the letter-only parser refuses every C state", () => {
    expect(parseLoopState(JSON.parse(JSON.stringify(readyState(C_RUN))))).toBeNull();
    expect(
      parseLoopState(
        landoltAwaitingResponseState({ trialIndex: 4, presentationId: "p-4", practice: false, run: C_RUN }),
      ),
    ).toBeNull();
  });

  it("a letter state still parses through parseAnyLoopState as a letter state", () => {
    const letter = awaitingResponseState({
      trialIndex: 1,
      presentationId: "p-1",
      choices: ["C", "D", "H", "K", "N"],
      run: LETTER_RUN,
    });
    const parsed = parseAnyLoopState(letter);
    expect(parsed).toEqual(parseLoopState(letter));
    expect(isLandoltState(parsed!)).toBe(false);
  });
});

describe("Landolt C loop-state parser rejects mixed families", () => {
  it("rejects a C awaiting state that carries choices", () => {
    expect(
      parseAnyLoopState({
        phase: "awaiting_response",
        testMode: "landolt",
        trialIndex: 4,
        presentationId: "p-4",
        practice: false,
        choices: ["C", "D", "H", "K", "N"],
        run: C_RUN,
      }),
    ).toBeNull();
  });

  it("rejects a letter awaiting state without choices", () => {
    expect(
      parseAnyLoopState({
        phase: "awaiting_response",
        trialIndex: 4,
        presentationId: "p-4",
        run: LETTER_RUN,
      }),
    ).toBeNull();
  });

  it("rejects a C awaiting state with no practice flag", () => {
    expect(
      parseAnyLoopState({
        phase: "awaiting_response",
        testMode: "landolt",
        trialIndex: 4,
        presentationId: "p-4",
        run: C_RUN,
      }),
    ).toBeNull();
  });

  it("rejects a C responded state holding a letter or a bad direction", () => {
    const base = {
      phase: "responded",
      testMode: "landolt",
      trialIndex: 4,
      presentationId: "p-4",
      responseId: "r-4",
      run: C_RUN,
    };
    expect(parseAnyLoopState({ ...base, responseKind: "letter", responseLetter: "C" })).toBeNull();
    expect(
      parseAnyLoopState({ ...base, responseKind: "direction", responseDirection: "up", responseLetter: "C" }),
    ).toBeNull();
    expect(parseAnyLoopState({ ...base, responseKind: "direction", responseDirection: "north" })).toBeNull();
    expect(parseAnyLoopState({ ...base, responseKind: "not_sure", responseDirection: "up" })).toBeNull();
  });

  it("rejects a letter responded state holding a direction kind", () => {
    expect(
      parseAnyLoopState({
        phase: "responded",
        trialIndex: 4,
        presentationId: "p-4",
        responseId: "r-4",
        responseKind: "direction",
        responseDirection: "up",
        run: LETTER_RUN,
      }),
    ).toBeNull();
  });

  it("rejects a C state whose run has no valid eye", () => {
    expect(parseAnyLoopState({ phase: "ready", run: { ...C_RUN, eye: "middle" } })).toBeNull();
    expect(parseAnyLoopState({ phase: "ready", run: { ...C_RUN, eye: undefined } })).toBeNull();
  });

  it("rejects a C awaiting state whose run is a letter run", () => {
    expect(
      parseAnyLoopState({
        phase: "awaiting_response",
        testMode: "landolt",
        trialIndex: 4,
        presentationId: "p-4",
        practice: false,
        run: LETTER_RUN,
      }),
    ).toBeNull();
  });

  it("a letter responded state is unaffected by the C rules", () => {
    const letter = respondedState({
      trialIndex: 3,
      presentationId: "p-3",
      responseId: "r-3",
      responseKind: "letter",
      responseLetter: "H",
      run: LETTER_RUN,
    });
    expect(parseAnyLoopState(letter)).toEqual(parseLoopState(letter));
  });
});

describe("parseCResult", () => {
  it("accepts every C result kind and refuses out-of-range steps", () => {
    expect(parseCResult({ kind: "measured", stepIndex: 2 })).toEqual({ kind: "measured", stepIndex: 2 });
    expect(parseCResult({ kind: "test-floor", stepIndex: -1 })).toEqual({ kind: "test-floor", stepIndex: -1 });
    expect(parseCResult({ kind: "screen-limited", stepIndex: 1 })).toEqual({
      kind: "screen-limited",
      stepIndex: 1,
    });
    expect(parseCResult({ kind: "not-measurable", coarsestStepIndex: 8 })).toEqual({
      kind: "not-measurable",
      coarsestStepIndex: 8,
    });
    expect(parseCResult({ kind: "inconsistent" })).toEqual({ kind: "inconsistent" });
    expect(parseCResult({ kind: "test-floor", stepIndex: 0 })).toBeNull();
    expect(parseCResult({ kind: "measured", stepIndex: 11 })).toBeNull();
    expect(parseCResult({ kind: "unknown" })).toBeNull();
  });
});

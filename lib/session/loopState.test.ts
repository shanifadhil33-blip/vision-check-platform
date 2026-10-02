import { describe, expect, it } from "vitest";
import {
  awaitingResponseState,
  completeState,
  parseLoopState,
  parseRunContext,
  respondedState,
  type RunContext,
} from "./loopState";

const RUN: RunContext = {
  correction: "glasses",
  stepIndices: [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  finestLimitedBy: "requested-bound",
  coarsestLimitedBy: "viewport-size",
  voidedTrialIndices: [1, 4],
};

const CHOICES = ["C", "D", "H", "K", "N"] as const;

describe("parseLoopState", () => {
  it("P1 parses awaiting_response with a valid run", () => {
    expect(
      parseLoopState({
        phase: "awaiting_response",
        trialIndex: 0,
        presentationId: "pres-1",
        choices: [...CHOICES],
        run: RUN,
      }),
    ).toEqual({
      phase: "awaiting_response",
      trialIndex: 0,
      presentationId: "pres-1",
      choices: [...CHOICES],
      run: RUN,
    });
  });

  it("P2 parses correction specs as run null and keeps the rest", () => {
    expect(
      parseLoopState({
        phase: "awaiting_response",
        trialIndex: 2,
        presentationId: "pres-2",
        choices: [...CHOICES],
        run: { ...RUN, correction: "specs" },
      }),
    ).toEqual({
      phase: "awaiting_response",
      trialIndex: 2,
      presentationId: "pres-2",
      choices: [...CHOICES],
      run: null,
    });
  });

  it("P3 parses a state with no run as run null", () => {
    const json = awaitingResponseState({
      trialIndex: 0,
      presentationId: "pres-3",
      choices: [...CHOICES],
    });
    expect(json).not.toHaveProperty("run");
    expect(parseLoopState(json)).toEqual({
      phase: "awaiting_response",
      trialIndex: 0,
      presentationId: "pres-3",
      choices: [...CHOICES],
      run: null,
    });
  });

  it("P4 round-trips a measured result through completeState and parseLoopState", () => {
    const json = completeState(4, {
      result: { kind: "measured", stepIndex: 2 },
    });
    expect(parseLoopState(json)).toEqual({
      phase: "complete",
      trialsCompleted: 4,
      run: null,
      result: { kind: "measured", stepIndex: 2 },
    });
  });

  it("P5 round-trips a responded state built with a run", () => {
    const json = respondedState({
      trialIndex: 1,
      presentationId: "pres-5",
      responseId: "resp-5",
      responseKind: "letter",
      responseLetter: "C",
      run: RUN,
    });
    expect(parseLoopState(json)).toEqual({
      phase: "responded",
      trialIndex: 1,
      presentationId: "pres-5",
      responseId: "resp-5",
      responseKind: "letter",
      responseLetter: "C",
      run: RUN,
    });
  });
});

describe("parseRunContext", () => {
  it("P6 rejects step indices 3 and 5", () => {
    expect(
      parseRunContext({
        correction: "none",
        stepIndices: [3, 5],
        finestLimitedBy: "requested-bound",
        coarsestLimitedBy: "requested-bound",
        voidedTrialIndices: [],
      }),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  awaitingResponseState,
  completeState,
  parseLoopState,
  parseRunContext,
  readyState,
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
      nextSessionId: null,
    });
  });

  it("P7 round-trips a complete state with a valid UUID nextSessionId", () => {
    const nextSessionId = "11111111-1111-4111-8111-111111111111";
    const json = completeState(3, {
      run: RUN,
      result: { kind: "measured", stepIndex: 0 },
      nextSessionId,
    });
    expect(parseLoopState(json)).toEqual({
      phase: "complete",
      trialsCompleted: 3,
      run: RUN,
      result: { kind: "measured", stepIndex: 0 },
      nextSessionId,
    });
  });

  it("P8 parses a non-UUID nextSessionId as null", () => {
    expect(
      parseLoopState({
        phase: "complete",
        trialsCompleted: 1,
        nextSessionId: "abc",
      }),
    ).toEqual({
      phase: "complete",
      trialsCompleted: 1,
      run: null,
      result: null,
      nextSessionId: null,
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

describe("ready positionConfirmed", () => {
  it("L1 round-trips a ready state with positionConfirmed true", () => {
    const json = readyState(RUN, { positionConfirmed: true });
    expect(json).toEqual({ phase: "ready", positionConfirmed: true, run: RUN });
    expect(parseLoopState(json)).toEqual({
      phase: "ready",
      run: RUN,
      positionConfirmed: true,
    });
  });

  it("L2 parses a ready state without the key as not confirmed and writes it without the key", () => {
    const json = readyState(RUN);
    expect(json).not.toHaveProperty("positionConfirmed");
    const parsed = parseLoopState({ phase: "ready", run: RUN });
    expect(parsed).not.toBeNull();
    expect(parsed?.phase).toBe("ready");
    if (parsed === null || parsed.phase !== "ready") {
      return;
    }
    expect(parsed.positionConfirmed).toBeUndefined();
    expect(parsed.run).toEqual(RUN);
  });

  it("L3 rejects positionConfirmed \"yes\"", () => {
    expect(parseLoopState({ phase: "ready", run: RUN, positionConfirmed: "yes" })).toBeNull();
  });

  it("L4 writes positionConfirmed false without the key", () => {
    const json = readyState(RUN, { positionConfirmed: false });
    expect(json).not.toHaveProperty("positionConfirmed");
    expect(json).toEqual({ phase: "ready", run: RUN });
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

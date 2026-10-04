import { describe, expect, it } from "vitest";
import { resultSentence } from "./resultWording";

describe("resultSentence", () => {
  it("W1 states 6/6 with contact lenses in the client's words", () => {
    expect(resultSentence({ kind: "measured", stepIndex: 0 }, "contacts")).toBe(
      "Your estimated distance vision with both eyes together, wearing your contact lenses, is approximately 6/6. This is a good level of distance vision. Continue your regular eye examinations.",
    );
  });

  it("W2 states 6/9 with glasses and recommends an eye examination", () => {
    expect(resultSentence({ kind: "measured", stepIndex: 2 }, "glasses")).toBe(
      "Your estimated distance vision with both eyes together, wearing your glasses, is approximately 6/9. You could not read the smaller letters needed for a 6/6 result. We recommend an eye examination to check your vision and prescription.",
    );
  });

  it("W3 names 6/7.5 without glasses or contact lenses", () => {
    expect(resultSentence({ kind: "measured", stepIndex: 1 }, "none")).toContain(
      "without glasses or contact lenses, is approximately 6/7.5.",
    );
  });

  it("W4 states the test floor is 6/5 or better", () => {
    expect(resultSentence({ kind: "test-floor", stepIndex: -1 }, "contacts")).toContain(
      "is 6/5 or better. This is a good level of distance vision.",
    );
  });

  it("W5 states a screen-limited 6/9 result in the client's words", () => {
    expect(resultSentence({ kind: "screen-limited", stepIndex: 2 }, "none")).toBe(
      "6/9 or better. You reached the smallest letters this screen can display reliably, so we could not measure whether your vision is finer than this. Continue your regular eye examinations.",
    );
  });

  it("W6 states that the largest letters could not be identified", () => {
    expect(
      resultSentence({ kind: "not-measurable", coarsestStepIndex: 10 }, "glasses"),
    ).toBe(
      "We could not obtain a result because you could not identify the largest letters at the test distance. Check your setup and try again. If you still cannot read them, arrange an eye examination promptly.",
    );
  });

  it("W7 names 6/60 when the measured step is the coarsest", () => {
    expect(resultSentence({ kind: "measured", stepIndex: 10 }, "glasses")).toContain(
      "is approximately 6/60.",
    );
  });
});

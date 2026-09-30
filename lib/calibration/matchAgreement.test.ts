import { describe, expect, it } from "vitest";
import {
  disagreementPercent,
  evaluateMatches,
} from "@/lib/calibration/matchAgreement";

describe("disagreementPercent", () => {
  it("MA1 reports 0.282087 percent between 354 and 355", () => {
    expect(disagreementPercent(354, 355)).toBeCloseTo(0.282087, 6);
  });

  it("MA2 reports 13.623978 percent between 342 and 392", () => {
    expect(disagreementPercent(342, 392)).toBeCloseTo(13.623978, 6);
  });

  it("MA3 throws RangeError for non-positive or non-finite widths", () => {
    expect(() => disagreementPercent(0, 355)).toThrow(RangeError);
    expect(() => disagreementPercent(354, 0)).toThrow(RangeError);
    expect(() => disagreementPercent(-1, 355)).toThrow(RangeError);
    expect(() => disagreementPercent(Number.NaN, 355)).toThrow(RangeError);
    expect(() => disagreementPercent(354, Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe("evaluateMatches", () => {
  it("MA4 needs another match for zero or one final", () => {
    expect(evaluateMatches([])).toEqual({ kind: "need-another" });
    expect(evaluateMatches([354])).toEqual({ kind: "need-another" });
  });

  it("MA5 agrees on 354 and 355", () => {
    const result = evaluateMatches([354, 355]);
    expect(result.kind).toEqual("agreed");
    if (result.kind !== "agreed") {
      return;
    }
    expect(result.usedAttemptIndexes).toEqual([0, 1]);
    expect(result.meanCardWidthCssPx).toBeCloseTo(354.5, 6);
    expect(result.disagreementPercent).toBeCloseTo(0.282087, 6);
  });

  it("MA6 agrees at exactly 2.0 percent", () => {
    const result = evaluateMatches([99, 101]);
    expect(result).toEqual({
      kind: "agreed",
      usedAttemptIndexes: [0, 1],
      meanCardWidthCssPx: 100,
      disagreementPercent: 2,
    });
  });

  it("MA7 agrees just under the 2 percent limit", () => {
    expect(evaluateMatches([99.1, 101]).kind).toEqual("agreed");
  });

  it("MA8 needs another match just over the 2 percent limit", () => {
    expect(disagreementPercent(98.9, 101)).toBeCloseTo(2.101051, 6);
    expect(evaluateMatches([98.9, 101])).toEqual({ kind: "need-another" });
  });

  it("MA9 fails when the closest of three finals is still over the limit", () => {
    const result = evaluateMatches([342, 392, 451]);
    expect(result.kind).toEqual("failed");
    if (result.kind !== "failed") {
      return;
    }
    expect(result.closestAttemptIndexes).toEqual([0, 1]);
    expect(result.disagreementPercent).toBeCloseTo(13.623978, 6);
  });

  it("MA10 agrees on the closest pair among three finals", () => {
    const result = evaluateMatches([355, 370, 356]);
    expect(result.kind).toEqual("agreed");
    if (result.kind !== "agreed") {
      return;
    }
    expect(result.usedAttemptIndexes).toEqual([0, 2]);
    expect(result.meanCardWidthCssPx).toBeCloseTo(355.5, 6);
    expect(result.disagreementPercent).toBeCloseTo(0.281294, 6);
  });

  it("MA11 keeps the lower indexes when every pair ties", () => {
    const result = evaluateMatches([100, 100, 100]);
    expect(result.kind).toEqual("agreed");
    if (result.kind !== "agreed") {
      return;
    }
    expect(result.usedAttemptIndexes).toEqual([0, 1]);
  });

  it("MA12 throws RangeError for more than three finals", () => {
    expect(() => evaluateMatches([100, 101, 102, 103])).toThrow(RangeError);
  });
});

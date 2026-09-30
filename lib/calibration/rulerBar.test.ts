import { describe, expect, it } from "vitest";
import {
  RULER_BAR_TARGET_MM,
  cssPxPerMmFromRulerBar,
  rulerBarCssPx,
} from "./rulerBar";

describe("cssPxPerMmFromRulerBar", () => {
  it("RB1 converts a 400 px bar measured at 96.9 mm", () => {
    expect(cssPxPerMmFromRulerBar(400, 96.9)).toBeCloseTo(4.127967, 6);
  });

  it("RB2 throws RangeError for non-positive or non-finite inputs", () => {
    expect(() => cssPxPerMmFromRulerBar(0, 96.9)).toThrow(RangeError);
    expect(() => cssPxPerMmFromRulerBar(400, 0)).toThrow(RangeError);
    expect(() => cssPxPerMmFromRulerBar(-400, 96.9)).toThrow(RangeError);
    expect(() => cssPxPerMmFromRulerBar(400, Number.NaN)).toThrow(RangeError);
  });
});

describe("rulerBarCssPx", () => {
  it("RB3 draws 413 px from an estimate of 4.128 when the cap is 1000", () => {
    expect(rulerBarCssPx({ cssPxPerMmEstimate: 4.128, maxCssPx: 1000 })).toEqual(413);
  });

  it("RB4 clamps to the maximum of 300 px", () => {
    expect(rulerBarCssPx({ cssPxPerMmEstimate: 4.128, maxCssPx: 300 })).toEqual(300);
  });

  it("RB5 keeps a floor of 1 px when the estimate rounds to nothing", () => {
    expect(rulerBarCssPx({ cssPxPerMmEstimate: 0.001, maxCssPx: 1000 })).toEqual(1);
  });
});

describe("RULER_BAR_TARGET_MM", () => {
  it("RB6 is 100 millimetres", () => {
    expect(RULER_BAR_TARGET_MM).toEqual(100);
  });
});

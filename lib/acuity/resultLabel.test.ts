import { describe, expect, it } from "vitest";
import { customerLabelForStep } from "./resultLabel";

const LABELS: Readonly<Record<number, string>> = {
  [-1]: "6/5",
  0: "6/6",
  1: "6/7.5",
  2: "6/9",
  3: "6/12",
  4: "6/15",
  5: "6/18",
  6: "6/24",
  7: "6/30",
  8: "6/36",
  9: "6/48",
  10: "6/60",
};

describe("customerLabelForStep", () => {
  it("L1 maps every step from -1 to 10 onto its customer label", () => {
    for (let stepIndex = -1; stepIndex <= 10; stepIndex += 1) {
      expect(customerLabelForStep(stepIndex)).toBe(LABELS[stepIndex]);
    }
  });

  it("L2 throws RangeError for -2, 11 and 0.5", () => {
    expect(() => customerLabelForStep(-2)).toThrow(RangeError);
    expect(() => customerLabelForStep(11)).toThrow(RangeError);
    expect(() => customerLabelForStep(0.5)).toThrow(RangeError);
  });
});

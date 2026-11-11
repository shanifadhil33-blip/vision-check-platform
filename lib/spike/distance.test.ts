import { describe, expect, it } from "vitest";
import { baselineRatio, estimatedDistanceMm } from "./distance";

describe("estimated distance = baseline distance × baseline px / current px", () => {
  it("baseline 3000 mm at 50.0 px, current 45.0 px gives 3333.3 mm", () => {
    expect(estimatedDistanceMm(3000, 50.0, 45.0)).toBeCloseTo(3333.3, 1);
    expect(baselineRatio(50.0, 45.0)).toBeCloseTo(1.1111, 4);
  });

  it("baseline 3000 mm at 50.0 px, current 55.5 px gives 2702.7 mm", () => {
    expect(estimatedDistanceMm(3000, 50.0, 55.5)).toBeCloseTo(2702.7, 1);
  });

  it("baseline 2000 mm at 75.3 px, current 83.7 px gives 1799.3 mm", () => {
    expect(estimatedDistanceMm(2000, 75.3, 83.7)).toBeCloseTo(1799.3, 1);
  });

  it("refuses zero or negative sizes", () => {
    expect(() => estimatedDistanceMm(3000, 50, 0)).toThrow(RangeError);
    expect(() => baselineRatio(-1, 50)).toThrow(RangeError);
  });
});

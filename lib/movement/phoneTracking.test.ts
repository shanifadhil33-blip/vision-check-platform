import { describe, expect, it } from "vitest";
import { baselineFromSizes, distanceRatio, nextSeq, phoneMovementStatus } from "./phoneTracking";

describe("baseline", () => {
  it("is the median of the first 30 sizes, and null before 30", () => {
    const sizes = Array.from({ length: 29 }, (_, i) => 90 + (i % 3));
    expect(baselineFromSizes(sizes)).toBeNull();
    // 30 sizes: ten each of 90, 91, 92 plus a wild 150 that comes 31st and is ignored.
    const thirty = [...Array.from({ length: 30 }, (_, i) => 90 + (i % 3)), 150];
    expect(baselineFromSizes(thirty)).toEqual({ baselinePx: 91, frames: 30 });
  });

  it("ratio = baseline px / current px: 91 / 86.67 is further away by 5 percent", () => {
    expect(distanceRatio(91, 91 / 1.05)).toBeCloseTo(1.05, 10);
    expect(distanceRatio(91, 0)).toBeNull();
    expect(distanceRatio(Number.NaN, 90)).toBeNull();
  });
});

describe("phone status", () => {
  it("lost at 2000 ms without a marker, inclusive; not at 1999 ms", () => {
    expect(phoneMovementStatus({ nowMs: 1999, lastFoundAtMs: 0, latestRatio: 1 })).toBe("ok");
    expect(phoneMovementStatus({ nowMs: 2000, lastFoundAtMs: 0, latestRatio: 1 })).toBe("lost");
    expect(phoneMovementStatus({ nowMs: 5, lastFoundAtMs: null, latestRatio: null })).toBe("lost");
  });

  it("go back just over 0.25 either way; exactly 0.25 is still fine", () => {
    expect(phoneMovementStatus({ nowMs: 10, lastFoundAtMs: 0, latestRatio: 1.25 })).toBe("ok");
    expect(phoneMovementStatus({ nowMs: 10, lastFoundAtMs: 0, latestRatio: 1.2501 })).toBe("go-back");
    expect(phoneMovementStatus({ nowMs: 10, lastFoundAtMs: 0, latestRatio: 0.7499 })).toBe("go-back");
  });
});

describe("sequence numbers", () => {
  it("start from the clock and then count up by one", () => {
    expect(nextSeq(null, 1_762_862_400_123.6)).toBe(1_762_862_400_123);
    expect(nextSeq(1_762_862_400_123, 1_762_862_400_999)).toBe(1_762_862_400_124);
  });
});

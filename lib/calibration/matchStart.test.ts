import { describe, expect, it } from "vitest";
import { pickStartWidthCssPx } from "./matchStart";

const wideBounds = { minCssPx: 100, maxCssPx: 1000 };

describe("pickStartWidthCssPx", () => {
  it("MS1 steps up 8 percent from 342 when both randoms are 0", () => {
    expect(
      pickStartWidthCssPx({
        previousFinalsCssPx: [342],
        ...wideBounds,
        offsetRandom: 0,
        directionRandom: 0,
      }),
    ).toEqual(369);
  });

  it("MS2 steps down 8 percent from 342 when directionRandom is 0.5", () => {
    expect(
      pickStartWidthCssPx({
        previousFinalsCssPx: [342],
        ...wideBounds,
        offsetRandom: 0,
        directionRandom: 0.5,
      }),
    ).toEqual(315);
  });

  it("MS3 uses the midpoint offset of 0.115 when offsetRandom is 0.5", () => {
    expect(
      pickStartWidthCssPx({
        previousFinalsCssPx: [342],
        ...wideBounds,
        offsetRandom: 0.5,
        directionRandom: 0,
      }),
    ).toEqual(381);
  });

  it("MS4 uses the opposite direction when the upward clamp is too close", () => {
    expect(
      pickStartWidthCssPx({
        previousFinalsCssPx: [342],
        minCssPx: 300,
        maxCssPx: 350,
        offsetRandom: 0,
        directionRandom: 0,
      }),
    ).toEqual(315);
  });

  it("MS5 keeps the primary clamp when neither direction is 5 percent away", () => {
    expect(
      pickStartWidthCssPx({
        previousFinalsCssPx: [342],
        minCssPx: 340,
        maxCssPx: 345,
        offsetRandom: 0,
        directionRandom: 0,
      }),
    ).toEqual(345);
  });

  it("MS6 avoids a start width that equals an earlier final", () => {
    expect(
      pickStartWidthCssPx({
        previousFinalsCssPx: [369, 342],
        ...wideBounds,
        offsetRandom: 0,
        directionRandom: 0,
      }),
    ).toEqual(315);
  });

  it("MS7 throws RangeError for an empty history or a random outside [0, 1)", () => {
    expect(() =>
      pickStartWidthCssPx({
        previousFinalsCssPx: [],
        ...wideBounds,
        offsetRandom: 0,
        directionRandom: 0,
      }),
    ).toThrow(RangeError);
    expect(() =>
      pickStartWidthCssPx({
        previousFinalsCssPx: [342],
        ...wideBounds,
        offsetRandom: 1,
        directionRandom: 0,
      }),
    ).toThrow(RangeError);
    expect(() =>
      pickStartWidthCssPx({
        previousFinalsCssPx: [342],
        ...wideBounds,
        offsetRandom: 0,
        directionRandom: -0.1,
      }),
    ).toThrow(RangeError);
    expect(() =>
      pickStartWidthCssPx({
        previousFinalsCssPx: [342],
        ...wideBounds,
        offsetRandom: Number.NaN,
        directionRandom: 0,
      }),
    ).toThrow(RangeError);
  });
});

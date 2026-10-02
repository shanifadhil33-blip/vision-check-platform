import { describe, expect, it } from "vitest";
import { computeTestLevels } from "./testLevels";

const LAPTOP = {
  pixelPitchMm: 0.16098,
  cssPxPerMm: 4.14136,
  viewportWidthCssPx: 1280,
  viewportHeightCssPx: 585,
};

const FULL = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe("computeTestLevels", () => {
  it("TL1 keeps all 12 levels from -1 to 10 on a laptop at 2000 mm in triplet format", () => {
    expect(
      computeTestLevels({
        ...LAPTOP,
        distanceMm: 2000,
        format: "flanked-triplet",
      }),
    ).toEqual({
      stepIndices: FULL,
      finestLimitedBy: "requested-bound",
      coarsestLimitedBy: "requested-bound",
    });
  });

  it("TL2 keeps all 12 levels from -1 to 10 on a laptop at 3000 mm in triplet format", () => {
    expect(
      computeTestLevels({
        ...LAPTOP,
        distanceMm: 3000,
        format: "flanked-triplet",
      }).stepIndices,
    ).toEqual(FULL);
  });

  it("TL3 drops levels finer than 0.2 when the pixel pitch is 0.5 mm", () => {
    expect(
      computeTestLevels({
        distanceMm: 2000,
        pixelPitchMm: 0.5,
        cssPxPerMm: 2,
        viewportWidthCssPx: 1280,
        viewportHeightCssPx: 585,
        format: "flanked-triplet",
      }),
    ).toEqual({
      stepIndices: [2, 3, 4, 5, 6, 7, 8, 9, 10],
      finestLimitedBy: "screen-resolution",
      coarsestLimitedBy: "requested-bound",
    });
  });

  it("TL4 drops levels coarser than 0.8 when a 700 by 400 viewport cannot fit the triplet", () => {
    expect(
      computeTestLevels({
        ...LAPTOP,
        viewportWidthCssPx: 700,
        viewportHeightCssPx: 400,
        distanceMm: 3000,
        format: "flanked-triplet",
      }),
    ).toEqual({
      stepIndices: [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8],
      finestLimitedBy: "requested-bound",
      coarsestLimitedBy: "viewport-size",
    });
  });

  it("TL5 keeps every level when that same viewport shows a single letter", () => {
    expect(
      computeTestLevels({
        ...LAPTOP,
        viewportWidthCssPx: 700,
        viewportHeightCssPx: 400,
        distanceMm: 3000,
        format: "single",
      }),
    ).toEqual({
      stepIndices: FULL,
      finestLimitedBy: "requested-bound",
      coarsestLimitedBy: "requested-bound",
    });
  });

  it("TL6 offers no levels when the pitch is too coarse even at logMAR 1.0", () => {
    expect(
      computeTestLevels({
        distanceMm: 2000,
        pixelPitchMm: 5,
        cssPxPerMm: 0.2,
        viewportWidthCssPx: 1280,
        viewportHeightCssPx: 585,
        format: "flanked-triplet",
      }),
    ).toEqual({
      stepIndices: [],
      finestLimitedBy: "screen-resolution",
      coarsestLimitedBy: "screen-resolution",
    });
  });

  it("TL7 includes logMAR 0.0 when the pitch sits just under the Carkeet limit", () => {
    expect(
      computeTestLevels({
        distanceMm: 2000,
        pixelPitchMm: 0.349,
        cssPxPerMm: 2.8653,
        viewportWidthCssPx: 1280,
        viewportHeightCssPx: 585,
        format: "flanked-triplet",
      }).stepIndices,
    ).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("TL8 starts at logMAR 0.1 when the pitch sits just over the Carkeet limit at 0.0", () => {
    expect(
      computeTestLevels({
        distanceMm: 2000,
        pixelPitchMm: 0.3491,
        cssPxPerMm: 2.8653,
        viewportWidthCssPx: 1280,
        viewportHeightCssPx: 585,
        format: "flanked-triplet",
      }),
    ).toEqual({
      stepIndices: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      finestLimitedBy: "screen-resolution",
      coarsestLimitedBy: "requested-bound",
    });
  });

  it("TL9 throws RangeError for a non-positive or non-finite measurement", () => {
    const valid = {
      ...LAPTOP,
      distanceMm: 2000,
      format: "flanked-triplet" as const,
    };
    expect(() => computeTestLevels({ ...valid, distanceMm: 0 })).toThrow(RangeError);
    expect(() => computeTestLevels({ ...valid, pixelPitchMm: -1 })).toThrow(RangeError);
    expect(() => computeTestLevels({ ...valid, cssPxPerMm: Number.NaN })).toThrow(RangeError);
    expect(() =>
      computeTestLevels({ ...valid, viewportWidthCssPx: Number.POSITIVE_INFINITY }),
    ).toThrow(RangeError);
  });

  it("TL10 keeps steps 5 to 10 when the pitch can draw logMAR 0.5 but not 0.4", () => {
    expect(
      computeTestLevels({
        distanceMm: 2000,
        pixelPitchMm: 1,
        cssPxPerMm: 2,
        viewportWidthCssPx: 1280,
        viewportHeightCssPx: 585,
        format: "flanked-triplet",
      }),
    ).toEqual({
      stepIndices: [5, 6, 7, 8, 9, 10],
      finestLimitedBy: "screen-resolution",
      coarsestLimitedBy: "requested-bound",
    });
  });
});

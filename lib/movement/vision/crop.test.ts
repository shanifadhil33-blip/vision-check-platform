import { describe, expect, it } from "vitest";
import { markerCrop, searchImageSize } from "./crop";
import { quadCentre } from "./geometry";
import { createMarkerDetector, MARKER_CELLS_ACROSS, MOVEMENT_MARKER_ID } from "./markers";
import { singleMarkerSizeCameraPx } from "./markerSize";
import { type GreyImage, refineQuad } from "./refine";
import { greyToRgba, markerRects, renderGrey } from "./synthetic";

const FRAME = { frameWidthCameraPx: 3840, frameHeightCameraPx: 2160 };

describe("marker crop", () => {
  it("a 91.2 px marker centred at (1900.4, 1000.7) gives a 3x crop of 275 x 275 from (1763, 863)", () => {
    // half = 1.5 x 91.2 = 136.8: left floor(1763.6) = 1763, right ceil(2037.2) = 2038, top floor(863.9) = 863, bottom ceil(1137.5) = 1138
    expect(
      markerCrop({ centre: { xCameraPx: 1900.4, yCameraPx: 1000.7 }, sizeCameraPx: 91.2, ...FRAME }),
    ).toEqual({ leftCameraPx: 1763, topCameraPx: 863, widthCameraPx: 275, heightCameraPx: 275 });
  });

  it("is cut back at the top-left and bottom-right frame edges", () => {
    expect(markerCrop({ centre: { xCameraPx: 50, yCameraPx: 40 }, sizeCameraPx: 100, ...FRAME })).toEqual({
      leftCameraPx: 0,
      topCameraPx: 0,
      widthCameraPx: 200,
      heightCameraPx: 190,
    });
    expect(markerCrop({ centre: { xCameraPx: 3800, yCameraPx: 2140 }, sizeCameraPx: 100, ...FRAME })).toEqual({
      leftCameraPx: 3650,
      topCameraPx: 1990,
      widthCameraPx: 190,
      heightCameraPx: 170,
    });
  });

  it("is null for a marker off the frame or a size that is not a size", () => {
    expect(markerCrop({ centre: { xCameraPx: -500, yCameraPx: 100 }, sizeCameraPx: 100, ...FRAME })).toBeNull();
    expect(markerCrop({ centre: { xCameraPx: 100, yCameraPx: 100 }, sizeCameraPx: Number.NaN, ...FRAME })).toBeNull();
  });

  it("the search image for a 3840 x 2160 frame is 1920 x 1080", () => {
    expect(searchImageSize(3840, 2160)).toEqual({ widthDetectionPx: 1920, heightDetectionPx: 1080 });
  });
});

describe("detection and refinement inside a crop", () => {
  it("give full-frame corners: the same size and centre as the whole frame", () => {
    const cellCameraPx = 7.1;
    const leftCameraPx = 101.3;
    const topCameraPx = 77.8;
    const sideCameraPx = cellCameraPx * MARKER_CELLS_ACROSS;
    const frame = renderGrey({
      widthCameraPx: 260,
      heightCameraPx: 220,
      ...markerRects(MOVEMENT_MARKER_ID, leftCameraPx, topCameraPx, cellCameraPx),
      noiseSigmaGrey: 2,
      seed: 5,
    });
    const crop = markerCrop({
      centre: { xCameraPx: leftCameraPx + sideCameraPx / 2 + 3, yCameraPx: topCameraPx + sideCameraPx / 2 - 2 },
      sizeCameraPx: sideCameraPx,
      frameWidthCameraPx: 260,
      frameHeightCameraPx: 220,
    })!;
    const values = new Float32Array(crop.widthCameraPx * crop.heightCameraPx);
    for (let row = 0; row < crop.heightCameraPx; row += 1) {
      for (let col = 0; col < crop.widthCameraPx; col += 1) {
        values[row * crop.widthCameraPx + col] =
          frame.values[(row + crop.topCameraPx) * 260 + col + crop.leftCameraPx]!;
      }
    }
    const cropImage: GreyImage = {
      values,
      widthCameraPx: crop.widthCameraPx,
      heightCameraPx: crop.heightCameraPx,
      originXCameraPx: crop.leftCameraPx,
      originYCameraPx: crop.topCameraPx,
    };
    const found = createMarkerDetector()
      .detect(greyToRgba(cropImage), crop.widthCameraPx, crop.heightCameraPx, {
        scaleX: 1,
        scaleY: 1,
        originXCameraPx: crop.leftCameraPx,
        originYCameraPx: crop.topCameraPx,
      })
      .find((marker) => marker.markerId === MOVEMENT_MARKER_ID);
    expect(found).toBeDefined();
    const refined = refineQuad(cropImage, found!.rawCorners, { cellsAcross: MARKER_CELLS_ACROSS });
    expect(refined).not.toBeNull();
    const centre = quadCentre(refined!.corners)!;
    expect(Math.abs(singleMarkerSizeCameraPx(refined!.corners)! - sideCameraPx)).toBeLessThan(0.1);
    expect(Math.abs(centre.xCameraPx - (leftCameraPx + sideCameraPx / 2))).toBeLessThan(0.1);
    expect(Math.abs(centre.yCameraPx - (topCameraPx + sideCameraPx / 2))).toBeLessThan(0.1);
  });
});

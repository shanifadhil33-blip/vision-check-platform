import { describe, expect, it } from "vitest";
import { quadCentre } from "./geometry";
import { createMarkerDetector, MARKER_CELLS_ACROSS, MOVEMENT_MARKER_ID } from "./markers";
import { singleMarkerSizeCameraPx } from "./markerSize";
import { refineQuad } from "./refine";
import { greyToRgba, markerRects, renderGrey } from "./synthetic";

/**
 * The main screen puts the marker 24 CSS px from the window's right edge. At
 * 4.176 CSS px per mm and DPR 1.5 a cell is 78 device px = 52 CSS px, so only
 * 24 / 52 = 0.46 of a cell of white is visible on the right before a dark
 * screen bezel. Marker 0 at 3 m is about 11.4 camera px per cell.
 */
describe("marker beside a dark bezel, 0.46 cell of white on its right", () => {
  it("is found and refined to within 0.1 px of its true side", () => {
    const cellCameraPx = 11.4;
    const leftCameraPx = 40.3;
    const topCameraPx = 30.6;
    const sideCameraPx = cellCameraPx * MARKER_CELLS_ACROSS;
    const rects = markerRects(MOVEMENT_MARKER_ID, leftCameraPx, topCameraPx, cellCameraPx);
    const bezelLeftCameraPx = leftCameraPx + sideCameraPx + (24 / 52) * cellCameraPx;
    const widthCameraPx = 160;
    const heightCameraPx = 160;
    const image = renderGrey({
      widthCameraPx,
      heightCameraPx,
      blackRects: [
        ...rects.blackRects,
        { leftCameraPx: bezelLeftCameraPx, topCameraPx: 0, rightCameraPx: widthCameraPx, bottomCameraPx: heightCameraPx },
      ],
      whiteRects: rects.whiteRects,
      noiseSigmaGrey: 2,
      seed: 11,
    });
    const found = createMarkerDetector()
      .detect(greyToRgba(image), widthCameraPx, heightCameraPx, {
        scaleX: 1,
        scaleY: 1,
        originXCameraPx: 0,
        originYCameraPx: 0,
      })
      .find((marker) => marker.markerId === MOVEMENT_MARKER_ID);
    expect(found).toBeDefined();
    const refined = refineQuad(image, found!.rawCorners, { cellsAcross: MARKER_CELLS_ACROSS });
    expect(refined).not.toBeNull();
    expect(Math.abs(singleMarkerSizeCameraPx(refined!.corners)! - sideCameraPx)).toBeLessThan(0.1);
    const centre = quadCentre(refined!.corners)!;
    expect(Math.abs(centre.xCameraPx - (leftCameraPx + sideCameraPx / 2))).toBeLessThan(0.1);
  });
});

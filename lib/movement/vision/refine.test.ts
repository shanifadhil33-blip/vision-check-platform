import { describe, expect, it } from "vitest";
import { quadCentre } from "./geometry";
import { createMarkerDetector, MARKER_CELLS_ACROSS, MOVEMENT_MARKER_ID } from "./markers";
import { refineQuad } from "./refine";
import { singleMarkerSizeCameraPx } from "./markerSize";
import { greyToRgba, markerRects, renderGrey } from "./synthetic";

/**
 * A black square on white, exact box-filter anti-aliasing, Gaussian noise
 * sigma 2 grey levels. Rough corners are the true corners pushed up to 0.9 px
 * off, the way a detector's integer contour corners would be.
 */
function squareCase(sideCameraPx: number) {
  const centreX = 100.25;
  const centreY = 80.6;
  const half = sideCameraPx / 2;
  const image = renderGrey({
    widthCameraPx: 200,
    heightCameraPx: 160,
    blackRects: [
      {
        leftCameraPx: centreX - half,
        topCameraPx: centreY - half,
        rightCameraPx: centreX + half,
        bottomCameraPx: centreY + half,
      },
    ],
    noiseSigmaGrey: 2,
    seed: 20261107,
  });
  const rough = [
    { xCameraPx: centreX - half + 0.9, yCameraPx: centreY - half + 0.7 },
    { xCameraPx: centreX + half - 0.6, yCameraPx: centreY - half + 0.8 },
    { xCameraPx: centreX + half - 0.7, yCameraPx: centreY + half - 0.3 },
    { xCameraPx: centreX - half + 0.8, yCameraPx: centreY + half - 0.9 },
  ];
  return { image, rough, centreX, centreY };
}

describe("sub-pixel refinement of a synthetic square", () => {
  for (const sideCameraPx of [40.3, 20.0]) {
    it(`side ${sideCameraPx} px: refined side and centre within 0.1 px`, () => {
      const { image, rough, centreX, centreY } = squareCase(sideCameraPx);
      const roughSide = singleMarkerSizeCameraPx(rough)!;
      // The rough corners alone are not good enough, so the test can only pass on refinement.
      expect(Math.abs(roughSide - sideCameraPx)).toBeGreaterThan(0.1);

      const refined = refineQuad(image, rough, { cellsAcross: MARKER_CELLS_ACROSS });
      expect(refined).not.toBeNull();
      const refinedSide = singleMarkerSizeCameraPx(refined!.corners)!;
      const centre = quadCentre(refined!.corners)!;

      expect(Math.abs(refinedSide - sideCameraPx)).toBeLessThan(0.1);
      expect(Math.abs(centre.xCameraPx - centreX)).toBeLessThan(0.1);
      expect(Math.abs(centre.yCameraPx - centreY)).toBeLessThan(0.1);
    });
  }
});

describe("js-aruco2 plus refinement on a synthetic marker", () => {
  it("finds marker 0 and refines its 50.4 px side to within 0.1 px", () => {
    const cellCameraPx = 6.3;
    const leftCameraPx = 30.4;
    const topCameraPx = 25.7;
    const sideCameraPx = cellCameraPx * MARKER_CELLS_ACROSS;
    const image = renderGrey({
      widthCameraPx: 120,
      heightCameraPx: 110,
      ...markerRects(MOVEMENT_MARKER_ID, leftCameraPx, topCameraPx, cellCameraPx),
      noiseSigmaGrey: 2,
      seed: 7,
    });
    const found = createMarkerDetector().detect(greyToRgba(image), 120, 110, {
      scaleX: 1,
      scaleY: 1,
      originXCameraPx: 0,
      originYCameraPx: 0,
    });
    const marker = found.find((candidate) => candidate.markerId === MOVEMENT_MARKER_ID);
    expect(marker).toBeDefined();

    const refined = refineQuad(image, marker!.rawCorners, { cellsAcross: MARKER_CELLS_ACROSS });
    expect(refined).not.toBeNull();
    const centre = quadCentre(refined!.corners)!;
    expect(Math.abs(singleMarkerSizeCameraPx(refined!.corners)! - sideCameraPx)).toBeLessThan(0.1);
    expect(Math.abs(centre.xCameraPx - (leftCameraPx + sideCameraPx / 2))).toBeLessThan(0.1);
    expect(Math.abs(centre.yCameraPx - (topCameraPx + sideCameraPx / 2))).toBeLessThan(0.1);
  });
});

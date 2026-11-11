import { describe, expect, it } from "vitest";
import type { CameraPoint } from "./geometry";
import { cornerSpanFromCornersCameraPx } from "./sizeMetrics";

/**
 * A trapezoid around a centre whose diagonals cross exactly at that centre.
 * Taller on one side, so the mean of its four corners is NOT the centre:
 * a span computed from corner means would be off by 3.3 px.
 */
function trapezoidAround(
  centreXCameraPx: number,
  centreYCameraPx: number,
  tallerOnLeft: boolean,
): CameraPoint[] {
  // Base shape: x ±10, left side y ±14, right side y ±10. Its diagonals cross at
  // (+1.6667, 0) for a taller left side; shift so they cross at the centre.
  const sign = tallerOnLeft ? 1 : -1;
  const leftHalf = tallerOnLeft ? 14 : 10;
  const rightHalf = tallerOnLeft ? 10 : 14;
  const shiftX = -sign * (10 / 6);
  return [
    { xCameraPx: centreXCameraPx - 10 + shiftX, yCameraPx: centreYCameraPx - leftHalf },
    { xCameraPx: centreXCameraPx + 10 + shiftX, yCameraPx: centreYCameraPx - rightHalf },
    { xCameraPx: centreXCameraPx + 10 + shiftX, yCameraPx: centreYCameraPx + rightHalf },
    { xCameraPx: centreXCameraPx - 10 + shiftX, yCameraPx: centreYCameraPx + leftHalf },
  ];
}

describe("corner span from four markers", () => {
  it("is the mean of the two horizontal centre-to-centre distances, within 0.1 px", () => {
    const span = cornerSpanFromCornersCameraPx({
      topLeft: trapezoidAround(100, 100, true),
      topRight: trapezoidAround(400, 104, false),
      bottomRight: trapezoidAround(402, 302, false),
      bottomLeft: trapezoidAround(98, 300, true),
    });
    // top: hypot(300, 4) = 300.0267; bottom: hypot(304, 2) = 304.0066; mean 302.0166
    expect(span).not.toBeNull();
    expect(Math.abs(span! - 302.0166)).toBeLessThan(0.1);
  });
});

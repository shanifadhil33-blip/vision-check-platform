import { describe, expect, it } from "vitest";
import { MOVEMENT_MARKER_BITS } from "./markerCells";
import { markerDataBits, MOVEMENT_MARKER_ID } from "./markers";

describe("marker cells drawn by the main screen", () => {
  it("match the js-aruco2 ARUCO_MIP_36h12 dictionary for marker 0", () => {
    expect(MOVEMENT_MARKER_BITS).toBe(markerDataBits(MOVEMENT_MARKER_ID));
    expect(MOVEMENT_MARKER_BITS).toHaveLength(36);
  });
});

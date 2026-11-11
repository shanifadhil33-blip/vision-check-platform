/**
 * Single-marker size: a length in camera pixels, so it scales as 1 / distance.
 * Never an area.
 */

import { type CameraPoint, sideLengthsCameraPx } from "./geometry";

/** The mean of the marker's four side lengths, in camera px. */
export function singleMarkerSizeCameraPx(corners: readonly CameraPoint[]): number | null {
  const lengths = sideLengthsCameraPx(corners);
  if (lengths.length !== 4) {
    return null;
  }
  return (lengths[0]! + lengths[1]! + lengths[2]! + lengths[3]!) / 4;
}

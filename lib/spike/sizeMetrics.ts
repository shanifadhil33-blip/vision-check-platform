/**
 * Size metrics for the camera spike. Each is a length in camera pixels, so it
 * scales as 1 / distance. Never an area.
 */

import { type CameraPoint, distanceCameraPx, quadCentre, sideLengthsCameraPx } from "./geometry";

/** Single marker: the mean of its four side lengths, in camera px. */
export function singleMarkerSizeCameraPx(corners: readonly CameraPoint[]): number | null {
  const lengths = sideLengthsCameraPx(corners);
  if (lengths.length !== 4) {
    return null;
  }
  return (lengths[0]! + lengths[1]! + lengths[2]! + lengths[3]!) / 4;
}

export type CornerMarkerCorners = {
  topLeft: readonly CameraPoint[];
  topRight: readonly CameraPoint[];
  bottomRight: readonly CameraPoint[];
  bottomLeft: readonly CameraPoint[];
};

export type CornerMarkerCentres = {
  topLeft: CameraPoint;
  topRight: CameraPoint;
  bottomRight: CameraPoint;
  bottomLeft: CameraPoint;
};

/** Corner pattern: the mean of the two horizontal centre-to-centre distances, in camera px. */
export function cornerSpanCameraPx(centres: CornerMarkerCentres): number {
  const topSpanCameraPx = distanceCameraPx(centres.topLeft, centres.topRight);
  const bottomSpanCameraPx = distanceCameraPx(centres.bottomLeft, centres.bottomRight);
  return (topSpanCameraPx + bottomSpanCameraPx) / 2;
}

/** Centres from each marker's diagonals, then the span. Null if any centre is undefined. */
export function cornerSpanFromCornersCameraPx(markers: CornerMarkerCorners): number | null {
  const topLeft = quadCentre(markers.topLeft);
  const topRight = quadCentre(markers.topRight);
  const bottomRight = quadCentre(markers.bottomRight);
  const bottomLeft = quadCentre(markers.bottomLeft);
  if (topLeft === null || topRight === null || bottomRight === null || bottomLeft === null) {
    return null;
  }
  return cornerSpanCameraPx({ topLeft, topRight, bottomRight, bottomLeft });
}

/**
 * The crop the phone reads from each full-resolution frame once the marker
 * is found: CROP_SIZE_FACTOR times the marker's size, centred on where it
 * was last seen, cut back at the frame edges. Pure numbers.
 */

import type { CameraPoint } from "./geometry";

export const CROP_SIZE_FACTOR = 3;
/** Until the marker is found, detection runs on a copy of the frame at this scale. */
export const SEARCH_SCALE = 0.5;
/** A crop smaller than this on either side is not worth reading. */
export const MIN_CROP_CAMERA_PX = 16;

export type CropRect = {
  leftCameraPx: number;
  topCameraPx: number;
  widthCameraPx: number;
  heightCameraPx: number;
};

/** Whole camera pixels; null when the marker is off the frame or the crop too small. */
export function markerCrop(input: {
  centre: CameraPoint;
  sizeCameraPx: number;
  frameWidthCameraPx: number;
  frameHeightCameraPx: number;
  factor?: number;
}): CropRect | null {
  const factor = input.factor ?? CROP_SIZE_FACTOR;
  if (!Number.isFinite(input.sizeCameraPx) || input.sizeCameraPx <= 0) {
    return null;
  }
  const halfCameraPx = (factor * input.sizeCameraPx) / 2;
  const left = Math.max(0, Math.floor(input.centre.xCameraPx - halfCameraPx));
  const top = Math.max(0, Math.floor(input.centre.yCameraPx - halfCameraPx));
  const right = Math.min(input.frameWidthCameraPx, Math.ceil(input.centre.xCameraPx + halfCameraPx));
  const bottom = Math.min(input.frameHeightCameraPx, Math.ceil(input.centre.yCameraPx + halfCameraPx));
  const width = right - left;
  const height = bottom - top;
  if (width < MIN_CROP_CAMERA_PX || height < MIN_CROP_CAMERA_PX) {
    return null;
  }
  return { leftCameraPx: left, topCameraPx: top, widthCameraPx: width, heightCameraPx: height };
}

/** The half-scale search image's size for a frame. */
export function searchImageSize(
  frameWidthCameraPx: number,
  frameHeightCameraPx: number,
): { widthDetectionPx: number; heightDetectionPx: number } {
  return {
    widthDetectionPx: Math.max(1, Math.round(frameWidthCameraPx * SEARCH_SCALE)),
    heightDetectionPx: Math.max(1, Math.round(frameHeightCameraPx * SEARCH_SCALE)),
  };
}

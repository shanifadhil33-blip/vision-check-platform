/**
 * Marker dictionary, detector wrapper and ids for the camera spike.
 * js-aruco2 is pure JavaScript; nothing here touches the DOM.
 */

import jsAruco from "js-aruco2";
import type { CameraPoint } from "./geometry";

export const SPIKE_DICTIONARY_NAME = "ARUCO_MIP_36h12";

/** 6 x 6 data cells plus a one-cell black border on each side. */
export const MARKER_CELLS_ACROSS = 8;

export const CENTRE_MARKER_ID = 0;
export const CORNER_MARKER_IDS = {
  topLeft: 1,
  topRight: 2,
  bottomRight: 3,
  bottomLeft: 4,
} as const;

/** 36 characters, row by row; "1" is a white data cell, "0" black. */
export function markerDataBits(markerId: number): string {
  const dictionary = new jsAruco.AR.Dictionary(SPIKE_DICTIONARY_NAME);
  const bits = dictionary.codeList[markerId];
  if (bits === undefined) {
    throw new RangeError(`No marker ${markerId} in ${SPIKE_DICTIONARY_NAME}`);
  }
  return bits;
}

export type DetectedMarker = {
  markerId: number;
  /** js-aruco2 corners mapped to full-frame camera px (pixel centres, see geometry.ts). */
  rawCorners: CameraPoint[];
};

export type MarkerDetector = {
  detect(
    rgba: Uint8ClampedArray,
    widthDetectionPx: number,
    heightDetectionPx: number,
    detectionScaleX: number,
    detectionScaleY: number,
  ): DetectedMarker[];
};

/**
 * detectionScaleX is detection image width / full frame width (Y likewise).
 * A detection pixel index j covers full-frame [j / scale, (j + 1) / scale],
 * so its centre maps to (j + 0.5) / scale.
 */
export function createMarkerDetector(): MarkerDetector {
  const detector = new jsAruco.AR.Detector({ dictionaryName: SPIKE_DICTIONARY_NAME });
  return {
    detect(rgba, widthDetectionPx, heightDetectionPx, detectionScaleX, detectionScaleY) {
      const found = detector.detect({
        width: widthDetectionPx,
        height: heightDetectionPx,
        data: rgba,
      });
      return found.map((marker) => ({
        markerId: marker.id,
        rawCorners: marker.corners.map((corner) => ({
          xCameraPx: (corner.x + 0.5) / detectionScaleX,
          yCameraPx: (corner.y + 0.5) / detectionScaleY,
        })),
      }));
    },
  };
}

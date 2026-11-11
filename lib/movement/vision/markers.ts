/**
 * Marker dictionary, detector wrapper and the marker id for movement
 * detection. js-aruco2 is pure JavaScript; nothing here touches the DOM.
 */

import jsAruco from "js-aruco2";
import type { CameraPoint } from "./geometry";
import { MARKER_DICTIONARY_NAME } from "./markerCells";

export { MARKER_CELLS_ACROSS, MARKER_DICTIONARY_NAME, MOVEMENT_MARKER_ID } from "./markerCells";

/** 36 characters, row by row; "1" is a white data cell, "0" black. */
export function markerDataBits(markerId: number): string {
  const dictionary = new jsAruco.AR.Dictionary(MARKER_DICTIONARY_NAME);
  const bits = dictionary.codeList[markerId];
  if (bits === undefined) {
    throw new RangeError(`No marker ${markerId} in ${MARKER_DICTIONARY_NAME}`);
  }
  return bits;
}

export type DetectedMarker = {
  markerId: number;
  /** js-aruco2 corners mapped to full-frame camera px (pixel centres, see geometry.ts). */
  rawCorners: CameraPoint[];
};

/**
 * Where a detection image sits in the full camera frame. scaleX is detection
 * image width / covered frame width (Y likewise); origin is the covered
 * region's top-left in full-frame camera px (0, 0 for the whole frame).
 */
export type DetectionMapping = {
  scaleX: number;
  scaleY: number;
  originXCameraPx: number;
  originYCameraPx: number;
};

export type MarkerDetector = {
  detect(
    rgba: Uint8ClampedArray,
    widthDetectionPx: number,
    heightDetectionPx: number,
    mapping: DetectionMapping,
  ): DetectedMarker[];
};

/**
 * A detection pixel index j covers frame [origin + j / scale, origin + (j + 1) / scale],
 * so its centre maps to origin + (j + 0.5) / scale.
 */
export function createMarkerDetector(): MarkerDetector {
  const detector = new jsAruco.AR.Detector({ dictionaryName: MARKER_DICTIONARY_NAME });
  return {
    detect(rgba, widthDetectionPx, heightDetectionPx, mapping) {
      const found = detector.detect({
        width: widthDetectionPx,
        height: heightDetectionPx,
        data: rgba,
      });
      return found.map((marker) => ({
        markerId: marker.id,
        rawCorners: marker.corners.map((corner) => ({
          xCameraPx: mapping.originXCameraPx + (corner.x + 0.5) / mapping.scaleX,
          yCameraPx: mapping.originYCameraPx + (corner.y + 0.5) / mapping.scaleY,
        })),
      }));
    },
  };
}

/**
 * Where the laptop page draws its markers, in whole device pixels.
 * Same chain as TripletCanvas: mm → CSS px (calibration) → device px (× DPR).
 */

import { mmToCssPx } from "@/lib/calibration";
import { CENTRE_MARKER_ID, CORNER_MARKER_IDS, MARKER_CELLS_ACROSS } from "./markers";

export type MarkerMode = "centre" | "corners" | "both";

export const CENTRE_MARKER_SIZES_MM = [60, 80, 100] as const;
export const CORNER_MARKER_SIZES_MM = [30, 35, 40] as const;
export const CORNER_INSET_MM = 8;

export type MarkerRole = "centre" | "topLeft" | "topRight" | "bottomRight" | "bottomLeft";

export type PlacedMarker = {
  role: MarkerRole;
  markerId: number;
  requestedSideMm: number;
  leftDevicePx: number;
  topDevicePx: number;
  cellDevicePx: number;
  sideDevicePx: number;
  drawnSideMm: number;
};

export type MarkerLayout = {
  canvasWidthDevicePx: number;
  canvasHeightDevicePx: number;
  canvasWidthCssPx: number;
  canvasHeightCssPx: number;
  devicePxPerMm: number;
  markers: PlacedMarker[];
  /** Horizontal centre-to-centre distance between the top corner markers (equals the bottom). */
  cornerSpanMm: number | null;
  warnings: string[];
};

/** Side snapped to a whole number of device pixels per cell. */
export function snappedMarkerSize(
  requestedSideMm: number,
  cssPxPerMm: number,
  devicePixelRatio: number,
): { cellDevicePx: number; sideDevicePx: number } {
  const requestedSideCssPx = mmToCssPx(requestedSideMm, cssPxPerMm);
  const requestedSideDevicePx = requestedSideCssPx * devicePixelRatio;
  const cellDevicePx = Math.max(1, Math.round(requestedSideDevicePx / MARKER_CELLS_ACROSS));
  return { cellDevicePx, sideDevicePx: cellDevicePx * MARKER_CELLS_ACROSS };
}

export function computeMarkerLayout(input: {
  viewportWidthCssPx: number;
  viewportHeightCssPx: number;
  cssPxPerMm: number;
  devicePixelRatio: number;
  mode: MarkerMode;
  centreSideMm: number;
  cornerSideMm: number;
}): MarkerLayout {
  const dpr = input.devicePixelRatio;
  const canvasWidthDevicePx = Math.max(1, Math.floor(input.viewportWidthCssPx * dpr));
  const canvasHeightDevicePx = Math.max(1, Math.floor(input.viewportHeightCssPx * dpr));
  const devicePxPerMm = mmToCssPx(1, input.cssPxPerMm) * dpr;
  const markers: PlacedMarker[] = [];

  function place(
    role: MarkerRole,
    markerId: number,
    requestedSideMm: number,
    size: { cellDevicePx: number; sideDevicePx: number },
    leftDevicePx: number,
    topDevicePx: number,
  ): void {
    markers.push({
      role,
      markerId,
      requestedSideMm,
      leftDevicePx,
      topDevicePx,
      cellDevicePx: size.cellDevicePx,
      sideDevicePx: size.sideDevicePx,
      drawnSideMm: size.sideDevicePx / devicePxPerMm,
    });
  }

  if (input.mode === "centre" || input.mode === "both") {
    const size = snappedMarkerSize(input.centreSideMm, input.cssPxPerMm, dpr);
    place(
      "centre",
      CENTRE_MARKER_ID,
      input.centreSideMm,
      size,
      Math.round((canvasWidthDevicePx - size.sideDevicePx) / 2),
      Math.round((canvasHeightDevicePx - size.sideDevicePx) / 2),
    );
  }

  let cornerSpanMm: number | null = null;
  if (input.mode === "corners" || input.mode === "both") {
    const size = snappedMarkerSize(input.cornerSideMm, input.cssPxPerMm, dpr);
    const insetDevicePx = Math.round(mmToCssPx(CORNER_INSET_MM, input.cssPxPerMm) * dpr);
    const rightDevicePx = canvasWidthDevicePx - insetDevicePx - size.sideDevicePx;
    const bottomDevicePx = canvasHeightDevicePx - insetDevicePx - size.sideDevicePx;
    place("topLeft", CORNER_MARKER_IDS.topLeft, input.cornerSideMm, size, insetDevicePx, insetDevicePx);
    place("topRight", CORNER_MARKER_IDS.topRight, input.cornerSideMm, size, rightDevicePx, insetDevicePx);
    place("bottomRight", CORNER_MARKER_IDS.bottomRight, input.cornerSideMm, size, rightDevicePx, bottomDevicePx);
    place("bottomLeft", CORNER_MARKER_IDS.bottomLeft, input.cornerSideMm, size, insetDevicePx, bottomDevicePx);
    cornerSpanMm = (rightDevicePx - insetDevicePx) / devicePxPerMm;
  }

  return {
    canvasWidthDevicePx,
    canvasHeightDevicePx,
    canvasWidthCssPx: canvasWidthDevicePx / dpr,
    canvasHeightCssPx: canvasHeightDevicePx / dpr,
    devicePxPerMm,
    markers,
    cornerSpanMm,
    warnings: layoutWarnings(markers, canvasWidthDevicePx, canvasHeightDevicePx),
  };
}

/** Each marker plus a one-cell quiet zone must sit inside the canvas and not touch another. */
function layoutWarnings(
  markers: readonly PlacedMarker[],
  canvasWidthDevicePx: number,
  canvasHeightDevicePx: number,
): string[] {
  const warnings: string[] = [];
  const boxes = markers.map((marker) => ({
    role: marker.role,
    left: marker.leftDevicePx - marker.cellDevicePx,
    top: marker.topDevicePx - marker.cellDevicePx,
    right: marker.leftDevicePx + marker.sideDevicePx + marker.cellDevicePx,
    bottom: marker.topDevicePx + marker.sideDevicePx + marker.cellDevicePx,
  }));
  for (const box of boxes) {
    if (box.left < 0 || box.top < 0 || box.right > canvasWidthDevicePx || box.bottom > canvasHeightDevicePx) {
      warnings.push(`The ${box.role} marker and its quiet zone do not fit in the window.`);
    }
  }
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i]!;
      const b = boxes[j]!;
      if (a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom) {
        warnings.push(`The ${a.role} and ${b.role} markers overlap (quiet zones included).`);
      }
    }
  }
  return warnings;
}

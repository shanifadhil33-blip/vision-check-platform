/**
 * Where the main screen draws its distance marker, and whether a letter
 * fits beside it. Pure numbers. Same chain as the letters:
 * mm → CSS px (calibration) → device px (× DPR), each cell a whole number
 * of device pixels.
 */

import { mmToCssPx } from "@/lib/calibration";
import { MARKER_CELLS_ACROSS } from "./vision/markerCells";

export const MARKER_REQUESTED_SIDE_MM = 100;
export const MARKER_SLOT_MARGIN_CSS_PX = 24;

export type MarkerSlot = {
  cellDevicePx: number;
  sideDevicePx: number;
  sideCssPx: number;
  /** The side actually drawn, from the whole-pixel cell. */
  drawnSideMm: number;
  /** The marker's own top-left corner (not its quiet zone), in CSS px. */
  leftCssPx: number;
  topCssPx: number;
  leftDevicePx: number;
  topDevicePx: number;
  /** One cell of white around the marker. */
  quietZoneDevicePx: number;
  /** Window width minus the marker and its two margins. */
  contentWidthCssPx: number;
};

export type LetterLayout = "side-by-side" | "between-letters";

/** Side snapped to a whole number of device pixels per cell. */
export function snappedMarkerSize(
  requestedSideMm: number,
  cssPxPerMm: number,
  devicePixelRatio: number,
): { cellDevicePx: number; sideDevicePx: number } {
  const requestedSideDevicePx = mmToCssPx(requestedSideMm, cssPxPerMm) * devicePixelRatio;
  const cellDevicePx = Math.max(1, Math.round(requestedSideDevicePx / MARKER_CELLS_ACROSS));
  return { cellDevicePx, sideDevicePx: cellDevicePx * MARKER_CELLS_ACROSS };
}

/**
 * Right edge of the window, MARKER_SLOT_MARGIN_CSS_PX in from it, vertically
 * centred. Positions are whole device pixels so every cell edge is crisp.
 */
export function markerSlot(input: {
  viewportWidthCssPx: number;
  viewportHeightCssPx: number;
  cssPxPerMm: number;
  devicePixelRatio: number;
}): MarkerSlot {
  const dpr = input.devicePixelRatio;
  const size = snappedMarkerSize(MARKER_REQUESTED_SIDE_MM, input.cssPxPerMm, dpr);
  const windowWidthDevicePx = Math.floor(input.viewportWidthCssPx * dpr);
  const windowHeightDevicePx = Math.floor(input.viewportHeightCssPx * dpr);
  const marginDevicePx = Math.round(MARKER_SLOT_MARGIN_CSS_PX * dpr);
  const leftDevicePx = windowWidthDevicePx - marginDevicePx - size.sideDevicePx;
  const topDevicePx = Math.round((windowHeightDevicePx - size.sideDevicePx) / 2);
  const sideCssPx = size.sideDevicePx / dpr;
  return {
    cellDevicePx: size.cellDevicePx,
    sideDevicePx: size.sideDevicePx,
    sideCssPx,
    drawnSideMm: size.sideDevicePx / (input.cssPxPerMm * dpr),
    leftCssPx: leftDevicePx / dpr,
    topCssPx: topDevicePx / dpr,
    leftDevicePx,
    topDevicePx,
    quietZoneDevicePx: size.cellDevicePx,
    contentWidthCssPx: input.viewportWidthCssPx - (sideCssPx + 2 * MARKER_SLOT_MARGIN_CSS_PX),
  };
}

/** The arrow above the target letter: clamp(12, L, 40) CSS px, and the same gap. */
function arrowCssPx(letterHeightCssPx: number): number {
  return Math.min(40, Math.max(12, letterHeightCssPx));
}

/**
 * Side by side when the five-letter-wide row fits the content area and the
 * taller of the marker and the letter-plus-arrow fits the window height,
 * each with 48 CSS px to spare. Otherwise the marker is shown only between letters.
 */
export function letterLayout(input: {
  slot: MarkerSlot;
  viewportHeightCssPx: number;
  letterHeightCssPx: number;
}): LetterLayout {
  const letterCssPx = input.letterHeightCssPx;
  const fitsWidth = 5 * letterCssPx + 48 <= input.slot.contentWidthCssPx;
  const columnHeightCssPx = Math.max(input.slot.sideCssPx, letterCssPx + 2 * arrowCssPx(letterCssPx));
  const fitsHeight = columnHeightCssPx + 48 <= input.viewportHeightCssPx;
  return fitsWidth && fitsHeight ? "side-by-side" : "between-letters";
}

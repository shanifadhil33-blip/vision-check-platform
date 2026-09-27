import { CARD_WIDTH_MM } from "@/lib/calibration";
import { CARD_ZONE_MARGIN_CSS_PX } from "./CardZone";

export const MIN_CARD_WIDTH_CSS_PX = 120;
export const ABSOLUTE_MAX_CARD_WIDTH_CSS_PX = 900;
/** Starting guess: 4.0 CSS px per mm. */
export const DEFAULT_CARD_WIDTH_CSS_PX = Math.round(4 * CARD_WIDTH_MM);

export function maxCardWidthCssPx(viewportWidthCssPx: number): number {
  return Math.min(
    ABSOLUTE_MAX_CARD_WIDTH_CSS_PX,
    Math.max(MIN_CARD_WIDTH_CSS_PX, viewportWidthCssPx - CARD_ZONE_MARGIN_CSS_PX * 2),
  );
}

export function clampCardWidthCssPx(widthCssPx: number, maxCssPx: number): number {
  return Math.min(maxCssPx, Math.max(MIN_CARD_WIDTH_CSS_PX, widthCssPx));
}

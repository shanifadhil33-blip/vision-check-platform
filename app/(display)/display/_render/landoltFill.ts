import type { LandoltDirection } from "@/lib/acuity/landoltStaircase";
import { LANDOLT_BOX_UNITS, traceLandoltPath } from "@/lib/acuity/landoltShape";

/**
 * Fills one Landolt C in a sizeCssPx square at the origin, black, with the
 * same device-pixel transform as strokeLetterAt: setTransform(dpr), then
 * scale by sizeCssPx / 5 so the 0 to 5 unit box maps to the letter height.
 * Filled, not stroked: the outline already holds the ring width and the gap.
 */
export function fillLandoltAt(
  ctx: CanvasRenderingContext2D,
  direction: LandoltDirection,
  dpr: number,
  sizeCssPx: number,
  originXCssPx: number,
  originYCssPx: number,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(originXCssPx, originYCssPx);
  const unitScale = sizeCssPx / LANDOLT_BOX_UNITS;
  ctx.scale(unitScale, unitScale);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, LANDOLT_BOX_UNITS, LANDOLT_BOX_UNITS);
  ctx.clip();
  traceLandoltPath(ctx, direction);
  ctx.fillStyle = "#000000";
  ctx.fill("nonzero");
  ctx.restore();
}

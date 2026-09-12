import {
  measureAllRuns,
  measureInkBounds,
  type InkRun,
} from "@/lib/acuity/measure";
import { SLOAN_GRID_UNITS, sloanPath, type SloanLetter } from "@/lib/acuity/sloan";

/** H at quarter-height has two stems and no crossbar. */
export const H_STROKE_SCAN_EXPECTED_RUNS = 2;
export const H_STROKE_SCAN_FRACTION = 0.25;

export function strokeLetterAt(
  ctx: CanvasRenderingContext2D,
  letter: SloanLetter,
  dpr: number,
  sizeCssPx: number,
  originXCssPx: number,
  originYCssPx: number,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.translate(originXCssPx, originYCssPx);
  const unitScale = sizeCssPx / SLOAN_GRID_UNITS;
  ctx.scale(unitScale, unitScale);
  ctx.save();
  // Clip to the letter box so diagonal strokes and miters cannot paint outside 0..5.
  ctx.beginPath();
  ctx.rect(0, 0, SLOAN_GRID_UNITS, SLOAN_GRID_UNITS);
  ctx.clip();
  const path = new Path2D(sloanPath(letter));
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 1;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.miterLimit = 10;
  ctx.stroke(path);
  ctx.restore();
}

export function strokeLetter(
  ctx: CanvasRenderingContext2D,
  letter: SloanLetter,
  dpr: number,
  sizeCssPx: number,
): void {
  strokeLetterAt(ctx, letter, dpr, sizeCssPx, 0, 0);
}

export function measureHStrokeScan(
  widthDevicePx: number,
  heightDevicePx: number,
  dpr: number,
  sizeCssPx: number,
): {
  strokeScanRowDevicePx: number | null;
  strokeScanPercentOfInkHeight: number | null;
  strokeRuns: InkRun[];
  strokeWidthDevicePx: number | null;
} {
  const canvas = document.createElement("canvas");
  canvas.width = widthDevicePx;
  canvas.height = heightDevicePx;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (ctx === null) {
    return {
      strokeScanRowDevicePx: null,
      strokeScanPercentOfInkHeight: null,
      strokeRuns: [],
      strokeWidthDevicePx: null,
    };
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, widthDevicePx, heightDevicePx);
  strokeLetter(ctx, "H", dpr, sizeCssPx);
  const image = ctx.getImageData(0, 0, widthDevicePx, heightDevicePx);
  const hBounds = measureInkBounds(image.data, widthDevicePx, heightDevicePx);
  if (hBounds === null) {
    return {
      strokeScanRowDevicePx: null,
      strokeScanPercentOfInkHeight: null,
      strokeRuns: [],
      strokeWidthDevicePx: null,
    };
  }

  const scanRowY = hBounds.top + Math.floor(hBounds.heightPx * H_STROKE_SCAN_FRACTION);
  const strokeRuns = measureAllRuns(image.data, widthDevicePx, heightDevicePx, scanRowY);
  const strokeScanPercentOfInkHeight =
    hBounds.heightPx === 0 ? null : ((scanRowY - hBounds.top) / hBounds.heightPx) * 100;
  const strokeWidthDevicePx =
    strokeRuns.length === H_STROKE_SCAN_EXPECTED_RUNS
      ? strokeRuns.reduce((sum, run) => sum + run.widthPx, 0) / strokeRuns.length
      : null;

  return {
    strokeScanRowDevicePx: scanRowY,
    strokeScanPercentOfInkHeight,
    strokeRuns,
    strokeWidthDevicePx,
  };
}

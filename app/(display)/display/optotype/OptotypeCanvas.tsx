"use client";

import { useEffect, useRef } from "react";
import { mmToCssPx } from "@/lib/calibration";
import { letterHeightMmForLogMar } from "@/lib/acuity/logmar";
import {
  measureAllRuns,
  measureInkBounds,
  type InkBounds,
  type InkRun,
} from "@/lib/acuity/measure";
import { SLOAN_GRID_UNITS, sloanPath, type SloanLetter } from "@/lib/acuity/sloan";

/** H at quarter-height has two stems and no crossbar. */
export const H_STROKE_SCAN_EXPECTED_RUNS = 2;
export const H_STROKE_SCAN_FRACTION = 0.25;

export type OptotypeMeasurement = {
  inkBounds: InkBounds | null;
  /** H stroke scan: row in device px, fraction of ink height, runs, mean width. */
  strokeScanRowDevicePx: number | null;
  strokeScanPercentOfInkHeight: number | null;
  strokeRuns: InkRun[];
  /** Mean run width when run count is as expected; otherwise null. */
  strokeWidthDevicePx: number | null;
  canvasWidthDevicePx: number;
  canvasHeightDevicePx: number;
};

type OptotypeCanvasProps = {
  letter: SloanLetter;
  logMar: number;
  distanceMm: number;
  cssPxPerMm: number;
  devicePixelRatio: number;
  showGrid?: boolean;
  onMeasured?: ((measurement: OptotypeMeasurement) => void) | undefined;
};

function strokeLetter(
  ctx: CanvasRenderingContext2D,
  letter: SloanLetter,
  dpr: number,
  sizeCssPx: number,
): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
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

function drawGrid(ctx: CanvasRenderingContext2D, dpr: number, sizeCssPx: number): void {
  // Same setTransform + unitScale as strokeLetter: grid lines at 0..5 in letter space.
  // Drawn without the letter clip so the full grid remains the visual reference.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const unitScale = sizeCssPx / SLOAN_GRID_UNITS;
  ctx.scale(unitScale, unitScale);
  ctx.strokeStyle = "#d4d4d4";
  ctx.lineWidth = 1 / unitScale;
  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  for (let i = 0; i <= SLOAN_GRID_UNITS; i += 1) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, SLOAN_GRID_UNITS);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(SLOAN_GRID_UNITS, i);
    ctx.stroke();
  }
}

function measureHStrokeScan(
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

export function OptotypeCanvas({
  letter,
  logMar,
  distanceMm,
  cssPxPerMm,
  devicePixelRatio,
  showGrid = false,
  onMeasured,
}: OptotypeCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const letterHeightMm = letterHeightMmForLogMar(logMar, distanceMm);
  const letterHeightCssPx = mmToCssPx(letterHeightMm, cssPxPerMm);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }

    const dpr = devicePixelRatio;
    const sizeCssPx = letterHeightCssPx;
    const widthDevicePx = Math.max(1, Math.round(sizeCssPx * dpr));
    const heightDevicePx = Math.max(1, Math.round(sizeCssPx * dpr));
    canvas.width = widthDevicePx;
    canvas.height = heightDevicePx;
    canvas.style.width = `${sizeCssPx}px`;
    canvas.style.height = `${sizeCssPx}px`;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx === null) {
      return;
    }

    // Transparent clear so alpha marks ink only for measurement.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, widthDevicePx, heightDevicePx);
    strokeLetter(ctx, letter, dpr, sizeCssPx);

    const image = ctx.getImageData(0, 0, widthDevicePx, heightDevicePx);
    const inkBounds = measureInkBounds(image.data, widthDevicePx, heightDevicePx);
    const strokeScan = measureHStrokeScan(widthDevicePx, heightDevicePx, dpr, sizeCssPx);

    onMeasured?.({
      inkBounds,
      ...strokeScan,
      canvasWidthDevicePx: widthDevicePx,
      canvasHeightDevicePx: heightDevicePx,
    });

    // White chart background behind the ink (destination-over).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, widthDevicePx, heightDevicePx);
    ctx.globalCompositeOperation = "source-over";

    if (showGrid) {
      // Same transform and 0..5 span as the letter; redraw letter above the grid.
      drawGrid(ctx, dpr, sizeCssPx);
      strokeLetter(ctx, letter, dpr, sizeCssPx);
    }
  }, [letter, letterHeightCssPx, devicePixelRatio, showGrid, onMeasured]);

  return (
    <canvas
      ref={canvasRef}
      aria-label={`Sloan letter ${letter}`}
      style={{
        display: "block",
        backgroundColor: "#ffffff",
        width: `${letterHeightCssPx}px`,
        height: `${letterHeightCssPx}px`,
      }}
    />
  );
}

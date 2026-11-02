"use client";

import { useEffect, useRef } from "react";
import { mmToCssPx } from "@/lib/calibration";
import { letterHeightMmForLogMar } from "@/lib/acuity/logmar";
import { measureInkBounds, type InkBounds } from "@/lib/acuity/measure";
import type { LandoltDirection } from "@/lib/acuity/landoltStaircase";
import { fillLandoltAt } from "@/app/(display)/display/_render/landoltFill";

/**
 * What the canvas drew, read back after drawing. The trial index, direction
 * and step are the props the C was drawn from, so the controller can check
 * they are the values it is about to save.
 */
export type LandoltMeasurement = {
  drawnTrialIndex: number;
  drawnDirection: LandoltDirection;
  drawnStepIndex: number;
  inkBounds: InkBounds | null;
  canvasWidthDevicePx: number;
  canvasHeightDevicePx: number;
};

type LandoltCanvasProps = {
  trialIndex: number;
  direction: LandoltDirection;
  stepIndex: number;
  distanceMm: number;
  cssPxPerMm: number;
  devicePixelRatio: number;
  onMeasured?: ((measurement: LandoltMeasurement) => void) | undefined;
};

/**
 * One Landolt C, alone, on white. Box height = letterHeightMmForLogMar at the
 * step and distance, then mm to CSS px from the calibration, then CSS px to
 * device px by the pixel ratio, exactly as the letters.
 */
export function LandoltCanvas({
  trialIndex,
  direction,
  stepIndex,
  distanceMm,
  cssPxPerMm,
  devicePixelRatio,
  onMeasured,
}: LandoltCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const letterHeightMm = letterHeightMmForLogMar(stepIndex / 10, distanceMm);
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
    fillLandoltAt(ctx, direction, dpr, sizeCssPx, 0, 0);

    const image = ctx.getImageData(0, 0, widthDevicePx, heightDevicePx);
    const inkBounds = measureInkBounds(image.data, widthDevicePx, heightDevicePx);

    onMeasured?.({
      drawnTrialIndex: trialIndex,
      drawnDirection: direction,
      drawnStepIndex: stepIndex,
      inkBounds,
      canvasWidthDevicePx: widthDevicePx,
      canvasHeightDevicePx: heightDevicePx,
    });

    // White chart background behind the ink (destination-over).
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, widthDevicePx, heightDevicePx);
    ctx.globalCompositeOperation = "source-over";
  }, [trialIndex, direction, stepIndex, letterHeightCssPx, devicePixelRatio, onMeasured]);

  return (
    <canvas
      ref={canvasRef}
      aria-label="Landolt C"
      style={{
        display: "block",
        backgroundColor: "#ffffff",
        width: `${letterHeightCssPx}px`,
        height: `${letterHeightCssPx}px`,
      }}
    />
  );
}

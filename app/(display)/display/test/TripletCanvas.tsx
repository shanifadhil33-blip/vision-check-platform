"use client";

import { useEffect, useRef } from "react";
import { mmToCssPx } from "@/lib/calibration";
import { letterHeightMmForLogMar } from "@/lib/acuity/logmar";
import { measureInkBounds } from "@/lib/acuity/measure";
import type { SloanLetter } from "@/lib/acuity/sloan";
import {
  measureHStrokeScan,
  strokeLetterAt,
} from "@/app/(display)/display/_render/sloanStroke";
import type { OptotypeMeasurement } from "@/app/(display)/display/optotype/OptotypeCanvas";

type TripletCanvasProps = {
  left: SloanLetter;
  target: SloanLetter;
  right: SloanLetter;
  logMar: number;
  distanceMm: number;
  cssPxPerMm: number;
  devicePixelRatio: number;
  onMeasured?: ((measurement: OptotypeMeasurement) => void) | undefined;
};

function clampArrowCssPx(letterHeightCssPx: number): number {
  return Math.min(40, Math.max(12, letterHeightCssPx));
}

export function TripletCanvas({
  left,
  target,
  right,
  logMar,
  distanceMm,
  cssPxPerMm,
  devicePixelRatio,
  onMeasured,
}: TripletCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const letterHeightMm = letterHeightMmForLogMar(logMar, distanceMm);
  const letterHeightCssPx = mmToCssPx(letterHeightMm, cssPxPerMm);
  const canvasWidthCssPx = 5 * letterHeightCssPx;
  const canvasHeightCssPx = letterHeightCssPx;
  const arrowHeightCssPx = clampArrowCssPx(letterHeightCssPx);
  const arrowGapCssPx = clampArrowCssPx(letterHeightCssPx);
  const arrowWidthCssPx = arrowHeightCssPx / 2;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }

    const dpr = devicePixelRatio;
    const sizeCssPx = letterHeightCssPx;
    const widthDevicePx = Math.max(1, Math.round(canvasWidthCssPx * dpr));
    const heightDevicePx = Math.max(1, Math.round(canvasHeightCssPx * dpr));
    canvas.width = widthDevicePx;
    canvas.height = heightDevicePx;
    canvas.style.width = `${canvasWidthCssPx}px`;
    canvas.style.height = `${canvasHeightCssPx}px`;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx === null) {
      return;
    }

    // Transparent clear so alpha marks ink only for measurement.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, widthDevicePx, heightDevicePx);

    // Boxes: 0..L, 2L..3L, 4L..5L (DECIDED 5). Each letter clipped in strokeLetterAt.
    strokeLetterAt(ctx, left, dpr, sizeCssPx, 0, 0);
    strokeLetterAt(ctx, target, dpr, sizeCssPx, 2 * sizeCssPx, 0);
    strokeLetterAt(ctx, right, dpr, sizeCssPx, 4 * sizeCssPx, 0);

    const regionLeftDevicePx = Math.max(0, Math.floor(2 * sizeCssPx * dpr) - 1);
    const regionRightDevicePx = Math.min(
      widthDevicePx,
      Math.ceil(3 * sizeCssPx * dpr) + 1,
    );
    const regionWidthDevicePx = Math.max(1, regionRightDevicePx - regionLeftDevicePx);
    const regionImage = ctx.getImageData(
      regionLeftDevicePx,
      0,
      regionWidthDevicePx,
      heightDevicePx,
    );
    const inkBounds = measureInkBounds(
      regionImage.data,
      regionWidthDevicePx,
      heightDevicePx,
    );

    const letterWidthDevicePx = Math.max(1, Math.round(sizeCssPx * dpr));
    const letterHeightDevicePx = Math.max(1, Math.round(sizeCssPx * dpr));
    const strokeScan =
      target === "H"
        ? measureHStrokeScan(letterWidthDevicePx, letterHeightDevicePx, dpr, sizeCssPx)
        : {
            strokeScanRowDevicePx: null,
            strokeScanPercentOfInkHeight: null,
            strokeRuns: [],
            strokeWidthDevicePx: null,
          };

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
  }, [
    left,
    target,
    right,
    letterHeightCssPx,
    canvasWidthCssPx,
    canvasHeightCssPx,
    devicePixelRatio,
    onMeasured,
  ]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: `${arrowGapCssPx}px`,
      }}
    >
      {/* Arrow above canvas, centred on target (canvas centre = 2.5L). Not drawn on canvas. */}
      <div
        style={{
          width: `${canvasWidthCssPx}px`,
          display: "flex",
          justifyContent: "center",
        }}
        aria-hidden
      >
        <svg
          width={arrowWidthCssPx}
          height={arrowHeightCssPx}
          viewBox={`0 0 ${arrowWidthCssPx} ${arrowHeightCssPx}`}
          style={{ display: "block" }}
        >
          <path
            d={`M${arrowWidthCssPx / 2} ${arrowHeightCssPx} L0 0 L${arrowWidthCssPx} 0 Z`}
            fill="#000000"
          />
        </svg>
      </div>
      <canvas
        ref={canvasRef}
        aria-label={`Sloan letters ${left} ${target} ${right}`}
        style={{
          display: "block",
          backgroundColor: "#ffffff",
          width: `${canvasWidthCssPx}px`,
          height: `${canvasHeightCssPx}px`,
        }}
      />
    </div>
  );
}

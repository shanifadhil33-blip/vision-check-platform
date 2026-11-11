"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useCalibration } from "@/app/(display)/display/calibrate/useCalibration";
import {
  CENTRE_MARKER_SIZES_MM,
  computeMarkerLayout,
  CORNER_INSET_MM,
  CORNER_MARKER_SIZES_MM,
  type MarkerLayout,
  type MarkerMode,
} from "@/lib/spike/markerLayout";
import { MARKER_CELLS_ACROSS, markerDataBits, SPIKE_DICTIONARY_NAME } from "@/lib/spike/markers";

function subscribeViewport(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

function viewportSnapshot(): string {
  return `${window.innerWidth}x${window.innerHeight}`;
}

function serverViewportSnapshot(): string {
  return "";
}

/** Draw in device pixels. Every rect starts and ends on a whole device pixel. */
function drawMarkers(canvas: HTMLCanvasElement, layout: MarkerLayout): void {
  canvas.width = layout.canvasWidthDevicePx;
  canvas.height = layout.canvasHeightDevicePx;
  canvas.style.width = `${layout.canvasWidthCssPx}px`;
  canvas.style.height = `${layout.canvasHeightCssPx}px`;
  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    return;
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, layout.canvasWidthDevicePx, layout.canvasHeightDevicePx);
  const dataCells = MARKER_CELLS_ACROSS - 2;
  for (const marker of layout.markers) {
    ctx.fillStyle = "#000000";
    ctx.fillRect(marker.leftDevicePx, marker.topDevicePx, marker.sideDevicePx, marker.sideDevicePx);
    const bits = markerDataBits(marker.markerId);
    ctx.fillStyle = "#ffffff";
    for (let row = 0; row < dataCells; row += 1) {
      for (let col = 0; col < dataCells; col += 1) {
        if (bits[row * dataCells + col] === "1") {
          ctx.fillRect(
            marker.leftDevicePx + (col + 1) * marker.cellDevicePx,
            marker.topDevicePx + (row + 1) * marker.cellDevicePx,
            marker.cellDevicePx,
            marker.cellDevicePx,
          );
        }
      }
    }
  }
}

const MODE_LABELS: Record<MarkerMode, string> = {
  centre: "Centre marker",
  corners: "Corner markers",
  both: "Both",
};

const ROLE_LABELS: Record<string, string> = {
  centre: "Centre",
  topLeft: "Top left",
  topRight: "Top right",
  bottomRight: "Bottom right",
  bottomLeft: "Bottom left",
};

function choiceClass(selected: boolean): string {
  return selected
    ? "rounded border border-sky-400 bg-sky-600 px-3 py-2 text-white"
    : "rounded border border-neutral-500 px-3 py-2 text-neutral-900 hover:border-neutral-800";
}

export default function MarkerSpike() {
  const { ready, calibration, validity } = useCalibration();
  const viewport = useSyncExternalStore(subscribeViewport, viewportSnapshot, serverViewportSnapshot);
  const [mode, setMode] = useState<MarkerMode>("centre");
  const [centreSideMm, setCentreSideMm] = useState<number>(100);
  const [cornerSideMm, setCornerSideMm] = useState<number>(40);
  const [panelVisible, setPanelVisible] = useState(true);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [cameraUrl, setCameraUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const valid = calibration !== null && validity !== null && validity.ok;

  const layout = useMemo(() => {
    if (!valid || calibration === null || viewport === "") {
      return null;
    }
    const [widthText, heightText] = viewport.split("x");
    return computeMarkerLayout({
      viewportWidthCssPx: Number(widthText),
      viewportHeightCssPx: Number(heightText),
      cssPxPerMm: calibration.cssPxPerMm,
      devicePixelRatio: calibration.devicePixelRatio,
      mode,
      centreSideMm,
      cornerSideMm,
    });
  }, [valid, calibration, viewport, mode, centreSideMm, cornerSideMm]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas !== null && layout !== null) {
      drawMarkers(canvas, layout);
    }
  }, [layout]);

  useEffect(() => {
    let cancelled = false;
    const url = `${window.location.origin}/spike/camera`;
    void import("qrcode")
      .then((qrcode) => qrcode.toDataURL(url, { margin: 1, width: 240 }))
      .then((dataUrl) => {
        if (!cancelled) {
          setCameraUrl(url);
          setQrDataUrl(dataUrl);
        }
      })
      .catch((error: unknown) => console.error(error));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return <main className="flex flex-1 items-center justify-center text-neutral-400">Loading…</main>;
  }

  if (!valid) {
    return (
      <main className="mx-auto flex max-w-xl flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-2xl font-semibold text-neutral-100">Set up this screen first</p>
        {validity !== null && !validity.ok && (
          <p className="text-base text-neutral-300">{validity.reason}</p>
        )}
        <Link href="/display/calibrate" className="text-lg text-sky-400 underline underline-offset-4">
          Go to screen setup
        </Link>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 overflow-hidden bg-white">
      <canvas
        ref={canvasRef}
        className="absolute top-0 left-0 block"
        onClick={() => setPanelVisible((visible) => !visible)}
        aria-label="Distance markers"
      />
      {panelVisible && layout !== null && (
        <section className="absolute top-1/2 left-1/2 max-h-full w-[min(44rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded border border-neutral-300 bg-white/95 p-4 text-sm text-neutral-900 shadow-lg">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-lg font-semibold">Camera spike: markers (staff only)</h1>
            <button type="button" className={choiceClass(false)} onClick={() => setPanelVisible(false)}>
              Hide panel
            </button>
          </div>
          <p className="mt-1 text-neutral-600">
            Tap the white area to hide or show this panel. Dictionary {SPIKE_DICTIONARY_NAME}, {MARKER_CELLS_ACROSS} cells
            across, one white cell of quiet zone. Corner markers sit {CORNER_INSET_MM} mm in from the window corners.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {(Object.keys(MODE_LABELS) as MarkerMode[]).map((option) => (
              <button key={option} type="button" className={choiceClass(mode === option)} onClick={() => setMode(option)}>
                {MODE_LABELS[option]}
              </button>
            ))}
            <button
              type="button"
              className={choiceClass(false)}
              onClick={() => {
                void document.documentElement.requestFullscreen?.().catch(() => undefined);
              }}
            >
              Full screen
            </button>
          </div>

          {(mode === "centre" || mode === "both") && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span>Centre marker:</span>
              {CENTRE_MARKER_SIZES_MM.map((sizeMm) => (
                <button key={sizeMm} type="button" className={choiceClass(centreSideMm === sizeMm)} onClick={() => setCentreSideMm(sizeMm)}>
                  {sizeMm} mm
                </button>
              ))}
            </div>
          )}
          {(mode === "corners" || mode === "both") && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span>Corner markers:</span>
              {CORNER_MARKER_SIZES_MM.map((sizeMm) => (
                <button key={sizeMm} type="button" className={choiceClass(cornerSideMm === sizeMm)} onClick={() => setCornerSideMm(sizeMm)}>
                  {sizeMm} mm
                </button>
              ))}
            </div>
          )}

          <table className="mt-3 w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-neutral-300">
                <th className="py-1 pr-2">Marker</th>
                <th className="py-1 pr-2">Id</th>
                <th className="py-1 pr-2">Asked</th>
                <th className="py-1 pr-2">Drawn</th>
                <th className="py-1 pr-2">Side</th>
                <th className="py-1">Cell</th>
              </tr>
            </thead>
            <tbody>
              {layout.markers.map((marker) => (
                <tr key={marker.role} className="border-b border-neutral-200">
                  <td className="py-1 pr-2">{ROLE_LABELS[marker.role]}</td>
                  <td className="py-1 pr-2">{marker.markerId}</td>
                  <td className="py-1 pr-2">{marker.requestedSideMm} mm</td>
                  <td className="py-1 pr-2">{marker.drawnSideMm.toFixed(3)} mm</td>
                  <td className="py-1 pr-2">{marker.sideDevicePx} device px</td>
                  <td className="py-1">{marker.cellDevicePx} device px</td>
                </tr>
              ))}
            </tbody>
          </table>
          {layout.cornerSpanMm !== null && (
            <p className="mt-2">
              Corner span (horizontal, centre to centre): <strong>{layout.cornerSpanMm.toFixed(2)} mm</strong>
            </p>
          )}
          <p className="mt-1 text-neutral-600">
            Calibration {calibration.cssPxPerMm.toFixed(4)} CSS px per mm, pixel ratio {calibration.devicePixelRatio},{" "}
            {layout.devicePxPerMm.toFixed(4)} device px per mm. Canvas {layout.canvasWidthDevicePx} ×{" "}
            {layout.canvasHeightDevicePx} device px.
          </p>
          {layout.warnings.map((warning) => (
            <p key={warning} className="mt-1 font-medium text-amber-700">
              {warning}
            </p>
          ))}

          <div className="mt-3 flex flex-wrap items-center gap-4">
            {qrDataUrl !== null && (
              <Image src={qrDataUrl} alt="QR code for the camera page" width={160} height={160} unoptimized />
            )}
            <div>
              <p>Scan with the phone to open the camera page.</p>
              {cameraUrl !== null && <p className="break-all text-sky-700">{cameraUrl}</p>}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

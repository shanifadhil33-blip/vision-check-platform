"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { baselineRatio, estimatedDistanceMm } from "@/lib/spike/distance";
import { readingsText, type SpikeMetric } from "@/lib/spike/readings";
import {
  BASELINE_FRAMES,
  CameraEngine,
  type EngineSnapshot,
  initialEngineSnapshot,
  READING_FRAMES,
  SPIKE_METRICS,
} from "./cameraEngine";
import {
  addReadings,
  clearReadings,
  getReadings,
  getServerReadings,
  subscribeReadings,
} from "./readingsStore";

const METRIC_LABELS: Record<SpikeMetric, string> = {
  "single-raw": "Centre marker, raw",
  "single-refined": "Centre marker, refined",
  "corner-raw": "Corner span, raw",
  "corner-refined": "Corner span, refined",
};

const BASELINE_DISTANCES_MM = [2000, 3000] as const;
const DETECTION_SCALES = [1, 0.5, 0.25] as const;

const BUTTON_CLASS =
  "min-h-12 rounded bg-sky-600 px-4 py-2 text-lg font-medium text-white hover:bg-sky-500 disabled:opacity-40";
const SECONDARY_CLASS =
  "min-h-12 rounded border border-neutral-500 px-4 py-2 text-lg text-neutral-100 hover:border-neutral-300 disabled:opacity-40";

function choiceClass(selected: boolean): string {
  return selected
    ? "min-h-12 rounded border border-sky-400 bg-sky-700 px-4 py-2 text-lg text-white"
    : "min-h-12 rounded border border-neutral-600 px-4 py-2 text-lg text-neutral-200";
}

function show(value: number | undefined | null, digits: number): string {
  return value === undefined || value === null || !Number.isFinite(value) ? "—" : value.toFixed(digits);
}

export default function CameraSpike() {
  const [snap, setSnap] = useState<EngineSnapshot>(initialEngineSnapshot);
  const readings = useSyncExternalStore(subscribeReadings, getReadings, getServerReadings);
  const [baselineDistanceMm, setBaselineDistanceMm] = useState<number>(3000);
  const [trueDistanceText, setTrueDistanceText] = useState("");
  const [note, setNote] = useState("");
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const [copyFallback, setCopyFallback] = useState<string | null>(null);
  const engineRef = useRef<CameraEngine | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const engine = new CameraEngine(setSnap, addReadings);
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  function startCamera(deviceId: string | null): void {
    const engine = engineRef.current;
    const video = videoRef.current;
    const overlay = overlayRef.current;
    if (engine === null || video === null || overlay === null) {
      return;
    }
    void engine.start(video, overlay, deviceId);
  }

  function saveReading(): void {
    const trueDistanceMm = Number(trueDistanceText);
    if (!Number.isFinite(trueDistanceMm) || trueDistanceMm <= 0) {
      setFormMessage("Type the true distance in millimetres first.");
      return;
    }
    setFormMessage(null);
    engineRef.current?.saveReading(trueDistanceMm, note);
  }

  async function copyAll(): Promise<void> {
    const text = readingsText(readings);
    try {
      await navigator.clipboard.writeText(text);
      setCopyFallback(null);
      setFormMessage(`Copied ${readings.length} reading(s).`);
    } catch {
      setCopyFallback(text);
      setFormMessage("Copy was blocked. Select the text below and copy it.");
    }
  }

  function clearAll(): void {
    if (window.confirm(`Clear all ${readings.length} saved reading(s)? This cannot be undone.`)) {
      clearReadings();
      setCopyFallback(null);
      setFormMessage("Readings cleared.");
    }
  }

  const running = snap.phase === "running";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 px-4 py-5 text-neutral-100">
      <h1 className="text-xl font-semibold">Camera spike (staff only)</h1>

      {(snap.phase === "idle" || snap.phase === "starting") && (
        <button type="button" className={BUTTON_CLASS} disabled={snap.phase === "starting"} onClick={() => startCamera(null)}>
          {snap.phase === "starting" ? "Starting…" : "Start camera"}
        </button>
      )}
      {snap.phase === "error" && (
        <section role="alert" className="flex flex-col gap-3 rounded border border-amber-300/60 bg-amber-300/10 p-4">
          <p className="text-lg">{snap.errorMessage}</p>
          <button type="button" className={BUTTON_CLASS} onClick={() => startCamera(null)}>
            Try again
          </button>
        </section>
      )}

      {/* Visible from "starting" so the video is in the page before play() (iOS). */}
      <div className={`relative w-full ${snap.phase === "idle" || snap.phase === "error" ? "hidden" : ""}`}>
        <video ref={videoRef} className="block w-full bg-black" playsInline muted />
        <canvas ref={overlayRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      </div>

      {running && (
        <>
          <section className="grid grid-cols-2 gap-3 text-center">
            <div className="rounded bg-neutral-900 p-3">
              <p className="text-sm text-neutral-400">Markers found</p>
              <p className="text-3xl font-semibold">
                {snap.markerIds.length}
                <span className="ml-2 text-base text-neutral-400">{snap.markerIds.length > 0 ? `ids ${snap.markerIds.join(", ")}` : ""}</span>
              </p>
            </div>
            <div className="rounded bg-neutral-900 p-3">
              <p className="text-sm text-neutral-400">Frames per second</p>
              <p className="text-3xl font-semibold">{show(snap.framesPerSecond, 1)}</p>
            </div>
          </section>

          <section className="flex flex-col gap-2">
            {SPIKE_METRICS.map((metric) => {
              const currentPx = snap.current[metric];
              const baseline = snap.baselines[metric];
              const canCompare = baseline !== undefined && currentPx !== undefined && currentPx > 0;
              const ratio = canCompare ? baselineRatio(baseline.sizeCameraPx, currentPx) : null;
              const estimateMm = canCompare
                ? estimatedDistanceMm(baseline.distanceMm, baseline.sizeCameraPx, currentPx)
                : null;
              return (
                <div key={metric} className="rounded bg-neutral-900 p-3">
                  <p className="text-sm text-neutral-400">{METRIC_LABELS[metric]}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                    <p>
                      <span className="block text-xs text-neutral-500">Current px</span>
                      <span className="text-2xl font-semibold">{show(currentPx, 2)}</span>
                    </p>
                    <p>
                      <span className="block text-xs text-neutral-500">SD, last 30</span>
                      <span className="text-2xl font-semibold">{show(snap.sdPercent[metric], 3)}%</span>
                    </p>
                    <p>
                      <span className="block text-xs text-neutral-500">Ratio</span>
                      <span className="text-2xl font-semibold">{show(ratio, 4)}</span>
                    </p>
                    <p>
                      <span className="block text-xs text-neutral-500">Estimated</span>
                      <span className="text-2xl font-semibold">{show(estimateMm, 0)} mm</span>
                    </p>
                  </div>
                  {baseline !== undefined && (
                    <p className="mt-1 text-xs text-neutral-500">
                      Baseline {baseline.distanceMm} mm at {baseline.sizeCameraPx.toFixed(3)} px ({baseline.frames} frames)
                    </p>
                  )}
                </div>
              );
            })}
            <p className="text-xs text-neutral-500">
              Red outline: js-aruco2 corners. Green: refined corners. Refinement failures so far: {snap.refineFailures}.
            </p>
          </section>

          {snap.collecting !== null && (
            <section className="flex items-center justify-between gap-3 rounded border border-sky-500 p-3" aria-live="polite">
              <p className="text-lg">{snap.collecting}</p>
              <button type="button" className={SECONDARY_CLASS} onClick={() => engineRef.current?.cancelCollection()}>
                Cancel
              </button>
            </section>
          )}
          {snap.message !== null && <p className="text-base text-neutral-200" aria-live="polite">{snap.message}</p>}

          <section className="flex flex-col gap-3 rounded border border-neutral-700 p-3">
            <h2 className="text-lg font-semibold">Baseline ({BASELINE_FRAMES} frames)</h2>
            <div className="flex flex-wrap gap-2">
              {BASELINE_DISTANCES_MM.map((distanceMm) => (
                <button key={distanceMm} type="button" className={choiceClass(baselineDistanceMm === distanceMm)} onClick={() => setBaselineDistanceMm(distanceMm)}>
                  {distanceMm} mm
                </button>
              ))}
              <button type="button" className={BUTTON_CLASS} disabled={snap.collecting !== null} onClick={() => engineRef.current?.setBaseline(baselineDistanceMm)}>
                Set baseline
              </button>
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded border border-neutral-700 p-3">
            <h2 className="text-lg font-semibold">Save reading ({READING_FRAMES} frames)</h2>
            <label className="flex flex-col gap-1">
              <span>True distance, mm (tape measure)</span>
              <input
                type="text"
                inputMode="numeric"
                value={trueDistanceText}
                onChange={(event) => setTrueDistanceText(event.target.value.trim())}
                className="rounded border border-neutral-600 bg-neutral-950 px-3 py-2 text-2xl"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span>Note (optional, e.g. laptop marker size)</span>
              <input
                type="text"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="rounded border border-neutral-600 bg-neutral-950 px-3 py-2 text-base"
              />
            </label>
            <button type="button" className={BUTTON_CLASS} disabled={snap.collecting !== null} onClick={saveReading}>
              Save reading
            </button>
          </section>
        </>
      )}

      <section className="flex flex-col gap-3 rounded border border-neutral-700 p-3">
        <h2 className="text-lg font-semibold">Readings saved on this phone: {readings.length}</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={BUTTON_CLASS} disabled={readings.length === 0} onClick={() => void copyAll()}>
            Copy all readings
          </button>
          <button type="button" className={SECONDARY_CLASS} disabled={readings.length === 0} onClick={clearAll}>
            Clear readings
          </button>
        </div>
        {formMessage !== null && <p className="text-base" aria-live="polite">{formMessage}</p>}
        {copyFallback !== null && (
          <textarea
            readOnly
            value={copyFallback}
            rows={6}
            className="w-full rounded border border-neutral-600 bg-neutral-950 p-2 font-mono text-xs"
            onFocus={(event) => event.currentTarget.select()}
          />
        )}
      </section>

      {running && (
        <section className="flex flex-col gap-3 rounded border border-neutral-700 p-3 text-sm">
          <h2 className="text-lg font-semibold">Camera</h2>
          <label className="flex flex-col gap-1">
            <span>Camera (choose the main lens)</span>
            <select
              value={snap.currentDeviceId ?? ""}
              onChange={(event) => startCamera(event.target.value === "" ? null : event.target.value)}
              className="rounded border border-neutral-600 bg-neutral-950 px-3 py-2 text-base"
            >
              {snap.currentDeviceId === null && <option value="">Rear camera (default)</option>}
              {snap.devices.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span>Detection scale (refinement always uses the full frame)</span>
            <select
              value={snap.detectionScale}
              onChange={(event) => engineRef.current?.setDetectionScale(Number(event.target.value))}
              className="rounded border border-neutral-600 bg-neutral-950 px-3 py-2 text-base"
            >
              {DETECTION_SCALES.map((scale) => (
                <option key={scale} value={scale}>
                  {scale === 1 ? "Full" : `1/${1 / scale}`}
                </option>
              ))}
            </select>
          </label>
          <p>Zoom: {snap.zoomText}</p>
          <p>Wake lock: {snap.wakeLockText || "requesting"}</p>
          <p className="text-neutral-400">Track settings</p>
          <pre className="overflow-x-auto rounded bg-neutral-900 p-2 text-xs">{snap.settingsText}</pre>
          <p className="text-neutral-400">Capabilities</p>
          <pre className="overflow-x-auto rounded bg-neutral-900 p-2 text-xs">{snap.capabilitiesText}</pre>
        </section>
      )}
    </main>
  );
}

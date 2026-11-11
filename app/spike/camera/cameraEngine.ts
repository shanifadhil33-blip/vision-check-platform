/**
 * Browser side of the camera spike: camera, wake lock, frame loop. All the
 * maths lives in lib/spike. Nothing here is saved anywhere but this phone.
 */

import type { CameraPoint } from "@/lib/spike/geometry";
import {
  CENTRE_MARKER_ID,
  CORNER_MARKER_IDS,
  createMarkerDetector,
  MARKER_CELLS_ACROSS,
  type MarkerDetector,
} from "@/lib/spike/markers";
import type { SpikeMetric, SpikeReading } from "@/lib/spike/readings";
import { type GreyImage, refineQuad } from "@/lib/spike/refine";
import { baselineRatio, estimatedDistanceMm } from "@/lib/spike/distance";
import { cornerSpanFromCornersCameraPx, singleMarkerSizeCameraPx } from "@/lib/spike/sizeMetrics";
import { mean, RollingWindow, standardDeviationPercent } from "@/lib/spike/stats";

export const SPIKE_METRICS: readonly SpikeMetric[] = [
  "single-raw",
  "single-refined",
  "corner-raw",
  "corner-refined",
];

export const BASELINE_FRAMES = 30;
export const READING_FRAMES = 60;
const ROLLING_FRAMES = 30;
const MAX_COLLECTION_FRAMES_FACTOR = 5;
const MIN_READING_FRAMES = 10;
const OVERLAY_MAX_WIDTH_PX = 960;

export type Baseline = { distanceMm: number; sizeCameraPx: number; frames: number };

export type EngineSnapshot = {
  phase: "idle" | "starting" | "running" | "error";
  errorMessage: string | null;
  message: string | null;
  devices: { deviceId: string; label: string }[];
  currentDeviceId: string | null;
  settingsText: string;
  capabilitiesText: string;
  zoomText: string;
  wakeLockText: string;
  resolution: string;
  framesPerSecond: number;
  markerIds: number[];
  current: Partial<Record<SpikeMetric, number>>;
  sdPercent: Partial<Record<SpikeMetric, number>>;
  baselines: Partial<Record<SpikeMetric, Baseline>>;
  collecting: string | null;
  refineFailures: number;
  detectionScale: number;
};

type Collector = {
  kind: "baseline" | "reading";
  target: number;
  framesSeen: number;
  startedAtMs: number;
  values: Record<SpikeMetric, number[]>;
  idsSeen: Set<number>;
  baselineDistanceMm: number;
  trueDistanceMm: number;
  note: string;
};

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

const INITIAL_SNAPSHOT: EngineSnapshot = {
  phase: "idle",
  errorMessage: null,
  message: null,
  devices: [],
  currentDeviceId: null,
  settingsText: "",
  capabilitiesText: "",
  zoomText: "",
  wakeLockText: "",
  resolution: "",
  framesPerSecond: 0,
  markerIds: [],
  current: {},
  sdPercent: {},
  baselines: {},
  collecting: null,
  refineFailures: 0,
  detectionScale: 0.5,
};

export function initialEngineSnapshot(): EngineSnapshot {
  return INITIAL_SNAPSHOT;
}

function emptyValues(): Record<SpikeMetric, number[]> {
  return { "single-raw": [], "single-refined": [], "corner-raw": [], "corner-refined": [] };
}

function cameraErrorMessage(error: unknown): string {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera permission was refused. Allow the camera for this site, then try again.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") {
    return "No camera matching the request was found on this phone.";
  }
  if (name === "NotReadableError") {
    return "The camera is in use by another app or could not be started.";
  }
  return `The camera could not be started${name === "" ? "" : ` (${name})`}.`;
}

export class CameraEngine {
  private snapshot: EngineSnapshot = INITIAL_SNAPSHOT;
  private video: VideoWithFrameCallback | null = null;
  private overlay: HTMLCanvasElement | null = null;
  private stream: MediaStream | null = null;
  private detector: MarkerDetector | null = null;
  private fullCanvas: HTMLCanvasElement | null = null;
  private detectionCanvas: HTMLCanvasElement | null = null;
  private running = false;
  private frameHandle: number | null = null;
  private animationHandle: number | null = null;
  private lastVideoTime = -1;
  private frameTimesMs: number[] = [];
  private readonly windows: Record<SpikeMetric, RollingWindow> = {
    "single-raw": new RollingWindow(ROLLING_FRAMES),
    "single-refined": new RollingWindow(ROLLING_FRAMES),
    "corner-raw": new RollingWindow(ROLLING_FRAMES),
    "corner-refined": new RollingWindow(ROLLING_FRAMES),
  };
  private collector: Collector | null = null;
  private wakeLock: WakeLockSentinel | null = null;
  private disposed = false;

  constructor(
    private readonly onChange: (snapshot: EngineSnapshot) => void,
    private readonly onReadings: (readings: SpikeReading[]) => void,
  ) {
    document.addEventListener("visibilitychange", this.onVisibilityChange);
  }

  private patch(partial: Partial<EngineSnapshot>): void {
    if (this.disposed) {
      return;
    }
    this.snapshot = { ...this.snapshot, ...partial };
    this.onChange(this.snapshot);
  }

  async start(video: HTMLVideoElement, overlay: HTMLCanvasElement, deviceId: string | null): Promise<void> {
    this.video = video;
    this.overlay = overlay;
    this.stopStream();
    if (!window.isSecureContext || navigator.mediaDevices?.getUserMedia === undefined) {
      this.patch({
        phase: "error",
        errorMessage: "The camera needs a secure (https) page and a browser with camera support.",
      });
      return;
    }
    this.patch({ phase: "starting", errorMessage: null, message: null });
    try {
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 3840 },
        height: { ideal: 2160 },
      };
      if (deviceId !== null) {
        videoConstraints.deviceId = { exact: deviceId };
      } else {
        videoConstraints.facingMode = { ideal: "environment" };
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: videoConstraints });
      if (this.disposed) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      const track = stream.getVideoTracks()[0];
      if (track === undefined) {
        throw new DOMException("No video track", "NotFoundError");
      }
      const zoomText = await this.applyFixedZoom(track);
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      this.detector ??= createMarkerDetector();

      const devices = (await navigator.mediaDevices.enumerateDevices())
        .filter((device) => device.kind === "videoinput")
        .map((device, index) => ({ deviceId: device.deviceId, label: device.label || `Camera ${index + 1}` }));
      const settings = track.getSettings() as Record<string, unknown>;
      this.running = true;
      this.patch({
        phase: "running",
        devices,
        currentDeviceId: typeof settings.deviceId === "string" ? settings.deviceId : null,
        zoomText,
        ...this.describeTrack(track),
      });
      void this.acquireWakeLock();
      this.schedule();
    } catch (error) {
      console.error(error);
      this.stopStream();
      this.patch({ phase: "error", errorMessage: cameraErrorMessage(error) });
    }
  }

  private async applyFixedZoom(track: MediaStreamTrack): Promise<string> {
    const capabilities =
      typeof track.getCapabilities === "function"
        ? (track.getCapabilities() as Record<string, unknown>)
        : {};
    const zoom = capabilities.zoom as { min?: unknown; max?: unknown } | undefined;
    if (zoom === undefined || typeof zoom.min !== "number" || typeof zoom.max !== "number") {
      return "zoom not supported by this camera or browser";
    }
    const targetZoom = Math.min(zoom.max, Math.max(zoom.min, 1));
    try {
      await track.applyConstraints({ advanced: [{ zoom: targetZoom } as unknown as MediaTrackConstraintSet] });
      return `zoom fixed at ${targetZoom} (range ${zoom.min} to ${zoom.max})`;
    } catch (error) {
      return `zoom ${targetZoom} could not be applied (${error instanceof Error ? error.name : "error"})`;
    }
  }

  private describeTrack(track: MediaStreamTrack): Pick<EngineSnapshot, "settingsText" | "capabilitiesText" | "resolution"> {
    const settings = track.getSettings() as Record<string, unknown>;
    const capabilities =
      typeof track.getCapabilities === "function"
        ? (track.getCapabilities() as Record<string, unknown>)
        : {};
    const shown = {
      width: settings.width,
      height: settings.height,
      frameRate: settings.frameRate,
      zoom: settings.zoom ?? "not reported",
      deviceId: settings.deviceId,
      facingMode: settings.facingMode ?? "not reported",
    };
    const capabilityView = {
      zoom: capabilities.zoom ?? "not reported",
      focusMode: capabilities.focusMode ?? "not reported",
      focusDistance: capabilities.focusDistance ?? "not reported",
    };
    return {
      settingsText: JSON.stringify(shown, null, 1),
      capabilitiesText: JSON.stringify(capabilityView, null, 1),
      resolution: `${String(settings.width)}x${String(settings.height)}`,
    };
  }

  private currentZoomText(): string {
    const track = this.stream?.getVideoTracks()[0];
    const zoom = track === undefined ? undefined : (track.getSettings() as Record<string, unknown>).zoom;
    return typeof zoom === "number" ? String(zoom) : "n/a";
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === "visible" && this.running && (this.wakeLock === null || this.wakeLock.released)) {
      void this.acquireWakeLock();
    }
  };

  private async acquireWakeLock(): Promise<void> {
    try {
      if (!("wakeLock" in navigator)) {
        this.patch({ wakeLockText: "not supported" });
        return;
      }
      const sentinel = await navigator.wakeLock.request("screen");
      this.wakeLock = sentinel;
      this.patch({ wakeLockText: "on" });
      sentinel.addEventListener("release", () => this.patch({ wakeLockText: "released" }));
    } catch {
      this.patch({ wakeLockText: "not granted" });
    }
  }

  setDetectionScale(scale: number): void {
    this.patch({ detectionScale: scale });
  }

  setBaseline(baselineDistanceMm: number): void {
    this.startCollector("baseline", BASELINE_FRAMES, baselineDistanceMm, 0, "");
  }

  saveReading(trueDistanceMm: number, note: string): void {
    this.startCollector("reading", READING_FRAMES, 0, trueDistanceMm, note);
  }

  cancelCollection(): void {
    this.collector = null;
    this.patch({ collecting: null, message: "Cancelled." });
  }

  private startCollector(
    kind: Collector["kind"],
    target: number,
    baselineDistanceMm: number,
    trueDistanceMm: number,
    note: string,
  ): void {
    if (!this.running) {
      this.patch({ message: "Start the camera first." });
      return;
    }
    this.collector = {
      kind,
      target,
      framesSeen: 0,
      startedAtMs: performance.now(),
      values: emptyValues(),
      idsSeen: new Set(),
      baselineDistanceMm,
      trueDistanceMm,
      note,
    };
    this.patch({ collecting: `${kind === "baseline" ? "Baseline" : "Reading"}: 0 of ${target} frames`, message: null });
  }

  private schedule(): void {
    const video = this.video;
    if (video === null || !this.running) {
      return;
    }
    if (typeof video.requestVideoFrameCallback === "function") {
      this.frameHandle = video.requestVideoFrameCallback(() => this.onFrame());
    } else {
      this.animationHandle = requestAnimationFrame(() => this.onFrame());
    }
  }

  private onFrame(): void {
    if (!this.running) {
      return;
    }
    try {
      this.processFrame();
    } catch (error) {
      console.error(error);
      this.patch({ message: `Frame error: ${error instanceof Error ? error.message : String(error)}` });
    }
    this.schedule();
  }

  private processFrame(): void {
    const video = this.video;
    const detector = this.detector;
    if (video === null || detector === null || video.readyState < 2) {
      return;
    }
    if (video.currentTime === this.lastVideoTime) {
      return;
    }
    this.lastVideoTime = video.currentTime;
    const widthCameraPx = video.videoWidth;
    const heightCameraPx = video.videoHeight;
    if (widthCameraPx === 0 || heightCameraPx === 0) {
      return;
    }

    this.fullCanvas ??= document.createElement("canvas");
    this.detectionCanvas ??= document.createElement("canvas");
    const full = this.fullCanvas;
    if (full.width !== widthCameraPx || full.height !== heightCameraPx) {
      full.width = widthCameraPx;
      full.height = heightCameraPx;
    }
    const fullCtx = full.getContext("2d", { willReadFrequently: true });
    const scale = this.snapshot.detectionScale;
    const widthDetectionPx = Math.max(1, Math.round(widthCameraPx * scale));
    const heightDetectionPx = Math.max(1, Math.round(heightCameraPx * scale));
    const detection = this.detectionCanvas;
    if (detection.width !== widthDetectionPx || detection.height !== heightDetectionPx) {
      detection.width = widthDetectionPx;
      detection.height = heightDetectionPx;
    }
    const detectionCtx = detection.getContext("2d", { willReadFrequently: true });
    if (fullCtx === null || detectionCtx === null) {
      return;
    }
    fullCtx.drawImage(video, 0, 0, widthCameraPx, heightCameraPx);
    detectionCtx.drawImage(video, 0, 0, widthDetectionPx, heightDetectionPx);
    const detectionImage = detectionCtx.getImageData(0, 0, widthDetectionPx, heightDetectionPx);
    const found = detector.detect(
      detectionImage.data,
      widthDetectionPx,
      heightDetectionPx,
      widthDetectionPx / widthCameraPx,
      heightDetectionPx / heightCameraPx,
    );

    const rawById = new Map<number, CameraPoint[]>();
    const refinedById = new Map<number, CameraPoint[]>();
    let refineFailures = this.snapshot.refineFailures;
    for (const marker of found) {
      if (marker.markerId > 4 || rawById.has(marker.markerId)) {
        continue;
      }
      rawById.set(marker.markerId, marker.rawCorners);
      const crop = greyCrop(fullCtx, marker.rawCorners, widthCameraPx, heightCameraPx);
      const refined = crop === null ? null : refineQuad(crop, marker.rawCorners, { cellsAcross: MARKER_CELLS_ACROSS });
      if (refined === null) {
        refineFailures += 1;
      } else {
        refinedById.set(marker.markerId, refined.corners);
      }
    }

    const current: Partial<Record<SpikeMetric, number>> = {};
    const centreRaw = rawById.get(CENTRE_MARKER_ID);
    const centreRefined = refinedById.get(CENTRE_MARKER_ID);
    const singleRaw = centreRaw === undefined ? null : singleMarkerSizeCameraPx(centreRaw);
    const singleRefined = centreRefined === undefined ? null : singleMarkerSizeCameraPx(centreRefined);
    if (singleRaw !== null) {
      current["single-raw"] = singleRaw;
    }
    if (singleRefined !== null) {
      current["single-refined"] = singleRefined;
    }
    const cornerSpan = (byId: Map<number, CameraPoint[]>): number | null => {
      const topLeft = byId.get(CORNER_MARKER_IDS.topLeft);
      const topRight = byId.get(CORNER_MARKER_IDS.topRight);
      const bottomRight = byId.get(CORNER_MARKER_IDS.bottomRight);
      const bottomLeft = byId.get(CORNER_MARKER_IDS.bottomLeft);
      if (topLeft === undefined || topRight === undefined || bottomRight === undefined || bottomLeft === undefined) {
        return null;
      }
      return cornerSpanFromCornersCameraPx({ topLeft, topRight, bottomRight, bottomLeft });
    };
    const cornerRaw = cornerSpan(rawById);
    const cornerRefined = cornerSpan(refinedById);
    if (cornerRaw !== null) {
      current["corner-raw"] = cornerRaw;
    }
    if (cornerRefined !== null) {
      current["corner-refined"] = cornerRefined;
    }

    const sdPercent: Partial<Record<SpikeMetric, number>> = {};
    for (const metric of SPIKE_METRICS) {
      const value = current[metric];
      if (value !== undefined && Number.isFinite(value)) {
        this.windows[metric].push(value);
      }
      if (this.windows[metric].size >= 2) {
        sdPercent[metric] = this.windows[metric].standardDeviationPercent();
      }
    }

    const nowMs = performance.now();
    this.frameTimesMs.push(nowMs);
    if (this.frameTimesMs.length > 30) {
      this.frameTimesMs.shift();
    }
    const first = this.frameTimesMs[0] ?? nowMs;
    const framesPerSecond =
      this.frameTimesMs.length > 1 ? ((this.frameTimesMs.length - 1) * 1000) / (nowMs - first) : 0;

    this.drawOverlay(rawById, refinedById, widthCameraPx, heightCameraPx);
    const collecting = this.feedCollector(current, [...rawById.keys()], nowMs);

    this.patch({
      framesPerSecond,
      markerIds: [...rawById.keys()].sort((a, b) => a - b),
      current,
      sdPercent,
      refineFailures,
      collecting,
    });
  }

  private feedCollector(
    current: Partial<Record<SpikeMetric, number>>,
    markerIds: number[],
    nowMs: number,
  ): string | null {
    const collector = this.collector;
    if (collector === null) {
      return null;
    }
    collector.framesSeen += 1;
    for (const id of markerIds) {
      collector.idsSeen.add(id);
    }
    for (const metric of SPIKE_METRICS) {
      const value = current[metric];
      if (value !== undefined && Number.isFinite(value) && collector.values[metric].length < collector.target) {
        collector.values[metric].push(value);
      }
    }
    const started = SPIKE_METRICS.filter((metric) => collector.values[metric].length > 0);
    const done = started.length > 0 && started.every((metric) => collector.values[metric].length >= collector.target);
    const timedOut = collector.framesSeen >= collector.target * MAX_COLLECTION_FRAMES_FACTOR;
    if (done || timedOut) {
      this.collector = null;
      this.finishCollector(collector, nowMs);
      return null;
    }
    const best = Math.max(0, ...started.map((metric) => collector.values[metric].length));
    return `${collector.kind === "baseline" ? "Baseline" : "Reading"}: ${best} of ${collector.target} frames`;
  }

  private finishCollector(collector: Collector, nowMs: number): void {
    if (collector.kind === "baseline") {
      const baselines: Partial<Record<SpikeMetric, Baseline>> = {};
      for (const metric of SPIKE_METRICS) {
        const values = collector.values[metric];
        if (values.length >= collector.target) {
          baselines[metric] = { distanceMm: collector.baselineDistanceMm, sizeCameraPx: mean(values), frames: values.length };
        }
      }
      const count = Object.keys(baselines).length;
      this.patch({
        baselines,
        message:
          count === 0
            ? "Baseline not set: the markers were not seen in enough frames."
            : `Baseline set at ${collector.baselineDistanceMm} mm for ${count} metric(s).`,
      });
      return;
    }

    const elapsedS = (nowMs - collector.startedAtMs) / 1000;
    const framesPerSecond = elapsedS > 0 ? collector.framesSeen / elapsedS : 0;
    const hasCentre = collector.idsSeen.has(CENTRE_MARKER_ID);
    const hasCorners = [1, 2, 3, 4].every((id) => collector.idsSeen.has(id));
    const mode: SpikeReading["mode"] = hasCentre && hasCorners ? "both" : hasCentre ? "centre" : hasCorners ? "corners" : "none";
    const readings: SpikeReading[] = [];
    const savedAtIso = new Date().toISOString();
    for (const metric of SPIKE_METRICS) {
      const values = collector.values[metric];
      if (values.length < MIN_READING_FRAMES) {
        continue;
      }
      const meanCameraPx = mean(values);
      const baseline = this.snapshot.baselines[metric] ?? null;
      const estimate = baseline === null ? null : estimatedDistanceMm(baseline.distanceMm, baseline.sizeCameraPx, meanCameraPx);
      readings.push({
        savedAtIso,
        mode,
        metric,
        trueDistanceMm: collector.trueDistanceMm,
        meanCameraPx,
        sdPercent: standardDeviationPercent(values),
        frames: values.length,
        framesPerSecond,
        baselineDistanceMm: baseline?.distanceMm ?? null,
        baselineCameraPx: baseline?.sizeCameraPx ?? null,
        ratio: baseline === null ? null : baselineRatio(baseline.sizeCameraPx, meanCameraPx),
        estimatedDistanceMm: estimate,
        errorMm: estimate === null ? null : estimate - collector.trueDistanceMm,
        resolution: this.snapshot.resolution,
        zoom: this.currentZoomText(),
        detectionScale: this.snapshot.detectionScale,
        note: collector.note,
      });
    }
    if (readings.length === 0) {
      this.patch({ message: "Nothing saved: the markers were not seen in enough frames." });
      return;
    }
    this.onReadings(readings);
    this.patch({ message: `Saved ${readings.length} reading(s) at ${collector.trueDistanceMm} mm.` });
  }

  private drawOverlay(
    rawById: Map<number, CameraPoint[]>,
    refinedById: Map<number, CameraPoint[]>,
    widthCameraPx: number,
    heightCameraPx: number,
  ): void {
    const overlay = this.overlay;
    if (overlay === null) {
      return;
    }
    const overlayScale = Math.min(1, OVERLAY_MAX_WIDTH_PX / widthCameraPx);
    const width = Math.round(widthCameraPx * overlayScale);
    const height = Math.round(heightCameraPx * overlayScale);
    if (overlay.width !== width || overlay.height !== height) {
      overlay.width = width;
      overlay.height = height;
    }
    const ctx = overlay.getContext("2d");
    if (ctx === null) {
      return;
    }
    ctx.clearRect(0, 0, width, height);
    const outline = (corners: CameraPoint[], colour: string): void => {
      ctx.strokeStyle = colour;
      ctx.lineWidth = 2;
      ctx.beginPath();
      corners.forEach((corner, index) => {
        const x = corner.xCameraPx * overlayScale;
        const y = corner.yCameraPx * overlayScale;
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.closePath();
      ctx.stroke();
    };
    for (const corners of rawById.values()) {
      outline(corners, "#ef4444");
    }
    for (const corners of refinedById.values()) {
      outline(corners, "#22c55e");
    }
  }

  private stopStream(): void {
    this.running = false;
    this.collector = null;
    const video = this.video;
    if (video !== null && this.frameHandle !== null && typeof video.cancelVideoFrameCallback === "function") {
      video.cancelVideoFrameCallback(this.frameHandle);
    }
    if (this.animationHandle !== null) {
      cancelAnimationFrame(this.animationHandle);
    }
    this.frameHandle = null;
    this.animationHandle = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (video !== null) {
      video.srcObject = null;
    }
    for (const metric of SPIKE_METRICS) {
      this.windows[metric].clear();
    }
    this.frameTimesMs = [];
    this.lastVideoTime = -1;
    void this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
  }

  dispose(): void {
    this.stopStream();
    this.disposed = true;
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
  }
}

/** Greyscale crop of the full-resolution frame around a marker's rough corners. */
function greyCrop(
  ctx: CanvasRenderingContext2D,
  corners: readonly CameraPoint[],
  widthCameraPx: number,
  heightCameraPx: number,
): GreyImage | null {
  const xs = corners.map((corner) => corner.xCameraPx);
  const ys = corners.map((corner) => corner.yCameraPx);
  const sideCameraPx = singleMarkerSizeCameraPx(corners) ?? 0;
  const marginCameraPx = Math.ceil(sideCameraPx * 0.2 + 6);
  const left = Math.max(0, Math.floor(Math.min(...xs) - marginCameraPx));
  const top = Math.max(0, Math.floor(Math.min(...ys) - marginCameraPx));
  const right = Math.min(widthCameraPx, Math.ceil(Math.max(...xs) + marginCameraPx));
  const bottom = Math.min(heightCameraPx, Math.ceil(Math.max(...ys) + marginCameraPx));
  const width = right - left;
  const height = bottom - top;
  if (width < 4 || height < 4) {
    return null;
  }
  const rgba = ctx.getImageData(left, top, width, height).data;
  const values = new Float32Array(width * height);
  for (let i = 0; i < values.length; i += 1) {
    values[i] = 0.299 * (rgba[i * 4] ?? 0) + 0.587 * (rgba[i * 4 + 1] ?? 0) + 0.114 * (rgba[i * 4 + 2] ?? 0);
  }
  return {
    values,
    widthCameraPx: width,
    heightCameraPx: height,
    originXCameraPx: left,
    originYCameraPx: top,
  };
}

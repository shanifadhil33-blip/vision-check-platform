/**
 * The phone's rear camera and its frame loop, for movement detection only.
 * Loaded by remoteController only when the phone's address has movement=1.
 * All the maths lives in lib/movement/vision; nothing here is saved or sent
 * except the one marker size per frame handed to onFrame. No picture leaves
 * this object.
 *
 * Speed: until the marker is found, detection runs on a half-scale copy of
 * the frame. Once found, only a crop of 3x the marker's size around where it
 * was last seen is read, at full resolution; detection and refinement both
 * run on that crop. The whole full-resolution frame is never read.
 */

import type { UnavailableReason } from "@/lib/movement/broadcast";
import { markerCrop, type CropRect, searchImageSize } from "@/lib/movement/vision/crop";
import { type CameraPoint, quadCentre } from "@/lib/movement/vision/geometry";
import {
  createMarkerDetector,
  type DetectionMapping,
  MARKER_CELLS_ACROSS,
  type MarkerDetector,
  MOVEMENT_MARKER_ID,
} from "@/lib/movement/vision/markers";
import { singleMarkerSizeCameraPx } from "@/lib/movement/vision/markerSize";
import { type GreyImage, refineQuad } from "@/lib/movement/vision/refine";

export type FrameResult = {
  /** Refined marker side in camera px; null when not found or not refined. */
  sizeCameraPx: number | null;
  /** performance.now() when the frame was processed. */
  atMs: number;
  /** Date.now() at the same moment. */
  atEpochMs: number;
};

export type CameraStartResult =
  | { ok: true; widthCameraPx: number; heightCameraPx: number }
  | { ok: false; reason: UnavailableReason };

/** While searching the whole (half-scale) frame, at most one search this often: the costly path. */
export const MIN_SEARCH_INTERVAL_MS = 200;

type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
};

function reasonForError(error: unknown): UnavailableReason {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") {
    return "camera_refused";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError") {
    return "no_camera";
  }
  return "camera_error";
}

function greyFromRgba(rgba: Uint8ClampedArray, crop: CropRect): GreyImage {
  const values = new Float32Array(crop.widthCameraPx * crop.heightCameraPx);
  for (let i = 0; i < values.length; i += 1) {
    values[i] = 0.299 * (rgba[i * 4] ?? 0) + 0.587 * (rgba[i * 4 + 1] ?? 0) + 0.114 * (rgba[i * 4 + 2] ?? 0);
  }
  return {
    values,
    widthCameraPx: crop.widthCameraPx,
    heightCameraPx: crop.heightCameraPx,
    originXCameraPx: crop.leftCameraPx,
    originYCameraPx: crop.topCameraPx,
  };
}

export class MarkerCamera {
  private video: VideoWithFrameCallback | null = null;
  private stream: MediaStream | null = null;
  private detector: MarkerDetector | null = null;
  private searchCanvas: HTMLCanvasElement | null = null;
  private cropCanvas: HTMLCanvasElement | null = null;
  private frameHandle: number | null = null;
  private animationHandle: number | null = null;
  private lastVideoTime = -1;
  private wakeLock: WakeLockSentinel | null = null;
  /** Where the marker was last seen, in full-frame camera px. */
  private tracked: { centre: CameraPoint; sizeCameraPx: number } | null = null;
  private startGeneration = 0;
  private lastSearchAtMs: number | null = null;
  running = false;

  constructor(private readonly onFrame: (result: FrameResult) => void) {}

  /**
   * Asks for the rear camera. getUserMedia is called before the first await,
   * so when start() runs inside a tap the permission prompt comes from that tap.
   */
  start(): Promise<CameraStartResult> {
    this.stop();
    const generation = ++this.startGeneration;
    if (
      typeof window === "undefined" ||
      !window.isSecureContext ||
      typeof navigator === "undefined" ||
      navigator.mediaDevices?.getUserMedia === undefined
    ) {
      return Promise.resolve({ ok: false, reason: "no_camera" });
    }
    let request: Promise<MediaStream>;
    try {
      request = navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 3840 },
          height: { ideal: 2160 },
        },
      });
    } catch (error) {
      return Promise.resolve({ ok: false, reason: reasonForError(error) });
    }
    return this.finishStart(request, generation);
  }

  private async finishStart(request: Promise<MediaStream>, generation: number): Promise<CameraStartResult> {
    let stream: MediaStream;
    try {
      stream = await request;
    } catch (error) {
      console.error(error);
      return { ok: false, reason: reasonForError(error) };
    }
    if (generation !== this.startGeneration) {
      stream.getTracks().forEach((track) => track.stop());
      return { ok: false, reason: "camera_error" };
    }
    this.stream = stream;
    try {
      const track = stream.getVideoTracks()[0];
      if (track === undefined) {
        this.stop();
        return { ok: false, reason: "no_camera" };
      }
      const facingMode = (track.getSettings() as { facingMode?: unknown }).facingMode;
      if (facingMode === "user") {
        // Only a front camera: it would face the person, not the screen.
        this.stop();
        return { ok: false, reason: "no_rear_camera" };
      }
      await this.fixZoom(track);
      const video = this.ensureVideo();
      video.srcObject = stream;
      await video.play();
      if (generation !== this.startGeneration) {
        return { ok: false, reason: "camera_error" };
      }
      this.detector ??= createMarkerDetector();
      this.running = true;
      this.tracked = null;
      void this.acquireWakeLock();
      this.schedule();
      const settings = track.getSettings();
      return {
        ok: true,
        widthCameraPx: settings.width ?? video.videoWidth,
        heightCameraPx: settings.height ?? video.videoHeight,
      };
    } catch (error) {
      console.error(error);
      this.stop();
      return { ok: false, reason: reasonForError(error) };
    }
  }

  /** Zoom held at 1 where the camera reports a zoom range; ignored elsewhere. */
  private async fixZoom(track: MediaStreamTrack): Promise<void> {
    const capabilities =
      typeof track.getCapabilities === "function" ? (track.getCapabilities() as Record<string, unknown>) : {};
    const zoom = capabilities.zoom as { min?: unknown; max?: unknown } | undefined;
    if (zoom === undefined || typeof zoom.min !== "number" || typeof zoom.max !== "number") {
      return;
    }
    const targetZoom = Math.min(zoom.max, Math.max(zoom.min, 1));
    try {
      await track.applyConstraints({ advanced: [{ zoom: targetZoom } as unknown as MediaTrackConstraintSet] });
    } catch (error) {
      console.error(error);
    }
  }

  /** An off-screen-sized video element: present in the page so every browser delivers frames. */
  private ensureVideo(): VideoWithFrameCallback {
    if (this.video !== null) {
      return this.video;
    }
    const video = document.createElement("video") as VideoWithFrameCallback;
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("aria-hidden", "true");
    video.style.position = "fixed";
    video.style.left = "0px";
    video.style.top = "0px";
    video.style.width = "1px";
    video.style.height = "1px";
    video.style.opacity = "0";
    video.style.pointerEvents = "none";
    document.body.appendChild(video);
    this.video = video;
    return video;
  }

  private async acquireWakeLock(): Promise<void> {
    try {
      if (!("wakeLock" in navigator) || !this.running) {
        return;
      }
      const sentinel = await navigator.wakeLock.request("screen");
      if (!this.running) {
        await sentinel.release();
        return;
      }
      this.wakeLock = sentinel;
    } catch {
      // Refused or unsupported: the camera still runs.
    }
  }

  private schedule(): void {
    const video = this.video;
    if (video === null || !this.running) {
      return;
    }
    if (typeof video.requestVideoFrameCallback === "function") {
      this.frameHandle = video.requestVideoFrameCallback(() => this.onVideoFrame());
    } else {
      this.animationHandle = requestAnimationFrame(() => this.onVideoFrame());
    }
  }

  private onVideoFrame(): void {
    if (!this.running) {
      return;
    }
    try {
      const sizeCameraPx = this.processFrame();
      if (sizeCameraPx !== undefined) {
        this.onFrame({ sizeCameraPx, atMs: performance.now(), atEpochMs: Date.now() });
      }
    } catch (error) {
      console.error(error);
      this.tracked = null;
    }
    this.schedule();
  }

  /** The refined size, null when not found, undefined when there was no new frame. */
  private processFrame(): number | null | undefined {
    const video = this.video;
    const detector = this.detector;
    if (video === null || detector === null || video.readyState < 2 || video.currentTime === this.lastVideoTime) {
      return undefined;
    }
    this.lastVideoTime = video.currentTime;
    const frameWidthCameraPx = video.videoWidth;
    const frameHeightCameraPx = video.videoHeight;
    if (frameWidthCameraPx === 0 || frameHeightCameraPx === 0) {
      return undefined;
    }

    let rough: CameraPoint[] | null = null;
    if (this.tracked !== null) {
      const crop = markerCrop({
        centre: this.tracked.centre,
        sizeCameraPx: this.tracked.sizeCameraPx,
        frameWidthCameraPx,
        frameHeightCameraPx,
      });
      if (crop !== null) {
        const rgba = this.readCrop(video, crop);
        if (rgba !== null) {
          rough = this.findMarker(detector, rgba, crop.widthCameraPx, crop.heightCameraPx, {
            scaleX: 1,
            scaleY: 1,
            originXCameraPx: crop.leftCameraPx,
            originYCameraPx: crop.topCameraPx,
          });
          if (rough !== null) {
            return this.refineAndTrack(rough, greyFromRgba(rgba, crop));
          }
        }
      }
      // Lost from the crop: back to the half-scale search on the next frame.
      this.tracked = null;
      return null;
    }

    const nowMs = performance.now();
    if (this.lastSearchAtMs !== null && nowMs - this.lastSearchAtMs < MIN_SEARCH_INTERVAL_MS) {
      return undefined;
    }
    this.lastSearchAtMs = nowMs;
    const { widthDetectionPx, heightDetectionPx } = searchImageSize(frameWidthCameraPx, frameHeightCameraPx);
    this.searchCanvas ??= document.createElement("canvas");
    const search = this.searchCanvas;
    if (search.width !== widthDetectionPx || search.height !== heightDetectionPx) {
      search.width = widthDetectionPx;
      search.height = heightDetectionPx;
    }
    const searchCtx = search.getContext("2d", { willReadFrequently: true });
    if (searchCtx === null) {
      return null;
    }
    searchCtx.drawImage(video, 0, 0, widthDetectionPx, heightDetectionPx);
    const searchRgba = searchCtx.getImageData(0, 0, widthDetectionPx, heightDetectionPx).data;
    rough = this.findMarker(detector, searchRgba, widthDetectionPx, heightDetectionPx, {
      scaleX: widthDetectionPx / frameWidthCameraPx,
      scaleY: heightDetectionPx / frameHeightCameraPx,
      originXCameraPx: 0,
      originYCameraPx: 0,
    });
    if (rough === null) {
      return null;
    }
    const roughSize = singleMarkerSizeCameraPx(rough);
    const roughCentre = quadCentre(rough);
    if (roughSize === null || roughCentre === null) {
      return null;
    }
    const crop = markerCrop({
      centre: roughCentre,
      sizeCameraPx: roughSize,
      frameWidthCameraPx,
      frameHeightCameraPx,
    });
    if (crop === null) {
      return null;
    }
    const rgba = this.readCrop(video, crop);
    if (rgba === null) {
      return null;
    }
    return this.refineAndTrack(rough, greyFromRgba(rgba, crop));
  }

  private findMarker(
    detector: MarkerDetector,
    rgba: Uint8ClampedArray,
    widthPx: number,
    heightPx: number,
    mapping: DetectionMapping,
  ): CameraPoint[] | null {
    const marker = detector
      .detect(rgba, widthPx, heightPx, mapping)
      .find((candidate) => candidate.markerId === MOVEMENT_MARKER_ID);
    return marker === undefined ? null : marker.rawCorners;
  }

  private refineAndTrack(rough: CameraPoint[], crop: GreyImage): number | null {
    const refined = refineQuad(crop, rough, { cellsAcross: MARKER_CELLS_ACROSS });
    const corners = refined?.corners ?? rough;
    const centre = quadCentre(corners);
    const trackedSize = singleMarkerSizeCameraPx(corners);
    this.tracked = centre !== null && trackedSize !== null ? { centre, sizeCameraPx: trackedSize } : null;
    if (refined === null) {
      return null;
    }
    return singleMarkerSizeCameraPx(refined.corners);
  }

  /** Reads only the crop's pixels, at full resolution. */
  private readCrop(video: HTMLVideoElement, crop: CropRect): Uint8ClampedArray | null {
    this.cropCanvas ??= document.createElement("canvas");
    const canvas = this.cropCanvas;
    if (canvas.width !== crop.widthCameraPx || canvas.height !== crop.heightCameraPx) {
      canvas.width = crop.widthCameraPx;
      canvas.height = crop.heightCameraPx;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (ctx === null) {
      return null;
    }
    ctx.drawImage(
      video,
      crop.leftCameraPx,
      crop.topCameraPx,
      crop.widthCameraPx,
      crop.heightCameraPx,
      0,
      0,
      crop.widthCameraPx,
      crop.heightCameraPx,
    );
    return ctx.getImageData(0, 0, crop.widthCameraPx, crop.heightCameraPx).data;
  }

  stop(): void {
    this.startGeneration += 1;
    this.running = false;
    this.tracked = null;
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
    this.lastVideoTime = -1;
    const lock = this.wakeLock;
    this.wakeLock = null;
    void lock?.release().catch(() => undefined);
  }

  dispose(): void {
    this.stop();
    this.video?.remove();
    this.video = null;
    this.searchCanvas = null;
    this.cropCanvas = null;
  }
}


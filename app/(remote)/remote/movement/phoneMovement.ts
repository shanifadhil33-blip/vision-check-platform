/**
 * Movement detection on the phone. Loaded by remoteController only when the
 * phone's own address has movement=1, so with the switch off none of this,
 * the camera or the broadcasts is ever loaded.
 *
 * Starts the rear camera on the "I'm at my mark" tap, takes the baseline
 * (median of the first 30 refined sizes), then sends one distance broadcast
 * at most every 250 ms on the session channel. No loop-state write. Shows its
 * own status from its own camera.
 */

import {
  DISTANCE_BASELINE_EVENT,
  DISTANCE_EVENT,
  DISTANCE_UNAVAILABLE_EVENT,
  distanceBroadcast,
  initialMarkerVisibilityStream,
  MARKER_VISIBILITY_EVENT,
  type MarkerVisibilityStream,
  PHONE_BROADCAST_EVENTS,
  receiveMarkerVisibility,
  type UnavailableReason,
} from "@/lib/movement/broadcast";
import {
  type Baseline,
  BASELINE_TIMEOUT_MS,
  baselineFromSizes,
  distanceRatio,
  FIRST_MARKER_TIMEOUT_MS,
  MIN_SEND_INTERVAL_MS,
  nextSeq,
  phoneMovementStatus,
  RESEND_INTERVAL_MS,
} from "@/lib/movement/phoneTracking";
import {
  joinSessionChannelWithBroadcasts,
  type SessionChannel,
  type SessionChannelWithBroadcasts,
} from "@/lib/session/channel";
import { type CameraStartResult, type FrameResult, MarkerCamera } from "./markerCamera";

export type PhoneMovementStatusView =
  | "idle"
  | "starting"
  | "ok"
  | "lost"
  | "go-back"
  | "unavailable"
  | "needs-restart";

export type PhoneMovementView = { status: PhoneMovementStatusView };

export type CameraLike = {
  start: () => Promise<CameraStartResult>;
  stop: () => void;
  dispose: () => void;
  readonly running: boolean;
};

export type PhoneMovementDeps = {
  nowMs: () => number;
  nowEpochMs: () => number;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
  createCamera: (onFrame: (result: FrameResult) => void) => CameraLike;
  joinChannel: typeof joinSessionChannelWithBroadcasts;
  storage: () => Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  addVisibilityListener: (listener: () => void) => () => void;
  isHidden: () => boolean;
};

const DEFAULT_DEPS: PhoneMovementDeps = {
  nowMs: () => performance.now(),
  nowEpochMs: () => Date.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
  createCamera: (onFrame) => new MarkerCamera(onFrame),
  joinChannel: joinSessionChannelWithBroadcasts,
  storage: () => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  },
  addVisibilityListener: (listener) => {
    document.addEventListener("visibilitychange", listener);
    return () => document.removeEventListener("visibilitychange", listener);
  },
  isHidden: () => document.visibilityState === "hidden",
};

const TICK_MS = 500;
const STORAGE_KEY_PREFIX = "vcp.movementBaseline.v1:";

type StoredBaseline = Baseline & { widthCameraPx: number; heightCameraPx: number };

/** Phases in which the test is under way after the tap, so the camera should run. */
const CAMERA_PHASES: ReadonlySet<string> = new Set(["at_mark", "waiting", "choosing", "sent", "send_failed"]);
/** Phases in which the camera must be off. */
const OFF_PHASES: ReadonlySet<string> = new Set(["go_to_mark", "complete", "not_found", "error", "connect", "loading"]);

export type PhoneMovement = {
  joinChannel: (sessionId: string, onNudge: () => void) => SessionChannel;
  /** Inside the "I'm at my mark" tap: starts the camera and a new baseline. */
  tapAtMark: () => void;
  /** Inside the "Turn the camera back on" tap. */
  restartFromButton: () => void;
  phaseChanged: (phase: string) => void;
  view: () => PhoneMovementView;
  dispose: () => void;
  /** For tests. */
  tick: () => void;
};

export function createPhoneMovement(input: {
  sessionId: string;
  onView: (view: PhoneMovementView) => void;
  deps?: PhoneMovementDeps;
}): PhoneMovement {
  const deps = input.deps ?? DEFAULT_DEPS;
  const storageKey = `${STORAGE_KEY_PREFIX}${input.sessionId}`;
  const camera = deps.createCamera(onFrame);

  let channel: SessionChannelWithBroadcasts | null = null;
  let wantCamera = false;
  let needsRestart = false;
  let unavailable: UnavailableReason | null = null;
  let baseline: StoredBaseline | null = null;
  let collecting: number[] = [];
  let collectStartedAtMs: number | null = null;
  let firstFoundAtMs: number | null = null;
  let lastFoundAtMs: number | null = null;
  let latestRatio: number | null = null;
  let lastSentAtMs: number | null = null;
  let lastBaselineSentAtMs: number | null = null;
  let lastUnavailableSentAtMs: number | null = null;
  let seq: number | null = null;
  let cameraSize: { widthCameraPx: number; heightCameraPx: number } | null = null;
  let stoppedByHidden = false;
  let startGeneration = 0;
  let disposed = false;
  let lastView: PhoneMovementStatusView | null = null;
  let markerVisibility: MarkerVisibilityStream = initialMarkerVisibilityStream();
  /** The main screen hid the marker on purpose (a letter between letters); when heard. */
  let markerHiddenAtMs: number | null = null;
  /** The main screen put the hidden marker back; when heard. */
  let markerShownAtMs: number | null = null;

  const tickHandle = deps.setInterval(() => tick(), TICK_MS);
  const removeVisibilityListener = deps.addVisibilityListener(onVisibilityChange);

  function status(): PhoneMovementStatusView {
    if (unavailable !== null) {
      return "unavailable";
    }
    if (needsRestart) {
      return "needs-restart";
    }
    if (!wantCamera) {
      return "idle";
    }
    if (!camera.running) {
      return "starting";
    }
    return phoneMovementStatus({ nowMs: deps.nowMs(), lastFoundAtMs, latestRatio, markerHiddenAtMs, markerShownAtMs });
  }

  function emitView(): void {
    const next = status();
    if (next !== lastView) {
      lastView = next;
      input.onView({ status: next });
    }
  }

  function send(event: string, payload: { [key: string]: unknown }): void {
    if (channel === null) {
      return;
    }
    void channel.sendBroadcast(event, payload).catch(() => false);
  }

  function onBroadcast(event: string, raw: unknown): void {
    if (disposed || event !== MARKER_VISIBILITY_EVENT) {
      return;
    }
    const received = receiveMarkerVisibility(markerVisibility, raw);
    markerVisibility = received.stream;
    const visibility = received.visibility;
    if (visibility === null) {
      return;
    }
    if (!visibility.visible) {
      // Each hide is sent once, so a new one restarts the 10 s limit even if the last "back" was lost.
      markerHiddenAtMs = deps.nowMs();
      markerShownAtMs = null;
    } else if (markerHiddenAtMs !== null) {
      markerHiddenAtMs = null;
      markerShownAtMs = deps.nowMs();
    }
    emitView();
  }

  function readStoredBaseline(): StoredBaseline | null {
    try {
      const raw = deps.storage()?.getItem(storageKey) ?? null;
      if (raw === null) {
        return null;
      }
      const parsed = JSON.parse(raw) as Partial<StoredBaseline>;
      if (
        typeof parsed.baselinePx === "number" &&
        parsed.baselinePx > 0 &&
        typeof parsed.frames === "number" &&
        typeof parsed.widthCameraPx === "number" &&
        typeof parsed.heightCameraPx === "number"
      ) {
        return {
          baselinePx: parsed.baselinePx,
          frames: parsed.frames,
          widthCameraPx: parsed.widthCameraPx,
          heightCameraPx: parsed.heightCameraPx,
        };
      }
    } catch {
      // Unreadable storage behaves as empty.
    }
    return null;
  }

  function writeStoredBaseline(value: StoredBaseline | null): void {
    try {
      const storage = deps.storage();
      if (value === null) {
        storage?.removeItem(storageKey);
      } else {
        storage?.setItem(storageKey, JSON.stringify(value));
      }
    } catch {
      // Not kept: a reload then carries on without movement detection.
    }
  }

  function markUnavailable(reason: UnavailableReason): void {
    if (unavailable !== null) {
      return;
    }
    unavailable = reason;
    wantCamera = false;
    needsRestart = false;
    camera.stop();
    lastUnavailableSentAtMs = deps.nowMs();
    send(DISTANCE_UNAVAILABLE_EVENT, { reason });
    emitView();
  }

  function startCamera(): void {
    const generation = ++startGeneration;
    needsRestart = false;
    stoppedByHidden = false;
    if (baseline === null) {
      collecting = [];
      collectStartedAtMs = deps.nowMs();
      firstFoundAtMs = null;
    }
    // camera.start() calls getUserMedia before its first await.
    const started = camera.start();
    emitView();
    void started.then((result) => {
      if (disposed || generation !== startGeneration || !wantCamera) {
        if (result.ok && (!wantCamera || disposed)) {
          camera.stop();
        }
        return;
      }
      onStarted(result);
    });
  }

  function onStarted(result: CameraStartResult): void {
    if (!result.ok) {
      markUnavailable(result.reason);
      return;
    }
    cameraSize = { widthCameraPx: result.widthCameraPx, heightCameraPx: result.heightCameraPx };
    if (
      baseline !== null &&
      (baseline.widthCameraPx !== result.widthCameraPx || baseline.heightCameraPx !== result.heightCameraPx)
    ) {
      // Another resolution means another px scale: the old baseline no longer applies.
      markUnavailable("camera_changed");
      return;
    }
    emitView();
  }

  /** A restart without a tap (page shown again, page reloaded): may be refused; then the button. */
  function restartWithoutTap(): void {
    const generation = ++startGeneration;
    stoppedByHidden = false;
    if (baseline === null) {
      collecting = [];
      collectStartedAtMs = deps.nowMs();
      firstFoundAtMs = null;
    }
    void camera.start().then((result) => {
      if (disposed || generation !== startGeneration || !wantCamera) {
        if (result.ok) {
          camera.stop();
        }
        return;
      }
      if (!result.ok) {
        needsRestart = true;
        emitView();
        return;
      }
      onStarted(result);
    });
    emitView();
  }

  function onFrame(result: FrameResult): void {
    if (disposed || unavailable !== null || !wantCamera) {
      return;
    }
    const sizeCameraPx = result.sizeCameraPx;
    if (sizeCameraPx !== null) {
      lastFoundAtMs = result.atMs;
      firstFoundAtMs ??= result.atMs;
      if (baseline === null) {
        collecting.push(sizeCameraPx);
        const taken = baselineFromSizes(collecting);
        if (taken !== null && cameraSize !== null) {
          baseline = { ...taken, ...cameraSize };
          writeStoredBaseline(baseline);
          lastBaselineSentAtMs = result.atMs;
          send(DISTANCE_BASELINE_EVENT, { baselinePx: taken.baselinePx, frames: taken.frames });
        }
      } else {
        latestRatio = distanceRatio(baseline.baselinePx, sizeCameraPx);
      }
    }
    if (baseline !== null && (lastSentAtMs === null || result.atMs - lastSentAtMs >= MIN_SEND_INTERVAL_MS)) {
      lastSentAtMs = result.atMs;
      seq = nextSeq(seq, result.atEpochMs);
      const ratio = sizeCameraPx === null ? null : distanceRatio(baseline.baselinePx, sizeCameraPx);
      send(DISTANCE_EVENT, distanceBroadcast({ seq, ratio, sizePx: sizeCameraPx, capturedAtMs: result.atEpochMs }));
    }
    emitView();
  }

  function tick(): void {
    if (disposed) {
      return;
    }
    const nowMs = deps.nowMs();
    if (unavailable !== null) {
      if (lastUnavailableSentAtMs === null || nowMs - lastUnavailableSentAtMs >= RESEND_INTERVAL_MS) {
        lastUnavailableSentAtMs = nowMs;
        send(DISTANCE_UNAVAILABLE_EVENT, { reason: unavailable });
      }
      return;
    }
    if (wantCamera && camera.running && baseline === null && collectStartedAtMs !== null) {
      if (firstFoundAtMs === null && nowMs - collectStartedAtMs >= FIRST_MARKER_TIMEOUT_MS) {
        markUnavailable("no_marker");
        return;
      }
      if (nowMs - collectStartedAtMs >= BASELINE_TIMEOUT_MS) {
        markUnavailable("no_baseline");
        return;
      }
    }
    if (
      wantCamera &&
      baseline !== null &&
      (lastBaselineSentAtMs === null || nowMs - lastBaselineSentAtMs >= RESEND_INTERVAL_MS)
    ) {
      lastBaselineSentAtMs = nowMs;
      send(DISTANCE_BASELINE_EVENT, { baselinePx: baseline.baselinePx, frames: baseline.frames });
    }
    emitView();
  }

  function onVisibilityChange(): void {
    if (disposed) {
      return;
    }
    if (deps.isHidden()) {
      if (camera.running || wantCamera) {
        startGeneration += 1;
        camera.stop();
        stoppedByHidden = wantCamera;
        emitView();
      }
      return;
    }
    if (stoppedByHidden && wantCamera && unavailable === null) {
      restartWithoutTap();
    }
  }

  function tapAtMark(): void {
    if (disposed) {
      return;
    }
    unavailable = null;
    needsRestart = false;
    baseline = null;
    latestRatio = null;
    lastFoundAtMs = null;
    lastBaselineSentAtMs = null;
    writeStoredBaseline(null);
    wantCamera = true;
    startCamera();
  }

  function restartFromButton(): void {
    if (disposed || !needsRestart || unavailable !== null) {
      return;
    }
    wantCamera = true;
    startCamera();
  }

  function phaseChanged(phase: string): void {
    if (disposed) {
      return;
    }
    if (OFF_PHASES.has(phase)) {
      if (wantCamera || camera.running) {
        startGeneration += 1;
        wantCamera = false;
        needsRestart = false;
        camera.stop();
      }
      emitView();
      return;
    }
    if (!CAMERA_PHASES.has(phase) || wantCamera || unavailable !== null) {
      return;
    }
    // The test is under way but this page has no camera running: it was reloaded.
    const stored = baseline ?? readStoredBaseline();
    if (stored === null) {
      markUnavailable("baseline_lost");
      return;
    }
    baseline = stored;
    wantCamera = true;
    if (deps.isHidden()) {
      stoppedByHidden = true;
      return;
    }
    restartWithoutTap();
  }

  return {
    joinChannel(sessionId, onNudge) {
      const joined = deps.joinChannel(sessionId, onNudge, PHONE_BROADCAST_EVENTS, onBroadcast);
      channel = joined;
      return {
        sendNudge: (kind) => joined.sendNudge(kind),
        leave: () => {
          if (channel === joined) {
            channel = null;
          }
          joined.leave();
        },
      };
    },
    tapAtMark,
    restartFromButton,
    phaseChanged,
    view: () => ({ status: status() }),
    dispose() {
      disposed = true;
      deps.clearInterval(tickHandle);
      removeVisibilityListener();
      camera.dispose();
    },
    tick,
  };
}

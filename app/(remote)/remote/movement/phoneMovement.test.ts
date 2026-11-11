import { describe, expect, it } from "vitest";
import type { CameraStartResult, FrameResult } from "./markerCamera";
import { createPhoneMovement, type PhoneMovementDeps, type PhoneMovementStatusView } from "./phoneMovement";

function harness(options: { startResults?: CameraStartResult[]; stored?: string; hidden?: boolean } = {}) {
  let nowMs = 0;
  let hidden = options.hidden ?? false;
  const sent: [string, Record<string, unknown>][] = [];
  const views: PhoneMovementStatusView[] = [];
  const storage = new Map<string, string>();
  if (options.stored !== undefined) {
    storage.set("vcp.movementBaseline.v1:s-1", options.stored);
  }
  const results = [...(options.startResults ?? [])];
  let onFrame: ((result: FrameResult) => void) | null = null;
  let visibilityListener: (() => void) | null = null;
  const camera = {
    running: false,
    starts: 0,
    stops: 0,
    start(): Promise<CameraStartResult> {
      this.starts += 1;
      const result = results.shift() ?? { ok: true, widthCameraPx: 3840, heightCameraPx: 2160 };
      this.running = result.ok;
      return Promise.resolve(result);
    },
    stop() {
      this.stops += 1;
      this.running = false;
    },
    dispose() {
      this.running = false;
    },
  };
  const deps: PhoneMovementDeps = {
    nowMs: () => nowMs,
    nowEpochMs: () => Date.UTC(2026, 10, 11) + nowMs,
    setInterval: () => 0,
    clearInterval: () => undefined,
    createCamera: (callback) => {
      onFrame = callback;
      return camera;
    },
    joinChannel: () => ({
      sendNudge: async () => true,
      sendBroadcast: async (event, payload) => {
        sent.push([event, payload]);
        return true;
      },
      leave: () => undefined,
    }),
    storage: () => ({
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    }),
    addVisibilityListener: (listener) => {
      visibilityListener = listener;
      return () => undefined;
    },
    isHidden: () => hidden,
  };
  const phone = createPhoneMovement({ sessionId: "s-1", onView: (view) => views.push(view.status), deps });
  phone.joinChannel("s-1", () => undefined);
  return {
    phone,
    camera,
    sent,
    views,
    storage,
    frame(sizeCameraPx: number | null) {
      onFrame!({ sizeCameraPx, atMs: nowMs, atEpochMs: Date.UTC(2026, 10, 11) + nowMs });
    },
    advance(ms: number) {
      nowMs += ms;
      phone.tick();
    },
    framesFor(ms: number, sizeCameraPx: number | null, everyMs = 50) {
      for (let elapsed = 0; elapsed < ms; elapsed += everyMs) {
        nowMs += everyMs;
        this.frame(sizeCameraPx);
      }
      phone.tick();
    },
    setHidden(value: boolean) {
      hidden = value;
      visibilityListener!();
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("phone movement: the tap", () => {
  it("starts the camera inside the tap, before anything is awaited", () => {
    const h = harness();
    h.phone.tapAtMark();
    expect(h.camera.starts).toBe(1);
  });

  it("baseline = median of the first 30 sizes, sent once, then distances at most every 250 ms", async () => {
    const h = harness();
    h.phone.tapAtMark();
    await flush();
    const sizes = Array.from({ length: 30 }, (_, i) => 90 + (i % 3));
    for (const size of sizes) {
      h.framesFor(50, size);
    }
    expect(h.sent.filter(([event]) => event === "distance_baseline")).toEqual([
      ["distance_baseline", { baselinePx: 91, frames: 30 }],
    ]);
    // The frame that completes the baseline (size 92) is sent at once; then 20 frames 50 ms
    // apart at size 91 / 1.05 give only one send per 250 ms, ratio 1.05.
    h.framesFor(1000, 91 / 1.05);
    const distances = h.sent.filter(([event]) => event === "distance").map(([, payload]) => payload);
    expect(distances.length).toBe(5);
    expect(distances[0]!.ratio as number).toBeCloseTo(91 / 92, 10);
    for (const payload of distances.slice(1)) {
      expect(payload.ratio as number).toBeCloseTo(1.05, 10);
    }
    expect(distances.map((payload) => payload.seq)).toEqual(
      [0, 1, 2, 3, 4].map((i) => (distances[0]!.seq as number) + i),
    );
    expect(JSON.parse(h.storage.get("vcp.movementBaseline.v1:s-1")!)).toEqual({
      baselinePx: 91,
      frames: 30,
      widthCameraPx: 3840,
      heightCameraPx: 2160,
    });
  });

  it("status: lost after 2000 ms without the marker; go back beyond 25 percent", async () => {
    const h = harness();
    h.phone.tapAtMark();
    await flush();
    h.framesFor(1500, 91);
    h.framesFor(500, 91 / 1.3);
    expect(h.phone.view().status).toBe("go-back");
    h.framesFor(2000, null);
    expect(h.phone.view().status).toBe("lost");
    // A frame without the marker after the baseline is still sent, as not found.
    expect(h.sent.at(-1)![1]).toMatchObject({ found: false, ratio: null, sizePx: null });
  });
});

describe("phone movement: giving up", () => {
  it("camera refused: sends distance_unavailable and shows the unavailable line", async () => {
    const h = harness({ startResults: [{ ok: false, reason: "camera_refused" }] });
    h.phone.tapAtMark();
    await flush();
    expect(h.sent).toEqual([["distance_unavailable", { reason: "camera_refused" }]]);
    expect(h.phone.view().status).toBe("unavailable");
    // Sent again every 5 s in case a broadcast was lost.
    h.advance(5000);
    expect(h.sent).toHaveLength(2);
  });

  it("no marker within 10 s of the tap: unavailable no_marker, camera stopped", async () => {
    const h = harness();
    h.phone.tapAtMark();
    await flush();
    h.advance(9999);
    expect(h.sent).toEqual([]);
    h.advance(1);
    expect(h.sent).toEqual([["distance_unavailable", { reason: "no_marker" }]]);
    expect(h.camera.running).toBe(false);
  });
});

describe("phone movement: hidden page, reload, phase changes", () => {
  it("hidden stops the camera; shown again restarts it; a refused restart shows the button, which restarts it", async () => {
    const h = harness({
      startResults: [
        { ok: true, widthCameraPx: 3840, heightCameraPx: 2160 },
        { ok: false, reason: "camera_refused" },
        { ok: true, widthCameraPx: 3840, heightCameraPx: 2160 },
      ],
    });
    h.phone.tapAtMark();
    await flush();
    h.setHidden(true);
    expect(h.camera.running).toBe(false);
    h.setHidden(false);
    await flush();
    expect(h.camera.starts).toBe(2);
    expect(h.phone.view().status).toBe("needs-restart");
    h.phone.restartFromButton();
    await flush();
    expect(h.camera.starts).toBe(3);
    expect(h.camera.running).toBe(true);
  });

  it("reloaded mid-test with a stored baseline: restarts with it; without one: unavailable baseline_lost", async () => {
    const stored = JSON.stringify({ baselinePx: 91, frames: 30, widthCameraPx: 3840, heightCameraPx: 2160 });
    const withBaseline = harness({ stored });
    withBaseline.phone.phaseChanged("choosing");
    await flush();
    expect(withBaseline.camera.starts).toBe(1);
    withBaseline.framesFor(300, 91);
    expect(withBaseline.sent.find(([event]) => event === "distance")![1]).toMatchObject({ ratio: 1, found: true });

    const without = harness();
    without.phone.phaseChanged("waiting");
    expect(without.sent).toEqual([["distance_unavailable", { reason: "baseline_lost" }]]);
    expect(without.camera.starts).toBe(0);
  });

  it("a stored baseline from another camera resolution is not used", async () => {
    const stored = JSON.stringify({ baselinePx: 91, frames: 30, widthCameraPx: 1920, heightCameraPx: 1080 });
    const h = harness({ stored });
    h.phone.phaseChanged("waiting");
    await flush();
    expect(h.sent).toEqual([["distance_unavailable", { reason: "camera_changed" }]]);
  });

  it("back to the go-to-mark screen stops the camera; the next tap takes a new baseline", async () => {
    const h = harness();
    h.phone.tapAtMark();
    await flush();
    h.phone.phaseChanged("go_to_mark");
    expect(h.camera.running).toBe(false);
    expect(h.phone.view().status).toBe("idle");
  });
});

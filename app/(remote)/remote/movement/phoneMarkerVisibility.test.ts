import { describe, expect, it } from "vitest";
import type { CameraStartResult, FrameResult } from "./markerCamera";
import { createPhoneMovement, type PhoneMovementDeps } from "./phoneMovement";

function harness() {
  let nowMs = 0;
  let onFrame: ((result: FrameResult) => void) | null = null;
  let onBroadcast: ((event: string, payload: unknown) => void) | null = null;
  let listened: readonly string[] = [];
  const camera = {
    running: false,
    start(): Promise<CameraStartResult> {
      this.running = true;
      return Promise.resolve({ ok: true, widthCameraPx: 3840, heightCameraPx: 2160 });
    },
    stop() {
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
    joinChannel: (_sessionId, _onNudge, events, callback) => {
      listened = events;
      onBroadcast = callback;
      return { sendNudge: async () => true, sendBroadcast: async () => true, leave: () => undefined };
    },
    storage: () => null,
    addVisibilityListener: () => () => undefined,
    isHidden: () => false,
  };
  const phone = createPhoneMovement({ sessionId: "s-1", onView: () => undefined, deps });
  phone.joinChannel("s-1", () => undefined);
  return {
    phone,
    listened: () => listened,
    status: () => phone.view().status,
    visibility(payload: unknown) {
      onBroadcast!("marker_visibility", payload);
    },
    advance(ms: number) {
      nowMs += ms;
      phone.tick();
    },
    framesFor(ms: number, sizeCameraPx: number | null) {
      for (let elapsed = 0; elapsed < ms; elapsed += 50) {
        nowMs += 50;
        onFrame!({ sizeCameraPx, atMs: nowMs, atEpochMs: Date.UTC(2026, 10, 11) + nowMs });
      }
      phone.tick();
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Tapped, baseline taken, marker seen up to now. */
async function tracking() {
  const h = harness();
  h.phone.tapAtMark();
  await flush();
  h.framesFor(1500, 91);
  h.framesFor(500, 91);
  expect(h.status()).toBe("ok");
  return h;
}

describe("phone movement: the marker hidden on purpose", () => {
  it("listens for marker_visibility only", () => {
    expect(harness().listened()).toEqual(["marker_visibility"]);
  });

  it("stays quiet while hidden: no lost line, no go-back line", async () => {
    const h = await tracking();
    h.framesFor(500, 91 / 1.3);
    expect(h.status()).toBe("go-back");
    h.visibility({ visible: false, seq: 1 });
    expect(h.status()).toBe("ok");
    h.framesFor(5000, null);
    expect(h.status()).toBe("ok");
  });

  it("visible again: shows lost 2000 ms later if the marker is still not found", async () => {
    const h = await tracking();
    h.visibility({ visible: false, seq: 1 });
    h.framesFor(5000, null);
    h.visibility({ visible: true, seq: 2 });
    expect(h.status()).toBe("ok");
    h.advance(1999);
    expect(h.status()).toBe("ok");
    h.advance(1);
    expect(h.status()).toBe("lost");
    // A late "hidden" from before is ignored.
    h.visibility({ visible: false, seq: 1 });
    expect(h.status()).toBe("lost");
  });

  it("a hidden flag older than 10 s is ignored: a lost broadcast never hides a real problem", async () => {
    const h = await tracking();
    h.visibility({ visible: false, seq: 1 });
    h.advance(9999);
    expect(h.status()).toBe("ok");
    h.advance(1);
    expect(h.status()).toBe("lost");
  });

  it("never received, or malformed: today's behaviour, lost at 2000 ms", async () => {
    const h = await tracking();
    h.visibility({ visible: "no", seq: 1 });
    h.advance(1999);
    expect(h.status()).toBe("ok");
    h.advance(1);
    expect(h.status()).toBe("lost");
  });
});

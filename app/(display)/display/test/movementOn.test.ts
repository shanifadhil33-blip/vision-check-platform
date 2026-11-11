/**
 * Movement switch ON (?movement=1), main screen, through the real controller,
 * session store and RPC wrappers against an in-memory server. The phone's
 * broadcasts are fed straight into the channel listener.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  server: null as null | import("@/lib/session/fakeServer.testkit").FakeServer,
  nudges: [] as (() => void)[],
  broadcast: null as null | ((event: string, payload: unknown) => void),
  oldJoinCalls: 0,
}));

vi.mock("@/lib/db/client", () => ({
  getSupabaseBrowserClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => hoisted.server!.rpc(name, args),
  }),
}));

vi.mock("@/lib/session/channel", () => ({
  joinSessionChannel: () => {
    hoisted.oldJoinCalls += 1;
    throw new Error("movement on must join through joinSessionChannelWithBroadcasts");
  },
  joinSessionChannelWithBroadcasts: (
    _sessionId: string,
    onNudge: () => void,
    _events: readonly string[],
    onBroadcast: (event: string, payload: unknown) => void,
  ) => {
    hoisted.nudges.push(onNudge);
    hoisted.broadcast = onBroadcast;
    return {
      sendNudge: async () => true,
      sendBroadcast: async () => true,
      leave: () => undefined,
    };
  },
}));

vi.mock("qrcode", () => ({
  default: { toDataURL: async (url: string) => `data:qr,${url}` },
  toDataURL: async (url: string) => `data:qr,${url}`,
}));

import { letterHeightMmForLogMar } from "@/lib/acuity/logmar";
import type { Calibration } from "@/lib/calibration";
import { respondedState, type RunContext } from "@/lib/session/loopState";
import { createFakeServer, installBrowserGlobals, seededRandom } from "@/lib/session/fakeServer.testkit";

const CALIBRATION: Calibration = {
  cssPxPerMm: 4.176,
  cardWidthCssPx: 357.6,
  devicePixelRatio: 1.5,
  viewportWidthCssPx: 1280,
  viewportHeightCssPx: 585,
  screenWidthCssPx: 1280,
  screenHeightCssPx: 720,
  userAgent: "test",
  createdAtIso: "2026-11-01T11:00:00.000Z",
  method: "card-id1",
  verifications: [],
};

let seq = 1000;

function sendRatio(ratio: number | null): void {
  seq += 1;
  hoisted.broadcast!("distance", {
    seq,
    ratio,
    sizePx: ratio === null ? null : 91 / ratio,
    capturedAt: new Date().toISOString(),
    found: ratio !== null,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T12:00:00.000Z"));
  hoisted.server = createFakeServer();
  hoisted.nudges.length = 0;
  hoisted.broadcast = null;
  hoisted.oldJoinCalls = 0;
  seq = 1000;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type Controller = typeof import("./testController");

function measure(controller: Controller): void {
  const snap = controller.getSnapshot();
  const distanceMm = snap.movement?.letterDistanceMm ?? 3000;
  const heightDevicePx = Math.round(letterHeightMmForLogMar(snap.currentStepIndex! / 10, distanceMm) * 4.176 * 1.5);
  controller.handleCanvasMeasured({
    inkBounds: { left: 0, right: heightDevicePx, top: 0, bottom: heightDevicePx, widthPx: heightDevicePx, heightPx: heightDevicePx },
    strokeScanRowDevicePx: null,
    strokeScanPercentOfInkHeight: null,
    strokeRuns: [],
    strokeWidthDevicePx: null,
    canvasWidthDevicePx: heightDevicePx * 5,
    canvasHeightDevicePx: heightDevicePx,
  });
}

/** Advances in 250 ms steps, sending one reading per step. */
async function readingsFor(ms: number, ratio: number | null): Promise<void> {
  for (let elapsed = 0; elapsed < ms; elapsed += 250) {
    if (ratio !== null) {
      sendRatio(ratio);
    }
    await vi.advanceTimersByTimeAsync(250);
  }
}

function answer(controller: Controller, sessionId: string, n: number): void {
  const server = hoisted.server!;
  const state = server.sessions.get(sessionId)!.current_state as {
    trialIndex: number;
    presentationId: string;
    run: RunContext | null;
  };
  server.write(
    sessionId,
    "running",
    respondedState({
      trialIndex: state.trialIndex,
      presentationId: state.presentationId,
      responseId: `r-${n}`,
      responseKind: "letter",
      responseLetter: controller.getSnapshot().currentTarget,
      run: state.run,
    }),
  );
  hoisted.nudges[0]!();
}

function presentations() {
  return hoisted
    .server!.calls.filter(([name]) => name === "vcp_record_presentation")
    .map(([, args]) => (args as { p_presentation: Record<string, unknown> }).p_presentation);
}

function events(type: string) {
  return hoisted
    .server!.calls.filter(([name, args]) => name === "vcp_append_event" && (args as { p_type: string }).p_type === type)
    .map(([, args]) => (args as { p_payload: unknown }).p_payload);
}

describe("movement switch on: the main screen", () => {
  it("sizes each new letter for the measured distance, pauses on a move, resumes, and saves every reading", async () => {
    installBrowserGlobals("?movement=1", "/display/test");
    vi.spyOn(Math, "random").mockImplementation(seededRandom(7));
    const controller = await import("./testController");
    controller.setSetupProbe(() => ({
      validityOk: true,
      zoomState: "default",
      viewportWidthCssPx: 1280,
      viewportHeightCssPx: 585,
    }));
    const server = hoisted.server!;
    await controller.start({ distanceMm: 3000, confirmed: true }, CALIBRATION, "flanked-triplet", 1280, 585, "glasses");
    const sessionId = controller.getSnapshot().sessionId!;
    // The phone link carries the switch.
    expect(controller.getSnapshot().remoteUrl).toBe(`https://vision.example/remote?session=${sessionId}&movement=1`);
    expect(controller.getSnapshot().movement?.slot.sideDevicePx).toBe(624);
    expect(events("movement_enabled")).toHaveLength(1);
    controller.watchSession(sessionId);
    expect(hoisted.oldJoinCalls).toBe(0);

    // Tap, countdown; the baseline arrives during the countdown, readings at the mark.
    const row = server.sessions.get(sessionId)!;
    server.write(sessionId, "paired", { ...(row.current_state as object), positionConfirmed: true });
    hoisted.nudges[0]!();
    await vi.advanceTimersByTimeAsync(0);
    expect(controller.getSnapshot().phase).toBe("countdown");
    hoisted.broadcast!("distance_baseline", { baselinePx: 91, frames: 30 });
    await readingsFor(3000, 1);
    expect(events("movement_baseline_set")).toEqual([{ baseline_px: 91, frames: 30 }]);

    // First letter: at the mark, drawn and saved at 3000, beside the marker.
    let snap = controller.getSnapshot();
    expect(snap.phase).toBe("presenting");
    expect(snap.movement?.letterLayout).toBe("side-by-side");
    expect(snap.movement?.letterDistanceMm).toBe(3000);
    measure(controller);
    await vi.advanceTimersByTimeAsync(0);
    const first = presentations()[0]!;
    expect(first.distance_mm_requested).toBe(3000);
    expect(first.distance_mm_observed).toBe(3000);
    expect(first.requested_letter_height_mm).toBeCloseTo(letterHeightMmForLogMar((first.logmar_step_index as number) / 10, 3000), 10);

    // The person steps back 10 percent while the first letter is up: that letter keeps its size.
    await readingsFor(2500, 1.1);
    expect(controller.getSnapshot().movement?.letterDistanceMm).toBe(3000);
    answer(controller, sessionId, 1);
    await vi.advanceTimersByTimeAsync(0);

    // The next letter is drawn and saved at 3300 mm; the requested distance stays 3000.
    snap = controller.getSnapshot();
    expect(snap.phase).toBe("presenting");
    expect(snap.movement?.letterDistanceMm).toBeCloseTo(3300, 6);
    measure(controller);
    await vi.advanceTimersByTimeAsync(0);
    const second = presentations()[1]!;
    const step = (second.logmar_step_index as number) / 10;
    expect(second.distance_mm_requested).toBe(3000);
    expect(second.distance_mm_observed).toBeCloseTo(3300, 6);
    expect(second.requested_letter_height_mm).toBeCloseTo(letterHeightMmForLogMar(step, 3300), 10);
    expect(second.requested_letter_height_css_px).toBeCloseTo(letterHeightMmForLogMar(step, 3300) * 4.176, 10);
    const secondTrialIndex = second.trial_index;

    // Over the limit (40 percent further) while the second letter is up: voided, then the pause screen.
    await readingsFor(1500, 1.4);
    snap = controller.getSnapshot();
    expect(snap.phase).toBe("movement_hold");
    expect(snap.movement?.hold).toBe("paused-moved");
    const voided = events("trial_voided");
    expect(voided).toEqual([{ trial_index: secondTrialIndex, presentation_id: expect.any(String), reason: "moved" }]);
    expect(events("movement_paused")[0]).toMatchObject({ reason: "moved" });

    // Back at the mark: once the smoothed distance is good four readings in a row, a fresh letter at the same step.
    await readingsFor(3000, 1);
    snap = controller.getSnapshot();
    expect(events("movement_resumed")).toHaveLength(1);
    expect(snap.phase).toBe("presenting");
    expect(snap.currentStepIndex).toBe(second.logmar_step_index);
    expect(snap.movement?.letterDistanceMm).toBe(3000);

    // The phone stops seeing the marker: lost after 2000 ms, letter voided, pause screen.
    measure(controller);
    await vi.advanceTimersByTimeAsync(0);
    await readingsFor(2250, null);
    snap = controller.getSnapshot();
    expect(snap.phase).toBe("movement_hold");
    expect(snap.movement?.hold).toBe("paused-lost");
    expect(events("trial_voided").at(-1)).toMatchObject({ reason: "marker_lost" });
    await readingsFor(1500, 1);
    expect(controller.getSnapshot().phase).toBe("presenting");

    // Run to the end: 4 percent back (inside the deadband) for a while, then at the mark.
    for (let guard = 0; guard < 600 && controller.getSnapshot().phase !== "complete"; guard += 1) {
      const current = controller.getSnapshot();
      if (current.phase === "presenting") {
        measure(controller);
      } else if (current.phase === "awaiting_response") {
        answer(controller, sessionId, guard + 10);
      }
      await readingsFor(250, guard < 40 ? 1.04 : 1);
    }
    expect(controller.getSnapshot().phase).toBe("complete");

    // Every saved reading: marker-camera, raw = size, ratio, estimate, phone time; at most 50 a call;
    // all saved before the session was marked complete.
    const readingCalls = server.calls.filter(([name]) => name === "vcp_record_distance_readings");
    expect(readingCalls.length).toBeGreaterThan(5);
    const saved = readingCalls.flatMap(([, args]) => (args as { p_readings: Record<string, unknown>[] }).p_readings);
    for (const [, args] of readingCalls) {
      expect((args as { p_readings: unknown[] }).p_readings.length).toBeLessThanOrEqual(50);
    }
    expect(saved.length).toBe(seq - 1000);
    expect(saved[0]).toMatchObject({ method: "marker-camera", raw_value: 91, baseline_ratio: 1, absolute_mm: 3000, flagged: false });
    expect(saved.some((reading) => reading.flagged === true && reading.baseline_ratio === 1.4)).toBe(true);
    expect(saved.some((reading) => typeof reading.presentation_id === "string")).toBe(true);
    const completeIndex = server.calls.findIndex(
      ([name, args]) => name === "vcp_set_session_state" && (args as { p_status: string }).p_status === "complete",
    );
    const lastReadingsIndex = server.calls.map(([name]) => name).lastIndexOf("vcp_record_distance_readings");
    expect(lastReadingsIndex).toBeLessThan(completeIndex);

    // Inside the deadband the letters keep the confirmed distance but record the observed one.
    const kept = presentations().filter((p) => Math.abs((p.distance_mm_observed as number) - 3120) < 1e-6);
    expect(kept.length).toBeGreaterThan(0);
    for (const p of kept) {
      expect(p.requested_letter_height_mm).toBeCloseTo(letterHeightMmForLogMar((p.logmar_step_index as number) / 10, 3000), 10);
    }

    // Quality row: observed min and max across scored letters. The 3300 mm letter was voided by the
    // pause, so it does not count: 3000 at the mark, 3120 inside the deadband.
    const quality = server.calls.find(([name]) => name === "vcp_upsert_test_quality")![1] as {
      p_quality: Record<string, unknown>;
    };
    expect(quality.p_quality.distance_observed_min_mm).toBe(3000);
    expect(quality.p_quality.distance_observed_max_mm).toBeCloseTo(3120, 6);
    controller.dispose();
  });
});

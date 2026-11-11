/**
 * Movement switch OFF, main screen. Runs a whole letter test through the real
 * controller, session store and RPC wrappers against an in-memory server,
 * with the address holding no movement=1. The expected strings were produced
 * by this same run on the controller as it stood before movement detection
 * was wired in (commit 56d1a76) and are pasted here as literals.
 */
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  server: null as null | import("@/lib/session/fakeServer.testkit").FakeServer,
  nudges: [] as (() => void)[],
  sentNudges: [] as string[],
  channelCalls: [] as string[],
  loaded: [] as string[],
}));

function moduleLoaded(name: string): Record<string, never> {
  hoisted.loaded.push(name);
  return {};
}

/** Every movement module except the switch and its constants. With the switch off none may load. */
vi.mock("@/lib/movement", () => moduleLoaded("lib/movement/index"));
vi.mock("@/lib/movement/decide", () => moduleLoaded("lib/movement/decide"));
vi.mock("@/lib/movement/movementState", () => moduleLoaded("lib/movement/movementState"));
vi.mock("@/lib/movement/broadcast", () => moduleLoaded("lib/movement/broadcast"));
vi.mock("@/lib/movement/markerSlot", () => moduleLoaded("lib/movement/markerSlot"));
vi.mock("@/lib/movement/readingBatches", () => moduleLoaded("lib/movement/readingBatches"));
vi.mock("@/lib/movement/phoneTracking", () => moduleLoaded("lib/movement/phoneTracking"));
vi.mock("@/lib/movement/wording", () => moduleLoaded("lib/movement/wording"));
vi.mock("@/lib/movement/vision/markers", () => moduleLoaded("lib/movement/vision/markers"));
vi.mock("@/lib/movement/vision/markerCells", () => moduleLoaded("lib/movement/vision/markerCells"));
vi.mock("@/lib/movement/vision/refine", () => moduleLoaded("lib/movement/vision/refine"));
vi.mock("@/lib/movement/vision/crop", () => moduleLoaded("lib/movement/vision/crop"));
vi.mock("js-aruco2", () => moduleLoaded("js-aruco2"));
vi.mock("@/lib/db/distanceReadings", () => moduleLoaded("lib/db/distanceReadings"));
vi.mock("./movement/displayMovement", () => moduleLoaded("display/test/movement/displayMovement"));
vi.mock("./movement/MovementScreens", () => moduleLoaded("display/test/movement/MovementScreens"));

vi.mock("@/lib/db/client", () => ({
  getSupabaseBrowserClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => hoisted.server!.rpc(name, args),
  }),
}));

vi.mock("@/lib/session/channel", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const wrapped: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(actual)) {
    wrapped[name] =
      typeof value === "function"
        ? () => {
            hoisted.channelCalls.push(name);
            throw new Error(`channel.${name} must not be called with movement off`);
          }
        : value;
  }
  wrapped.joinSessionChannel = (_sessionId: string, onNudge: () => void) => {
    hoisted.channelCalls.push("joinSessionChannel");
    hoisted.nudges.push(onNudge);
    return {
      sendNudge: async (kind: string) => {
        hoisted.sentNudges.push(kind);
        return true;
      },
      leave: () => undefined,
    };
  };
  return wrapped;
});

vi.mock("qrcode", () => ({
  default: { toDataURL: async (url: string) => `data:qr,${url}` },
  toDataURL: async (url: string) => `data:qr,${url}`,
}));

import { letterHeightMmForLogMar } from "@/lib/acuity/logmar";
import type { Calibration } from "@/lib/calibration";
import { respondedState, type RunContext } from "@/lib/session/loopState";
import {
  createFakeServer,
  installBrowserGlobals,
  seededRandom,
} from "@/lib/session/fakeServer.testkit";

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

/** Captured from the run below on the pre-movement controller. */
const CAPTURED = {
  firstPresentation:
    '{"trial_index":0,"eye":"both","logmar_step_index":3,"requested_letter_height_mm":8.70602782201946,"requested_stroke_width_mm":1.741205564403892,"requested_letter_height_css_px":36.35637218475326,"requested_letter_height_device_px":54.53455827712989,"optotypes":["H","D","R"],"target_index":1,"format":"flanked-triplet","distance_mm_requested":3000,"actual_letter_height_device_px":55,"rendered_at":"2026-11-01T12:00:03.000Z","visibility_confirmed":true,"crowding_spec":{"spacing_letter_widths":1,"spacing_basis":"edge-to-edge","arrow":"above-target","flanker_rule":"random-distinct","arrow_height_css_px":36.35637218475326,"arrow_gap_css_px":36.35637218475326}}',
  secondPresentation:
    '{"trial_index":1,"eye":"both","logmar_step_index":3,"requested_letter_height_mm":8.70602782201946,"requested_stroke_width_mm":1.741205564403892,"requested_letter_height_css_px":36.35637218475326,"requested_letter_height_device_px":54.53455827712989,"optotypes":["K","N","S"],"target_index":1,"format":"flanked-triplet","distance_mm_requested":3000,"actual_letter_height_device_px":55,"rendered_at":"2026-11-01T12:00:03.000Z","visibility_confirmed":true,"crowding_spec":{"spacing_letter_widths":1,"spacing_basis":"edge-to-edge","arrow":"above-target","flanker_rule":"random-distinct","arrow_height_css_px":36.35637218475326,"arrow_gap_css_px":36.35637218475326}}',
  quality:
    '{"distance_requested_mm":3000,"distance_recommended_mm":3000,"distance_chosen_mm":3000,"renderable_finest_logmar":-0.1,"renderable_coarsest_logmar":1,"finest_limited_by":"requested-bound","coarsest_limited_by":"requested-bound","screen_limited":false,"bounded_result_reason":"test-floor","not_sure_count":6,"interruptions":0,"final_logmar_step_index":-1,"final_snellen_label":"6/5"}',
  presentationCount: 25,
  callCount: 137,
  callLogSha256: "83d28da2c7bc06f383ab37f384c7c95c1f671c1f81d8ace1d7cbf82d2ffd4f35",
};

async function flush(): Promise<void> {
  await vi.advanceTimersByTimeAsync(0);
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-01T12:00:00.000Z"));
  hoisted.server = createFakeServer();
  hoisted.nudges.length = 0;
  hoisted.sentNudges.length = 0;
  hoisted.channelCalls.length = 0;
  hoisted.loaded.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function runWholeTest(search: string) {
  installBrowserGlobals(search, "/display/test");
  vi.spyOn(Math, "random").mockImplementation(seededRandom(20261111));
  const controller = await import("./testController");
  controller.setSetupProbe(() => ({
    validityOk: true,
    zoomState: "default",
    viewportWidthCssPx: 1280,
    viewportHeightCssPx: 585,
  }));
  const server = hoisted.server!;

  await controller.start(
    { distanceMm: 3000, confirmed: true },
    CALIBRATION,
    "flanked-triplet",
    1280,
    585,
    "glasses",
  );
  const sessionId = controller.getSnapshot().sessionId!;
  controller.watchSession(sessionId);

  // The phone pairs and taps "I'm at my mark".
  const row = server.sessions.get(sessionId)!;
  server.write(sessionId, "paired", { ...(row.current_state as object), positionConfirmed: true });
  hoisted.nudges[0]!();
  await flush();
  await vi.advanceTimersByTimeAsync(3000);
  await flush();

  let letters = 0;
  for (let guard = 0; guard < 400 && controller.getSnapshot().phase !== "complete"; guard += 1) {
    const snap = controller.getSnapshot();
    if (snap.phase === "presenting") {
      const heightDevicePx = Math.round(
        letterHeightMmForLogMar(snap.currentStepIndex! / 10, 3000) * 4.176 * 1.5,
      );
      controller.handleCanvasMeasured({
        inkBounds: { left: 0, right: heightDevicePx, top: 0, bottom: heightDevicePx, widthPx: heightDevicePx, heightPx: heightDevicePx },
        strokeScanRowDevicePx: null,
        strokeScanPercentOfInkHeight: null,
        strokeRuns: [],
        strokeWidthDevicePx: snap.currentTarget === "H" ? Math.round(heightDevicePx / 5) : null,
        canvasWidthDevicePx: heightDevicePx * 5,
        canvasHeightDevicePx: heightDevicePx,
      });
      await flush();
      continue;
    }
    if (snap.phase === "awaiting_response") {
      const state = server.sessions.get(sessionId)!.current_state as {
        trialIndex: number;
        presentationId: string;
        run: RunContext | null;
      };
      letters += 1;
      const wrong = letters % 4 === 0;
      server.write(
        sessionId,
        "running",
        respondedState({
          trialIndex: state.trialIndex,
          presentationId: state.presentationId,
          responseId: `r-${letters}`,
          responseKind: wrong ? "not_sure" : "letter",
          responseLetter: wrong ? null : snap.currentTarget,
          run: state.run,
        }),
      );
      hoisted.nudges[0]!();
      await flush();
      continue;
    }
    await vi.advanceTimersByTimeAsync(100);
  }
  const finalPhase = controller.getSnapshot().phase;
  controller.dispose();
  return { server, finalPhase };
}

describe("movement switch off: the main screen", () => {
  it("runs a whole letter test and saves exactly what it saved before movement detection", async () => {
    const { server, finalPhase } = await runWholeTest("");
    expect(finalPhase).toBe("complete");

    const presentations = server.calls
      .filter(([name]) => name === "vcp_record_presentation")
      .map(([, args]) => JSON.stringify((args as { p_presentation: unknown }).p_presentation));
    const quality = server.calls
      .filter(([name]) => name === "vcp_upsert_test_quality")
      .map(([, args]) => JSON.stringify((args as { p_quality: unknown }).p_quality));
    const callLog = JSON.stringify(server.calls);
    const actual = {
      firstPresentation: presentations[0],
      secondPresentation: presentations[1],
      quality: quality[0],
      presentationCount: presentations.length,
      callCount: server.calls.length,
      callLogSha256: createHash("sha256").update(callLog).digest("hex"),
    };
    if (process.env.VCP_PRINT_CAPTURE === "1") {
      console.log(JSON.stringify(actual, null, 1));
    }
    expect(actual).toEqual(CAPTURED);
    // Nothing movement-related reaches the database.
    expect(callLog).not.toContain("distance_readings");
    expect(callLog).not.toContain("movement_");
    expect(callLog).not.toContain("distance_mm_observed");
    expect(callLog).not.toContain("distance_observed_");
    // Only the existing channel function was used.
    expect([...new Set(hoisted.channelCalls)]).toEqual(["joinSessionChannel"]);
    // No movement, camera, marker or readings module was ever loaded.
    expect(hoisted.loaded).toEqual([]);
    expect(hoisted.sentNudges).not.toContain("distance");
  });
});

/**
 * Movement switch OFF, phone. Runs pairing, the "I'm at my mark" tap, three
 * answers and the hand-over to the next test through the real phone
 * controller, session store and RPC wrappers against an in-memory server,
 * with the phone address holding no movement=1. The expected values were
 * produced by this same run on the phone controller as it stood before
 * movement detection was wired in (commit 56d1a76) and are pasted as literals.
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
vi.mock("./movement/phoneMovement", () => moduleLoaded("remote/movement/phoneMovement"));
vi.mock("./movement/markerCamera", () => moduleLoaded("remote/movement/markerCamera"));

vi.mock("@/lib/db/client", () => ({
  getSupabaseBrowserClient: () => ({
    rpc: (name: string, args: Record<string, unknown>) => hoisted.server!.rpc(name, args),
  }),
}));

vi.mock("@/lib/session/clientRequestId", () => ({
  newClientRequestId: () => "11111111-2222-4333-8444-555555555555",
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

import { awaitingResponseState, completeState, readyState, type RunContext } from "@/lib/session/loopState";
import { createFakeServer, installBrowserGlobals } from "@/lib/session/fakeServer.testkit";

const SESSION_ID = "0d7c3f9e-1b2a-4c3d-8e4f-5a6b7c8d9e0f";
const NEXT_SESSION_ID = "1d7c3f9e-1b2a-4c3d-8e4f-5a6b7c8d9e0f";
const RUN: RunContext = {
  correction: "glasses",
  stepIndices: [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  finestLimitedBy: "requested-bound",
  coarsestLimitedBy: "requested-bound",
  voidedTrialIndices: [],
};

/** Captured from the run below on the pre-movement phone controller. */
const CAPTURED = {
  phases: "loading,connect,go_to_mark,at_mark,choosing,sent,choosing,sent,choosing,sent,complete",
  callCount: 17,
  callLogSha256: "3c2f151a7113605b1ecf9ca61b5a577296933bbae36ba7b2ec89facb797cae76",
  replacedTo: "/remote?session=1d7c3f9e-1b2a-4c3d-8e4f-5a6b7c8d9e0f",
  sentNudges: "paired,responded,responded,responded",
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
});

describe("movement switch off: the phone", () => {
  it("pairs, taps at the mark, answers and follows the next test exactly as before", async () => {
    const globals = installBrowserGlobals(`?session=${SESSION_ID}`, "/remote");
    const server = hoisted.server!;
    server.sessions.set(SESSION_ID, {
      id: SESSION_ID,
      status: "created",
      version: 3,
      current_state: readyState(RUN),
      distance_mm_requested: 3000,
    });
    const phone = await import("./remoteController");
    const phases: string[] = [];
    const unsubscribe = phone.subscribe(() => {
      const phase = phone.getSnapshot().phase;
      if (phases[phases.length - 1] !== phase) {
        phases.push(phase);
      }
    });

    await phone.bootstrap(SESSION_ID);
    phone.watchRemote(SESSION_ID);
    await flush();
    expect(phone.getSnapshot().phase).toBe("go_to_mark");

    await phone.confirmPosition();
    await flush();

    const letters = ["D", "K", "N"] as const;
    for (let trial = 0; trial < letters.length; trial += 1) {
      server.write(
        SESSION_ID,
        "running",
        awaitingResponseState({
          trialIndex: trial,
          presentationId: `00000000-0000-4000-8000-0000000001${trial}0`,
          choices: ["C", "D", "H", "K", "N"],
          run: RUN,
        }),
      );
      hoisted.nudges[0]!();
      await flush();
      await phone.answer({ kind: "letter", letter: letters[trial]! });
      await flush();
    }

    server.write(
      SESSION_ID,
      "complete",
      completeState(3, { run: RUN, result: { kind: "measured", stepIndex: 2 }, nextSessionId: NEXT_SESSION_ID }),
    );
    hoisted.nudges[0]!();
    await flush();
    unsubscribe();
    phone.disposeRemote();

    const callLog = JSON.stringify(server.calls);
    const actual = {
      phases: phases.join(","),
      callCount: server.calls.length,
      callLogSha256: createHash("sha256").update(callLog).digest("hex"),
      replacedTo: globals.replacedTo.join(","),
      sentNudges: hoisted.sentNudges.join(","),
    };
    if (process.env.VCP_PRINT_CAPTURE === "1") {
      console.log(JSON.stringify(actual, null, 1));
    }
    expect(actual).toEqual(CAPTURED);
    expect(callLog).not.toContain("distance");
    expect([...new Set(hoisted.channelCalls)]).toEqual(["joinSessionChannel"]);
    // No movement, camera, marker or readings module was ever loaded.
    expect(hoisted.loaded).toEqual([]);
    // No camera was asked for: there is no navigator.mediaDevices in this run at all.
    expect((globalThis as { navigator?: { mediaDevices?: unknown } }).navigator?.mediaDevices).toBeUndefined();
  });
});

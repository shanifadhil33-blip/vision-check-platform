import { describe, expect, it } from "vitest";
import {
  BASELINE_WAIT_MAX_MS,
  CHECK_MAX_MS,
  createDisplayMovement,
  type DisplayMovementDeps,
  type LetterPlan,
} from "./displayMovement";

type Recorded = { events: [string, unknown][]; pauses: string[]; resumes: number; saved: unknown[][] };

function harness(options: { failSave?: boolean } = {}) {
  let nowMs = 0;
  let seq = 0;
  const recorded: Recorded = { events: [], pauses: [], resumes: 0, saved: [] };
  const deps: DisplayMovementDeps = {
    nowMs: () => nowMs,
    setInterval: () => 0,
    clearInterval: () => undefined,
    joinChannel: () => {
      throw new Error("not used");
    },
    recordReadings: async (_sessionId, batch) => {
      recorded.saved.push([...batch]);
      return options.failSave
        ? { ok: false, error: { kind: "network", code: null, httpStatus: null, message: "offline", retryable: true } }
        : { ok: true, data: batch.length };
    },
  };
  const movement = createDisplayMovement({
    sessionId: "s-1",
    confirmedDistanceMm: 3000,
    cssPxPerMm: 4.176,
    devicePixelRatio: 1.5,
    viewportWidthCssPx: 1280,
    viewportHeightCssPx: 585,
    format: "flanked-triplet",
    initialStepIndex: 9,
    hooks: {
      appendEvent: (type, payload) => recorded.events.push([type, payload]),
      pauseLetter: (reason) => recorded.pauses.push(reason),
      resume: () => {
        recorded.resumes += 1;
      },
      viewChanged: () => undefined,
    },
    deps,
  });
  return {
    movement,
    recorded,
    advance(ms: number) {
      for (let step = 0; step < ms; step += 250) {
        nowMs += 250;
        movement.tick();
      }
    },
    reading(ratio: number) {
      seq += 1;
      movement.receive("distance", {
        seq,
        ratio,
        sizePx: 91 / ratio,
        capturedAt: new Date(Date.UTC(2026, 10, 11) + nowMs).toISOString(),
        found: true,
      });
    },
    readingsFor(ms: number, ratio: number) {
      for (let step = 0; step < ms; step += 250) {
        this.reading(ratio);
        nowMs += 250;
        movement.tick();
      }
    },
  };
}

function shown(plan: LetterPlan): Extract<LetterPlan, { kind: "show" }> {
  if (plan.kind !== "show") {
    throw new Error(`expected show, got ${JSON.stringify(plan)}`);
  }
  return plan;
}

describe("main screen movement: waiting for the baseline", () => {
  it("holds on the waiting screen, then checks for fresh readings once the baseline comes", () => {
    const h = harness();
    expect(h.movement.planLetter(9)).toEqual({ kind: "hold", screen: "waiting" });
    h.movement.receive("distance_baseline", { baselinePx: 91, frames: 30 });
    expect(h.movement.view()?.hold).toBe("check");
    h.reading(1);
    h.reading(1);
    expect(h.recorded.resumes).toBe(0);
    h.reading(1);
    expect(h.recorded.resumes).toBe(1);
    expect(shown(h.movement.planLetter(9)).effectiveDistanceMm).toBe(3000);
  });

  it("gives up after 30 s without a baseline and carries on without movement detection", () => {
    const h = harness();
    h.movement.planLetter(9);
    h.advance(BASELINE_WAIT_MAX_MS - 250);
    expect(h.recorded.resumes).toBe(0);
    h.advance(250);
    expect(h.recorded.resumes).toBe(1);
    expect(h.recorded.events).toContainEqual(["movement_unavailable", { reason: "no_baseline", source: "main" }]);
    expect(h.movement.planLetter(9)).toEqual({ kind: "plain" });
    expect(h.movement.view()).toBeNull();
  });

  it("the phone's unavailable notice ends the wait at once", () => {
    const h = harness();
    h.movement.planLetter(9);
    h.movement.receive("distance_unavailable", { reason: "camera_refused" });
    expect(h.recorded.resumes).toBe(1);
    expect(h.movement.planLetter(9)).toEqual({ kind: "plain" });
  });
});

describe("main screen movement: between letters", () => {
  it("3 m 6/60 hides the marker; the lost rule waits; the next letter waits for a check", () => {
    const h = harness();
    h.movement.receive("distance_baseline", { baselinePx: 91, frames: 30 });
    h.readingsFor(1000, 1);
    const plan = shown(h.movement.planLetter(10));
    expect(plan.layout).toBe("between-letters");
    h.movement.letterShown(plan);
    // Five seconds with the marker hidden: no pause.
    h.advance(5000);
    expect(h.recorded.pauses).toEqual([]);
    h.movement.letterEnded();
    // Check screen: 3 fresh readings end it.
    expect(h.movement.planLetter(10)).toEqual({ kind: "hold", screen: "check" });
    h.reading(1);
    h.reading(1);
    h.reading(1);
    expect(h.recorded.resumes).toBe(1);
    expect(shown(h.movement.planLetter(10)).effectiveDistanceMm).toBe(3000);
  });

  it("a check with no readings ends after 3000 ms, and the next letter then pauses as lost", () => {
    const h = harness();
    h.movement.receive("distance_baseline", { baselinePx: 91, frames: 30 });
    h.readingsFor(1000, 1);
    h.movement.letterShown(shown(h.movement.planLetter(10)));
    h.advance(4000);
    h.movement.letterEnded();
    expect(h.movement.planLetter(10)).toEqual({ kind: "hold", screen: "check" });
    h.advance(CHECK_MAX_MS - 250);
    expect(h.recorded.resumes).toBe(0);
    h.advance(250);
    expect(h.recorded.resumes).toBe(1);
    expect(h.movement.planLetter(10)).toEqual({ kind: "hold", screen: "paused-lost" });
    expect(h.recorded.events.at(-1)).toEqual(["movement_paused", { reason: "marker_lost", smoothed_mm: null, fraction: null }]);
  });

  it("2 m would be side by side: same marker, letter beside it", () => {
    const h = harness();
    h.movement.receive("distance_baseline", { baselinePx: 91, frames: 30 });
    h.readingsFor(1000, 1);
    expect(shown(h.movement.planLetter(9)).layout).toBe("side-by-side");
  });
});

describe("main screen movement: saving", () => {
  it("every reading after the baseline is queued with its letter and flushed; a failed save logs one client_error", async () => {
    const h = harness({ failSave: true });
    h.reading(1);
    h.movement.receive("distance_baseline", { baselinePx: 91, frames: 30 });
    h.readingsFor(1000, 1);
    const plan = shown(h.movement.planLetter(9));
    h.movement.letterShown(plan);
    h.movement.letterRecorded("p-1");
    h.readingsFor(500, 1.02);
    await h.movement.flush();
    // The reading before the baseline is not saved: there is nothing to compare it with.
    expect(h.recorded.saved).toHaveLength(1);
    const batch = h.recorded.saved[0] as { presentationId?: string; baselineRatio: number; absoluteMm: number }[];
    expect(batch).toHaveLength(6);
    expect(batch[0]).toMatchObject({ method: "marker-camera", rawValue: 91, baselineRatio: 1, absoluteMm: 3000, flagged: false });
    expect(batch[0]!.presentationId).toBeUndefined();
    expect(batch[5]).toMatchObject({ baselineRatio: 1.02, presentationId: "p-1" });
    expect(batch[5]!.absoluteMm).toBeCloseTo(3060, 9);
    expect(h.recorded.events.filter(([type]) => type === "client_error")).toEqual([
      ["client_error", { reason: "distance_readings_failed", message: "offline", dropped: 6 }],
    ]);
    // Nothing is kept for a retry: the next flush sends nothing.
    await h.movement.flush();
    expect(h.recorded.saved).toHaveLength(1);
  });
});

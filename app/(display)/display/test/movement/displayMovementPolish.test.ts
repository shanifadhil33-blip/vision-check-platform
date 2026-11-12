import { describe, expect, it } from "vitest";
import {
  CHECK_MAX_MS,
  createDisplayMovement,
  type DisplayMovementDeps,
  type HoldScreen,
  type LetterPlan,
} from "./displayMovement";

/**
 * Like the controller: a resume puts up the next letter by calling planLetter
 * after the current tick has finished (the controller queues it).
 */
function harness() {
  let nowMs = 0;
  let seq = 0;
  let resumePending = false;
  const events: [string, unknown][] = [];
  const pauses: string[] = [];
  const plans: LetterPlan[] = [];
  const holds: (HoldScreen | null)[] = [];
  const broadcasts: [string, Record<string, unknown>][] = [];
  let resumes = 0;
  const deps: DisplayMovementDeps = {
    nowMs: () => nowMs,
    setInterval: () => 0,
    clearInterval: () => undefined,
    joinChannel: () => ({
      sendNudge: async () => true,
      sendBroadcast: async (event, payload) => {
        broadcasts.push([event, payload]);
        return true;
      },
      leave: () => undefined,
    }),
    recordReadings: async (_sessionId, batch) => ({ ok: true, data: batch.length }),
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
      appendEvent: (type, payload) => events.push([type, payload]),
      pauseLetter: (reason) => pauses.push(reason),
      resume: () => {
        resumes += 1;
        resumePending = true;
      },
      viewChanged: (view) => {
        if (holds.at(-1) !== (view?.hold ?? null)) {
          holds.push(view?.hold ?? null);
        }
      },
    },
    deps,
  });
  movement.joinChannel("s-1", () => undefined);
  function afterWork(): void {
    if (resumePending) {
      resumePending = false;
      plans.push(movement.planLetter(9));
    }
  }
  return {
    movement,
    events,
    pauses,
    plans,
    holds,
    broadcasts,
    resumes: () => resumes,
    paused: () => events.filter(([type]) => type === "movement_paused"),
    visibility: () => broadcasts.filter(([event]) => event === "marker_visibility").map(([, payload]) => payload),
    advance(ms: number) {
      for (let step = 0; step < ms; step += 250) {
        nowMs += 250;
        movement.tick();
        afterWork();
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
      afterWork();
    },
    readingsFor(ms: number, ratio: number) {
      for (let step = 0; step < ms; step += 250) {
        this.reading(ratio);
        nowMs += 250;
        movement.tick();
        afterWork();
      }
    },
  };
}

function shown(plan: LetterPlan | undefined): Extract<LetterPlan, { kind: "show" }> {
  if (plan === undefined || plan.kind !== "show") {
    throw new Error(`expected show, got ${JSON.stringify(plan)}`);
  }
  return plan;
}

describe("main screen movement: the check after the baseline cannot repeat forever", () => {
  it("baseline, then no reading for 3000 ms: paused-lost once, and no further check", () => {
    const h = harness();
    expect(h.movement.planLetter(9)).toEqual({ kind: "hold", screen: "waiting" });
    h.movement.receive("distance_baseline", { baselinePx: 91, frames: 30 });
    expect(h.movement.view()?.hold).toBe("check");
    h.advance(CHECK_MAX_MS);
    expect(h.resumes()).toBe(1);
    expect(h.plans).toEqual([{ kind: "hold", screen: "paused-lost" }]);
    expect(h.movement.view()?.hold).toBe("paused-lost");
    expect(h.paused()).toEqual([["movement_paused", { reason: "marker_lost", smoothed_mm: null, fraction: null }]]);
    // Not looping: a long silence keeps the same screen, with no new check, resume or event.
    h.advance(20_000);
    expect(h.resumes()).toBe(1);
    expect(h.plans).toHaveLength(1);
    expect(h.paused()).toHaveLength(1);
    expect(h.holds).toEqual(["waiting", "check", null, "paused-lost"]);
  });

  it("then 4 good readings: movement_resumed and a letter is shown", () => {
    const h = harness();
    h.movement.planLetter(9);
    h.movement.receive("distance_baseline", { baselinePx: 91, frames: 30 });
    h.advance(CHECK_MAX_MS);
    expect(h.movement.view()?.hold).toBe("paused-lost");
    h.reading(1);
    h.reading(1);
    h.reading(1);
    expect(h.events.filter(([type]) => type === "movement_resumed")).toHaveLength(0);
    h.reading(1);
    expect(h.events.filter(([type]) => type === "movement_resumed")).toHaveLength(1);
    expect(h.resumes()).toBe(2);
    expect(shown(h.plans.at(-1)).effectiveDistanceMm).toBe(3000);
  });

  it("a reading before the timeout: the check still ends at 3000 ms and the next letter is shown", () => {
    const h = harness();
    h.movement.planLetter(9);
    h.movement.receive("distance_baseline", { baselinePx: 91, frames: 30 });
    h.advance(2000);
    h.reading(1);
    h.advance(CHECK_MAX_MS - 2000 - 250);
    expect(h.resumes()).toBe(0);
    h.advance(250);
    expect(h.resumes()).toBe(1);
    expect(shown(h.plans.at(-1)).effectiveDistanceMm).toBe(3000);
    expect(h.paused()).toEqual([]);
  });
});

describe("main screen movement: marker_visibility to the phone", () => {
  function betweenLetters() {
    const h = harness();
    h.movement.receive("distance_baseline", { baselinePx: 91, frames: 30 });
    h.readingsFor(1000, 1);
    const plan = shown(h.movement.planLetter(10));
    expect(plan.layout).toBe("between-letters");
    return { h, plan };
  }

  it("a between-letters letter shown: visible false; a side-by-side letter sends nothing", () => {
    const side = harness();
    side.movement.receive("distance_baseline", { baselinePx: 91, frames: 30 });
    side.readingsFor(1000, 1);
    const sidePlan = shown(side.movement.planLetter(9));
    expect(sidePlan.layout).toBe("side-by-side");
    side.movement.letterShown(sidePlan);
    expect(side.visibility()).toEqual([]);

    const { h, plan } = betweenLetters();
    expect(h.visibility()).toEqual([]);
    h.movement.letterShown(plan);
    expect(h.visibility()).toEqual([{ visible: false, seq: 1000 }]);
  });

  it("that letter ends: visible true, with a higher seq", () => {
    const { h, plan } = betweenLetters();
    h.movement.letterShown(plan);
    h.advance(1000);
    h.movement.letterEnded();
    expect(h.visibility()).toEqual([
      { visible: false, seq: 1000 },
      { visible: true, seq: 1001 },
    ]);
  });

  it("a hold starts while it is still up (the controller voided it): visible true", () => {
    const { h, plan } = betweenLetters();
    h.movement.letterShown(plan);
    // A void by the controller (hidden page) calls no letterEnded: the next plan starts the check.
    expect(h.movement.planLetter(10)).toEqual({ kind: "hold", screen: "check" });
    expect(h.visibility()).toEqual([
      { visible: false, seq: 1000 },
      { visible: true, seq: 1001 },
    ]);
  });

  it("voided by a movement pause: visible true", () => {
    const { h, plan } = betweenLetters();
    h.movement.letterShown(plan);
    for (let i = 0; i < 5; i += 1) {
      h.reading(1.5);
    }
    expect(h.pauses).toEqual(["moved"]);
    expect(h.visibility()).toEqual([
      { visible: false, seq: 1000 },
      { visible: true, seq: 1001 },
    ]);
  });

  it("detection stopped while it is up: visible true", () => {
    const { h, plan } = betweenLetters();
    h.movement.letterShown(plan);
    h.movement.stop();
    expect(h.visibility()).toEqual([
      { visible: false, seq: 1000 },
      { visible: true, seq: 1001 },
    ]);
  });
});

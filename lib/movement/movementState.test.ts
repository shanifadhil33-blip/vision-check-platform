import { describe, expect, it } from "vitest";
import type { ScreenGeometry } from "./decide";
import {
  initialMovementState,
  type MovementContext,
  type MovementState,
  onClockTick,
  onDistanceReading,
  planNextLetter,
} from "./movementState";

const LAPTOP: ScreenGeometry = {
  pixelPitchMm: 1 / (4.176 * 1.5),
  cssPxPerMm: 4.176,
  viewportWidthCssPx: 1280,
  viewportHeightCssPx: 585,
  format: "flanked-triplet",
};

function context(letterOnScreen: boolean): MovementContext {
  return { confirmedDistanceMm: 3000, stepIndex: 10, screen: LAPTOP, letterOnScreen };
}

function feed(state: MovementState, estimatesMm: number[], letterOnScreen: boolean, startMs = 0) {
  let current = state;
  const actions = [];
  for (let i = 0; i < estimatesMm.length; i += 1) {
    const result = onDistanceReading(
      current,
      { estimateMm: estimatesMm[i]!, atMs: startMs + i * 100 },
      context(letterOnScreen),
    );
    current = result.state;
    actions.push(result.action);
  }
  return { state: current, actions };
}

describe("marker lost", () => {
  it("last reading at 0 ms: still tracking at 1499 ms, paused lost at 1500 ms", () => {
    const { state } = feed(initialMovementState(), [3000], false);
    expect(state.lastReadingAtMs).toBe(0);

    const at1499 = onClockTick(state, 1499, context(false));
    expect(at1499.action).toEqual({ kind: "none" });
    expect(at1499.state.phase).toBe("tracking");

    const at1500 = onClockTick(state, 1500, context(false));
    expect(at1500.action).toEqual({ kind: "pause", reason: "lost", voidLetter: false });
    expect(at1500.state.phase).toBe("paused-lost");
  });
});

describe("resume", () => {
  it("from a pause, 2 good readings stay paused and the 3rd resumes", () => {
    const paused: MovementState = {
      phase: "paused-moved",
      estimatesMm: [],
      lastReadingAtMs: null,
      goodReadingsInRow: 0,
    };
    const two = feed(paused, [3010, 3010], false);
    expect(two.state.phase).toBe("paused-moved");
    expect(two.actions).toEqual([{ kind: "none" }, { kind: "none" }]);

    const three = onDistanceReading(two.state, { estimateMm: 3010, atMs: 200 }, context(false));
    expect(three.action).toEqual({ kind: "resume" });
    expect(three.state.phase).toBe("tracking");
  });

  it("a reading that would pause resets the count", () => {
    // Two good readings already counted. The next 4000 makes the median of
    // [4000, 4000, 3010, 3010, 4000] = 4000, which would pause: the count goes to 0.
    const almost: MovementState = {
      phase: "paused-moved",
      estimatesMm: [4000, 4000, 3010, 3010],
      lastReadingAtMs: 0,
      goodReadingsInRow: 2,
    };
    const bad = onDistanceReading(almost, { estimateMm: 4000, atMs: 100 }, context(false));
    expect(bad.action).toEqual({ kind: "none" });
    expect(bad.state.goodReadingsInRow).toBe(0);
    // Median of [4000, 3010, 3010, 4000, 3010] = 3010 is good again, but only 1 in a row.
    const good = onDistanceReading(bad.state, { estimateMm: 3010, atMs: 200 }, context(false));
    expect(good.action).toEqual({ kind: "none" });
    expect(good.state).toMatchObject({ phase: "paused-moved", goodReadingsInRow: 1 });
  });
});

describe("during a letter", () => {
  it("a move beyond the limit voids the letter on screen and pauses", () => {
    // Median of the last five turns to 4000 (f 0.333) on the third 4000.
    const { actions, state } = feed(initialMovementState(), [3000, 3000, 3000, 4000, 4000, 4000], true);
    expect(actions.slice(0, 5).every((action) => action.kind === "none")).toBe(true);
    expect(actions[5]).toEqual({ kind: "pause", reason: "moved", voidLetter: true });
    expect(state.phase).toBe("paused-moved");
  });

  it("a small move changes nothing now; the next letter is resized", () => {
    const { actions, state } = feed(initialMovementState(), [3000, 3000, 3150, 3150, 3150], true);
    expect(actions.every((action) => action.kind === "none")).toBe(true);
    expect(state.phase).toBe("tracking");

    const next = planNextLetter(state, 450, context(false));
    expect(next.kind).toBe("show");
    expect(next.kind === "show" && next.effectiveDistanceMm).toBe(3150);
    expect(next.kind === "show" && next.letterHeightMm).toBeCloseTo(45.8152, 4);
  });

  it("no letter is planned while paused", () => {
    const paused: MovementState = {
      phase: "paused-lost",
      estimatesMm: [3000],
      lastReadingAtMs: 0,
      goodReadingsInRow: 0,
    };
    expect(planNextLetter(paused, 10, context(false))).toEqual({ kind: "pause", reason: "lost" });
  });
});

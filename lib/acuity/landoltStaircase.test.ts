import { describe, expect, it } from "vitest";
import {
  C_MAX_SCORED,
  LANDOLT_DIRECTIONS,
  isDirectionCorrect,
  outcomeFor,
  passCountAt,
  pickDirection,
  recordCTrial,
  startCStaircase,
  type CRunning,
  type CStaircaseState,
  type CTrialOutcome,
  type LandoltAnswer,
  type LandoltDirection,
} from "./landoltStaircase";

const FULL = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const ONE_TO_TEN = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const MINUS_ONE_TO_SEVEN = [-1, 0, 1, 2, 3, 4, 5, 6, 7];

const C: CTrialOutcome = "correct";
const W: CTrialOutcome = "incorrect";
const N: CTrialOutcome = "not_sure";
const V: CTrialOutcome = "void";

/** Pass with four straight correct. */
const P: readonly CTrialOutcome[] = [C, C, C, C];
/** Fail with two straight wrong. */
const F: readonly CTrialOutcome[] = [W, W];
/** Pass using all five Cs. */
const P5: readonly CTrialOutcome[] = [C, W, C, C, C];
/** Fail on the third C. */
const F3: readonly CTrialOutcome[] = [C, W, W];

function start(stepIndices: readonly number[]): CRunning {
  const state = startCStaircase(stepIndices);
  if (state.status !== "running") throw new Error(`cannot start ${JSON.stringify(stepIndices)}`);
  return state;
}

/** Feeds every outcome in order; fails loudly if the test ends before the last one. */
function feed(state: CStaircaseState, outcomes: readonly CTrialOutcome[]): CStaircaseState {
  let current = state;
  outcomes.forEach((outcome, i) => {
    if (current.status !== "running") {
      throw new Error(`finished before outcome ${i + 1} of ${outcomes.length}`);
    }
    current = recordCTrial(current, outcome);
  });
  return current;
}

function run(stepIndices: readonly number[], blocks: readonly (readonly CTrialOutcome[])[]) {
  return feed(start(stepIndices), blocks.flat());
}

function steps(state: CStaircaseState): number[] {
  return state.attempts.map((attempt) => attempt.stepIndex);
}

function finished(state: CStaircaseState) {
  if (state.status !== "finished") throw new Error("expected a finished staircase");
  return state;
}

function running(state: CStaircaseState) {
  if (state.status !== "running") throw new Error("expected a running staircase");
  return state;
}

/** Test 10's sequence: no size ever passes twice, ends on the 50th scored C. */
const CAP_BLOCKS = [P5, F3, F3, P5, F3, P5, F3, P5, F3, P5, F3, P5, [C, W]];

describe("startCStaircase", () => {
  it("starts at step 3 on the full range (test 16)", () => {
    const state = start(FULL);
    expect(state.currentStepIndex).toBe(3);
    expect(state.mode).toBe("searching");
    expect(state.attempts).toEqual([]);
    expect(state.scoredCount).toBe(0);
    expect(state.notSureCount).toBe(0);
    expect(state.lastPassedStepIndex).toBeNull();
  });

  it("starts at the smallest step when every step is coarser than 3 (test 16)", () => {
    expect(start([5, 6, 7, 8, 9, 10]).currentStepIndex).toBe(5);
  });

  it("starts at the largest step when every step is finer than 3 (test 16)", () => {
    expect(start([-1, 0, 1]).currentStepIndex).toBe(1);
  });

  it.each([[[]], [[3, 5]], [[4, 3]], [[-2, -1, 0]], [[10, 11]]])(
    "cannot start with %j (test 17)",
    (stepIndices) => {
      expect(startCStaircase(stepIndices)).toEqual({ status: "cannot-start" });
    },
  );

  it("does not keep a reference to the caller's array", () => {
    const stepIndices = [...FULL];
    const state = start(stepIndices);
    stepIndices.push(99);
    expect(state.stepIndices).toEqual(FULL);
  });
});

describe("recordCTrial: whole runs", () => {
  it("3P, 2P, 1F, 2P measures 6/9 (test 1)", () => {
    const state = finished(run(FULL, [P, P, F, P]));
    expect(state.result).toEqual({ kind: "measured", stepIndex: 2 });
    expect(steps(state)).toEqual([3, 2, 1, 2]);
  });

  it("3F, 6P, 5P, 4F, 5F, 6P measures 6/24 (test 2)", () => {
    const state = finished(run(FULL, [F, P, P, F, F, P]));
    expect(state.result).toEqual({ kind: "measured", stepIndex: 6 });
    expect(steps(state)).toEqual([3, 6, 5, 4, 5, 6]);
  });

  it("3F, 6F, 9F, 10F is not measurable at 10 (test 3)", () => {
    const state = finished(run(FULL, [F, F, F, F]));
    expect(state.result).toEqual({ kind: "not-measurable", coarsestStepIndex: 10 });
    expect(steps(state)).toEqual([3, 6, 9, 10]);
  });

  it("3F, 6F, 9F, 10P, 9F, 10F is inconsistent (test 4)", () => {
    const state = finished(run(FULL, [F, F, F, P, F, F]));
    expect(state.result).toEqual({ kind: "inconsistent" });
    expect(steps(state)).toEqual([3, 6, 9, 10, 9, 10]);
  });

  it("two passes at -1 is test-floor (test 5)", () => {
    const state = finished(run(FULL, [P, P, P, P, P, P]));
    expect(state.result).toEqual({ kind: "test-floor", stepIndex: -1 });
    expect(steps(state)).toEqual([3, 2, 1, 0, -1, -1]);
  });

  it("one pass at -1 then a fail there measures 6/6 (test 6)", () => {
    const state = finished(run(FULL, [P, P, P, P, P, F, P]));
    expect(state.result).toEqual({ kind: "measured", stepIndex: 0 });
    expect(steps(state)).toEqual([3, 2, 1, 0, -1, -1, 0]);
  });

  it("two passes at the finest available step is screen-limited (test 7)", () => {
    const state = finished(run(ONE_TO_TEN, [P, P, P, P]));
    expect(state.result).toEqual({ kind: "screen-limited", stepIndex: 1 });
    expect(steps(state)).toEqual([3, 2, 1, 1]);
  });

  it("caps the searching jump at the coarsest step, then not measurable (test 8)", () => {
    const state = finished(run(MINUS_ONE_TO_SEVEN, [F, F, F]));
    expect(state.result).toEqual({ kind: "not-measurable", coarsestStepIndex: 7 });
    expect(steps(state)).toEqual([3, 6, 7]);
  });

  it("a confirming fail at the capped coarsest step is inconsistent (test 9)", () => {
    const state = finished(run(MINUS_ONE_TO_SEVEN, [F, F, P, F, F]));
    expect(state.result).toEqual({ kind: "inconsistent" });
    expect(steps(state)).toEqual([3, 6, 7, 6, 7]);
  });
});

describe("recordCTrial: 50 scored C cap", () => {
  it("ends inconsistent after exactly 50 scored Cs with no size passed twice (test 10)", () => {
    const blocksBeforeLast = CAP_BLOCKS.slice(0, -1);
    const before = running(run(FULL, blocksBeforeLast));
    expect(before.scoredCount).toBe(48);
    const afterOne = running(recordCTrial(before, C));
    expect(afterOne.scoredCount).toBe(49);

    const state = finished(recordCTrial(afterOne, W));
    expect(state.scoredCount).toBe(C_MAX_SCORED);
    expect(state.result).toEqual({ kind: "inconsistent" });
    expect(steps(state)).toEqual([3, 2, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8]);
    const last = state.attempts[state.attempts.length - 1]!;
    expect(last.stepIndex).toBe(8);
    expect(last.passed).toBeNull();
    expect(last.outcomes).toEqual([C, W]);
  });

  it("refuses a 51st C on the finished state (test 10)", () => {
    const state = finished(run(FULL, CAP_BLOCKS));
    expect(() => recordCTrial(state as unknown as CRunning, C)).toThrow();
  });

  it("a second pass on the 50th C stands as measured (test 11)", () => {
    const state = finished(
      run(FULL, [P, F, F3, P5, F3, P5, F3, P5, F3, P5, F3, P5, P]),
    );
    expect(state.scoredCount).toBe(50);
    expect(state.result).toEqual({ kind: "measured", stepIndex: 8 });
    expect(steps(state)).toEqual([3, 2, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8]);
  });
});

describe("recordCTrial: within a size (test 12)", () => {
  function attemptAfterEach(outcomes: readonly CTrialOutcome[]) {
    const seen: (boolean | null)[] = [];
    let state: CStaircaseState = start(FULL);
    for (const outcome of outcomes) {
      state = recordCTrial(running(state), outcome);
      seen.push(state.attempts[0]!.passed);
    }
    return { state, seen };
  }

  it("C C C C passes on the 4th", () => {
    const { state, seen } = attemptAfterEach([C, C, C, C]);
    expect(seen).toEqual([null, null, null, true]);
    expect(steps(state)).toEqual([3]);
    expect(running(state).currentStepIndex).toBe(2);
  });

  it("W W fails on the 2nd", () => {
    const { state, seen } = attemptAfterEach([W, W]);
    expect(seen).toEqual([null, false]);
    expect(steps(state)).toEqual([3]);
    expect(running(state).currentStepIndex).toBe(6);
  });

  it("C W C C C passes on the 5th", () => {
    const { state, seen } = attemptAfterEach([C, W, C, C, C]);
    expect(seen).toEqual([null, null, null, null, true]);
    expect(steps(state)).toEqual([3]);
    expect(state.attempts[0]).toMatchObject({ correct: 4, wrong: 1 });
  });

  it("C W C W fails on the 4th", () => {
    const { state, seen } = attemptAfterEach([C, W, C, W]);
    expect(seen).toEqual([null, null, null, false]);
    expect(steps(state)).toEqual([3]);
    expect(state.attempts[0]).toMatchObject({ correct: 2, wrong: 2 });
  });
});

describe("recordCTrial: not_sure (test 13)", () => {
  it("C, not_sure, W fails on the 3rd and counts not_sure as wrong and separately", () => {
    const state = running(run(FULL, [[C, N, W]]));
    expect(steps(state)).toEqual([3]);
    expect(state.attempts[0]).toEqual({
      stepIndex: 3,
      outcomes: [C, N, W],
      correct: 1,
      wrong: 2,
      notSure: 1,
      voids: 0,
      passed: false,
    });
    expect(state.notSureCount).toBe(1);
    expect(state.scoredCount).toBe(3);
    expect(state.currentStepIndex).toBe(6);
  });
});

describe("recordCTrial: void (test 14)", () => {
  it("C C C void C passes with the void kept but not scored", () => {
    const state = running(run(FULL, [[C, C, C, V, C]]));
    expect(steps(state)).toEqual([3]);
    expect(state.attempts[0]).toEqual({
      stepIndex: 3,
      outcomes: [C, C, C, V, C],
      correct: 4,
      wrong: 0,
      notSure: 0,
      voids: 1,
      passed: true,
    });
    expect(state.scoredCount).toBe(4);
  });

  it("a run of voids never ends the test and never moves the size", () => {
    const voids = Array.from({ length: 200 }, () => V);
    const state = running(run(FULL, [voids]));
    expect(steps(state)).toEqual([3]);
    expect(state.currentStepIndex).toBe(3);
    expect(state.scoredCount).toBe(0);
    expect(state.attempts[0]).toMatchObject({ voids: 200, passed: null });
  });

  it("voids after a closed size open the next size without moving it", () => {
    const state = running(run(FULL, [P, [V, V, V]]));
    expect(steps(state)).toEqual([3, 2]);
    expect(state.currentStepIndex).toBe(2);
    expect(state.attempts[1]).toMatchObject({ voids: 3, passed: null });
  });

  it("voids at 49 scored Cs do not reach the 50 cap", () => {
    const at49 = running(run(FULL, [...CAP_BLOCKS.slice(0, -1), [C]]));
    expect(at49.scoredCount).toBe(49);
    const afterVoids = running(feed(at49, Array.from({ length: 20 }, () => V)));
    expect(afterVoids.scoredCount).toBe(49);
    const state = finished(recordCTrial(afterVoids, W));
    expect(state.result).toEqual({ kind: "inconsistent" });
    expect(steps(state)).toEqual([3, 2, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8]);
  });
});

describe("recordCTrial: guessing (test 15)", () => {
  it("passes a size by pure guessing with probability exactly 1/64", () => {
    const closedPrefixes = new Map<string, { used: number; wrong: number; passed: boolean }>();
    for (let mask = 0; mask < 2 ** 5; mask += 1) {
      const sequence = Array.from({ length: 5 }, (_, bit) => ((mask >> bit) & 1 ? W : C));
      let state: CStaircaseState = start(FULL);
      for (const outcome of sequence) {
        state = recordCTrial(running(state), outcome);
        if (state.attempts[0]!.passed !== null) break;
      }
      const attempt = state.attempts[0]!;
      expect(attempt.passed).not.toBeNull();
      expect(steps(state)).toEqual([3]);
      closedPrefixes.set(attempt.outcomes.join(","), {
        used: attempt.outcomes.length,
        wrong: attempt.wrong,
        passed: attempt.passed === true,
      });
    }

    // Weight 1^c x 3^w / 4^used, scaled to the common denominator 4^5.
    let totalWeight = 0;
    let passWeight = 0;
    for (const { used, wrong, passed } of closedPrefixes.values()) {
      const weight = 3 ** wrong * 4 ** (5 - used);
      totalWeight += weight;
      if (passed) passWeight += weight;
    }
    expect(totalWeight).toBe(4 ** 5);
    expect(passWeight * 64).toBe(totalWeight);
  });
});

describe("recordCTrial: determinism and purity (test 18)", () => {
  const outcomes = [F, P, P, F, F, P].flat();

  it("replaying the same outcomes gives deep-equal states", () => {
    const first = feed(start(FULL), outcomes);
    const second = feed(start(FULL), outcomes);
    expect(second).toEqual(first);
    expect(finished(first).result).toEqual({ kind: "measured", stepIndex: 6 });
    expect(steps(first)).toEqual([3, 6, 5, 4, 5, 6]);
  });

  it("never mutates the input state, open or closed attempt, any outcome", () => {
    const openAttempt = running(run(FULL, [F, [C, W]]));
    const closedAttempt = running(run(FULL, [F, P]));
    for (const state of [openAttempt, closedAttempt]) {
      for (const outcome of [C, W, N, V]) {
        const before = structuredClone(state);
        recordCTrial(state, outcome);
        expect(state).toEqual(before);
      }
    }
    expect(steps(openAttempt)).toEqual([3, 6]);
    expect(steps(closedAttempt)).toEqual([3, 6]);
  });
});

describe("passCountAt (test 21)", () => {
  it("derives pass counts from the attempts after test 2", () => {
    const state = finished(run(FULL, [F, P, P, F, F, P]));
    expect(steps(state)).toEqual([3, 6, 5, 4, 5, 6]);
    expect(passCountAt(state, 6)).toBe(2);
    expect(passCountAt(state, 5)).toBe(1);
    expect(passCountAt(state, 4)).toBe(0);
    expect(passCountAt(state, 3)).toBe(0);
  });
});

describe("pickDirection (test 19)", () => {
  it.each<[number, LandoltDirection]>([
    [0, "up"],
    [0.25, "down"],
    [0.5, "left"],
    [0.75, "right"],
    [0.9999, "right"],
  ])("random %d gives %s", (value, expected) => {
    expect(pickDirection(() => value)).toBe(expected);
  });

  it("clamps out-of-range random values into the four directions", () => {
    expect(pickDirection(() => 1)).toBe("right");
    expect(pickDirection(() => -0.5)).toBe("up");
  });

  it("returns only the four directions over 1000 seeded calls", () => {
    let seed = 0x9e3779b9;
    const mulberry32 = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const seen = new Set<LandoltDirection>();
    for (let i = 0; i < 1000; i += 1) {
      const direction = pickDirection(mulberry32);
      expect(LANDOLT_DIRECTIONS).toContain(direction);
      seen.add(direction);
    }
    expect([...seen].sort()).toEqual(["down", "left", "right", "up"]);
  });
});

describe("isDirectionCorrect and outcomeFor (test 20)", () => {
  const answers: readonly LandoltAnswer[] = [...LANDOLT_DIRECTIONS, "not_sure"];
  const cases = LANDOLT_DIRECTIONS.flatMap((shown) =>
    answers.map((answer) => [answer, shown] as const),
  );

  it("covers all 4 x 5 combinations", () => {
    expect(cases).toHaveLength(20);
  });

  it.each(cases)("answer %s with gap %s", (answer, shown) => {
    const expectedCorrect = answer === shown;
    const expectedOutcome =
      answer === "not_sure" ? "not_sure" : expectedCorrect ? "correct" : "incorrect";
    expect(isDirectionCorrect(answer, shown)).toBe(expectedCorrect);
    expect(outcomeFor(answer, shown)).toBe(expectedOutcome);
  });
});

import { describe, expect, it } from "vitest";
import {
  pickNextTarget,
  recordTrial,
  startStaircase,
  type RunningStaircase,
  type StaircaseState,
  type TrialOutcome,
} from "./staircase";

const FULL = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const passLevel: readonly TrialOutcome[] = [
  "correct",
  "correct",
  "correct",
  "incorrect",
  "incorrect",
];

const failLevel: readonly TrialOutcome[] = [
  "correct",
  "correct",
  "incorrect",
  "incorrect",
  "incorrect",
];

const allCorrect: readonly TrialOutcome[] = [
  "correct",
  "correct",
  "correct",
  "correct",
  "correct",
];

function runLevel(state: StaircaseState, outcomes: readonly TrialOutcome[]): StaircaseState {
  let current: StaircaseState = state;
  for (const outcome of outcomes) {
    if (current.status !== "running") {
      throw new Error("runLevel requires a running staircase");
    }
    const letter = pickNextTarget(current, () => 0);
    current = recordTrial(current, { letter, outcome });
  }
  return current;
}

function runningOn(stepIndices: readonly number[]): RunningStaircase {
  const state = startStaircase(stepIndices);
  if (state.status !== "running") {
    throw new Error("expected a running staircase");
  }
  return state;
}

describe("startStaircase", () => {
  it("ST1 starts a full ladder at logMAR 0.3 with one empty level", () => {
    expect(startStaircase(FULL)).toEqual({
      status: "running",
      stepIndices: FULL,
      direction: "start",
      currentStepIndex: 3,
      previousTarget: null,
      levels: [
        {
          stepIndex: 3,
          letters: [],
          outcomes: [],
          scored: 0,
          correct: 0,
          passed: null,
        },
      ],
    });
  });

  it("ST2 starts at 3 when it is present, otherwise at the nearest included end", () => {
    expect(runningOn([2, 3, 4, 5, 6, 7, 8, 9, 10]).currentStepIndex).toBe(3);
    expect(runningOn([5, 6, 7, 8, 9, 10]).currentStepIndex).toBe(5);
    expect(runningOn([-1, 0, 1]).currentStepIndex).toBe(1);
    expect(startStaircase([])).toEqual({ status: "cannot-start" });
  });

  it("ST3 throws RangeError unless the steps are consecutive and ascending", () => {
    expect(() => startStaircase([3, 5])).toThrow(RangeError);
    expect(() => startStaircase([5, 4])).toThrow(RangeError);
  });
});

describe("recordTrial", () => {
  it("ST4 moves one level finer when 3 of 5 at the start level are correct", () => {
    const after = runLevel(runningOn(FULL), passLevel);
    expect(after).toMatchObject({
      status: "running",
      currentStepIndex: 2,
      direction: "finer",
    });
  });

  it("ST5 moves one level coarser when 2 of 5 at the start level are correct", () => {
    const after = runLevel(runningOn(FULL), failLevel);
    expect(after).toMatchObject({
      status: "running",
      currentStepIndex: 4,
      direction: "coarser",
    });
  });

  it("ST6 moves one level finer when the same 3 correct letters come first as misses", () => {
    const after = runLevel(runningOn(FULL), [
      "incorrect",
      "incorrect",
      "correct",
      "correct",
      "correct",
    ]);
    expect(after).toMatchObject({
      status: "running",
      currentStepIndex: 2,
      direction: "finer",
    });
  });

  it("ST7 measures the last passed level when 0.0 fails after 0.3, 0.2 and 0.1 passed", () => {
    let state: StaircaseState = runningOn(FULL);
    for (const stepIndex of [3, 2, 1]) {
      if (state.status !== "running") {
        throw new Error("expected a running staircase");
      }
      expect(state.currentStepIndex).toBe(stepIndex);
      state = runLevel(state, passLevel);
    }
    if (state.status !== "running") {
      throw new Error("expected a running staircase");
    }
    expect(state.currentStepIndex).toBe(0);
    state = runLevel(state, failLevel);

    expect(state).toMatchObject({
      status: "finished",
      result: { kind: "measured", stepIndex: 1 },
    });
    if (state.status !== "finished") {
      throw new Error("expected a finished staircase");
    }
    expect(state.levels).toHaveLength(4);
    expect(state.levels.reduce((total, level) => total + level.letters.length, 0)).toBe(20);
  });

  it("ST8 reports the test floor when every letter from 0.3 down to -0.1 is correct", () => {
    let state: StaircaseState = runningOn(FULL);
    for (let stepIndex = 3; stepIndex >= -1; stepIndex -= 1) {
      if (state.status !== "running") {
        throw new Error("expected a running staircase");
      }
      expect(state.currentStepIndex).toBe(stepIndex);
      state = runLevel(state, allCorrect);
    }

    expect(state).toMatchObject({
      status: "finished",
      result: { kind: "test-floor", stepIndex: -1 },
    });
    if (state.status !== "finished") {
      throw new Error("expected a finished staircase");
    }
    expect(state.levels.map((level) => level.stepIndex)).toEqual([3, 2, 1, 0, -1]);
    expect(state.levels).toHaveLength(5);
    expect(state.levels.reduce((total, level) => total + level.letters.length, 0)).toBe(25);
  });

  it("ST9 measures 0.5 when the start and the next coarser level fail and 0.5 passes", () => {
    let state: StaircaseState = runningOn(FULL);
    state = runLevel(state, failLevel);
    if (state.status !== "running") {
      throw new Error("expected a running staircase");
    }
    state = runLevel(state, failLevel);
    if (state.status !== "running") {
      throw new Error("expected a running staircase");
    }
    state = runLevel(state, passLevel);

    expect(state).toMatchObject({
      status: "finished",
      result: { kind: "measured", stepIndex: 5 },
    });
  });

  it("ST10 is not measurable when every level from 0.3 through 1.0 fails", () => {
    let state: StaircaseState = runningOn(FULL);
    for (let stepIndex = 3; stepIndex <= 10; stepIndex += 1) {
      if (state.status !== "running") {
        throw new Error("expected a running staircase");
      }
      expect(state.currentStepIndex).toBe(stepIndex);
      state = runLevel(state, failLevel);
    }

    expect(state).toMatchObject({
      status: "finished",
      result: { kind: "not-measurable", coarsestStepIndex: 10 },
    });
    if (state.status !== "finished") {
      throw new Error("expected a finished staircase");
    }
    expect(state.levels).toHaveLength(8);
  });

  it("ST11 is screen-limited at 0.2 when that is the finest level the screen offered", () => {
    let state: StaircaseState = runningOn([2, 3, 4, 5, 6, 7, 8, 9, 10]);
    state = runLevel(state, passLevel);
    if (state.status !== "running") {
      throw new Error("expected a running staircase");
    }
    state = runLevel(state, passLevel);

    expect(state).toMatchObject({
      status: "finished",
      result: { kind: "screen-limited", stepIndex: 2 },
    });
  });

  it("ST12 is screen-limited at 5 when five letters at the only start level are correct", () => {
    const started = runningOn([5, 6, 7, 8, 9, 10]);
    expect(started.currentStepIndex).toBe(5);
    const passedStart = runLevel(started, allCorrect);
    expect(passedStart).toMatchObject({
      status: "finished",
      result: { kind: "screen-limited", stepIndex: 5 },
    });
    if (passedStart.status !== "finished") {
      throw new Error("expected a finished staircase");
    }
    expect(passedStart.levels).toHaveLength(1);
    expect(passedStart.levels.reduce((total, level) => total + level.letters.length, 0)).toBe(5);
  });

  it("ST20 measures 6 when 2 of 5 at 5 fail and 3 of 5 at 6 pass", () => {
    let failedStart: StaircaseState = runningOn([5, 6, 7, 8, 9, 10]);
    failedStart = runLevel(failedStart, failLevel);
    if (failedStart.status !== "running") {
      throw new Error("expected a running staircase");
    }
    failedStart = runLevel(failedStart, passLevel);
    expect(failedStart).toMatchObject({
      status: "finished",
      result: { kind: "measured", stepIndex: 6 },
    });
    if (failedStart.status !== "finished") {
      throw new Error("expected a finished staircase");
    }
    expect(failedStart.result).toEqual({ kind: "measured", stepIndex: 6 });
    expect(failedStart.levels).toHaveLength(2);
    expect(failedStart.levels.reduce((total, level) => total + level.letters.length, 0)).toBe(10);
  });

  it("ST13 is not measurable at 0.8 when that is the coarsest level offered and it fails", () => {
    let state: StaircaseState = runningOn([-1, 0, 1, 2, 3, 4, 5, 6, 7, 8]);
    for (let stepIndex = 3; stepIndex <= 8; stepIndex += 1) {
      if (state.status !== "running") {
        throw new Error("expected a running staircase");
      }
      state = runLevel(state, failLevel);
    }

    expect(state).toMatchObject({
      status: "finished",
      result: { kind: "not-measurable", coarsestStepIndex: 8 },
    });
  });

  it("ST18 is not measurable when every level from 5 through 10 fails", () => {
    let state: StaircaseState = runningOn([5, 6, 7, 8, 9, 10]);
    for (let stepIndex = 5; stepIndex <= 10; stepIndex += 1) {
      if (state.status !== "running") {
        throw new Error("expected a running staircase");
      }
      expect(state.currentStepIndex).toBe(stepIndex);
      state = runLevel(state, failLevel);
    }

    expect(state).toMatchObject({
      status: "finished",
      result: { kind: "not-measurable", coarsestStepIndex: 10 },
    });
    if (state.status !== "finished") {
      throw new Error("expected a finished staircase");
    }
    expect(state.levels).toHaveLength(6);
    expect(state.levels.reduce((total, level) => total + level.letters.length, 0)).toBe(30);
  });

  it("ST19 is screen-limited at 1 when 3, 2 and 1 pass, and measured at 2 when 1 fails", () => {
    const range = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let passed: StaircaseState = runningOn(range);
    for (const stepIndex of [3, 2, 1]) {
      if (passed.status !== "running") {
        throw new Error("expected a running staircase");
      }
      expect(passed.currentStepIndex).toBe(stepIndex);
      passed = runLevel(passed, passLevel);
    }

    expect(passed).toMatchObject({
      status: "finished",
      result: { kind: "screen-limited", stepIndex: 1 },
    });
    if (passed.status !== "finished") {
      throw new Error("expected a finished staircase");
    }
    expect(passed.levels.map((level) => level.stepIndex)).toEqual([3, 2, 1]);
    expect(passed.levels.reduce((total, level) => total + level.letters.length, 0)).toBe(15);

    let failed: StaircaseState = runningOn(range);
    for (const stepIndex of [3, 2]) {
      if (failed.status !== "running") {
        throw new Error("expected a running staircase");
      }
      expect(failed.currentStepIndex).toBe(stepIndex);
      failed = runLevel(failed, passLevel);
    }
    if (failed.status !== "running") {
      throw new Error("expected a running staircase");
    }
    expect(failed.currentStepIndex).toBe(1);
    failed = runLevel(failed, failLevel);
    expect(failed).toMatchObject({
      status: "finished",
      result: { kind: "measured", stepIndex: 2 },
    });
  });

  it("ST14 ignores a void trial and still passes the level on 3 scored correct", () => {
    const after = runLevel(runningOn(FULL), [
      "correct",
      "void",
      "correct",
      "correct",
      "incorrect",
      "incorrect",
    ]);
    expect(after).toMatchObject({
      status: "running",
      currentStepIndex: 2,
      direction: "finer",
    });
    if (after.status !== "running") {
      throw new Error("expected a running staircase");
    }
    const level3 = after.levels[0];
    if (level3 === undefined) {
      throw new Error("expected the level-3 record");
    }
    expect(level3.stepIndex).toBe(3);
    expect(level3.letters).toHaveLength(6);
    expect(level3.scored).toBe(5);
    expect(level3.correct).toBe(3);
    expect(level3.passed).toBe(true);
  });

  it("ST15 stays on the start level while a void leaves only 4 scored trials", () => {
    const after = runLevel(runningOn(FULL), [
      "correct",
      "correct",
      "void",
      "incorrect",
      "correct",
    ]);
    expect(after).toMatchObject({
      status: "running",
      currentStepIndex: 3,
      direction: "start",
    });
    if (after.status !== "running") {
      throw new Error("expected a running staircase");
    }
    const level3 = after.levels[0];
    if (level3 === undefined) {
      throw new Error("expected the level-3 record");
    }
    expect(level3.scored).toBe(4);
    expect(level3.passed).toBe(null);
  });

  it("ST16 throws when a trial is recorded after the staircase has finished", () => {
    const finished = runLevel(runningOn([5, 6, 7, 8, 9, 10]), passLevel);
    expect(finished.status).toBe("finished");
    expect(() => recordTrial(finished, { letter: "C", outcome: "correct" })).toThrow(Error);
  });

  it("ST17 leaves the input state unchanged when a trial is recorded", () => {
    const started = runningOn(FULL);
    const before = JSON.stringify(started);
    recordTrial(started, { letter: "C", outcome: "correct" });
    expect(JSON.stringify(started)).toBe(before);
  });
});

describe("pickNextTarget", () => {
  it("LT1 picks C first when the random sample is 0", () => {
    expect(pickNextTarget(runningOn(FULL), () => 0)).toBe("C");
  });

  it("LT2 picks D after C has been shown at this level", () => {
    const started = runningOn(FULL);
    const afterC = recordTrial(started, { letter: "C", outcome: "correct" });
    if (afterC.status !== "running") {
      throw new Error("expected a running staircase");
    }
    expect(pickNextTarget(afterC, () => 0)).toBe("D");
  });

  it("LT3 picks N at sample 0 and Z at sample 0.999 after C, D, H and K", () => {
    let state: StaircaseState = runningOn(FULL);
    for (const letter of ["C", "D", "H", "K"] as const) {
      if (state.status !== "running") {
        throw new Error("expected a running staircase");
      }
      state = recordTrial(state, { letter, outcome: "correct" });
    }
    if (state.status !== "running") {
      throw new Error("expected a running staircase");
    }
    expect(pickNextTarget(state, () => 0)).toBe("N");
    expect(pickNextTarget(state, () => 0.999)).toBe("Z");
  });

  it("LT4 skips the previous target C when the first letter of the next level is chosen", () => {
    let state: StaircaseState = runningOn(FULL);
    const trials = [
      { letter: "D" as const, outcome: "correct" as const },
      { letter: "H" as const, outcome: "correct" as const },
      { letter: "K" as const, outcome: "correct" as const },
      { letter: "N" as const, outcome: "incorrect" as const },
      { letter: "C" as const, outcome: "incorrect" as const },
    ];
    for (const trial of trials) {
      if (state.status !== "running") {
        throw new Error("expected a running staircase");
      }
      state = recordTrial(state, trial);
    }
    if (state.status !== "running") {
      throw new Error("expected a running staircase");
    }
    expect(state.currentStepIndex).toBe(2);
    expect(pickNextTarget(state, () => 0)).toBe("D");
  });

  it("LT5 falls back to every letter except the previous target once the level has shown all ten", () => {
    let state: StaircaseState = runningOn(FULL);
    for (const letter of ["C", "D", "H", "K", "N", "O", "R", "S", "V", "Z"] as const) {
      if (state.status !== "running") {
        throw new Error("expected a running staircase");
      }
      state = recordTrial(state, { letter, outcome: "void" });
    }
    if (state.status !== "running") {
      throw new Error("expected a running staircase");
    }
    expect(pickNextTarget(state, () => 0)).toBe("C");
  });

  it("LT6 throws RangeError when the random sample is outside [0, 1)", () => {
    const started = runningOn(FULL);
    expect(() => pickNextTarget(started, () => 1)).toThrow(RangeError);
    expect(() => pickNextTarget(started, () => -0.1)).toThrow(RangeError);
  });
});

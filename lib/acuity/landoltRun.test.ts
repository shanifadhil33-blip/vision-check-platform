import { describe, expect, it } from "vitest";
import {
  C_MAX_SCORED,
  LANDOLT_DIRECTIONS,
  type CStaircaseState,
  type LandoltDirection,
} from "./landoltStaircase";
import {
  answerC,
  inPractice,
  landoltDetailLines,
  landoltResultLine,
  landoltSizeRows,
  landoltStartHint,
  landoltStartMessage,
  pickDirectionExcept,
  pickPracticeDirections,
  planNextC,
  practiceStepIndex,
  startLandoltPlan,
  voidC,
  type LandoltPlan,
} from "./landoltRun";

const ALL_STEPS = [-1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Seeded mulberry32: the same seed always gives the same sequence. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length]!;
}

function freshPlan(seed = 1): LandoltPlan {
  const plan = startLandoltPlan(ALL_STEPS, seeded(seed));
  if (plan === null) {
    throw new Error("setup");
  }
  return plan;
}

describe("pickPracticeDirections", () => {
  it("always gives two different directions, across 500 seeds", () => {
    for (let seed = 0; seed < 500; seed += 1) {
      const [first, second] = pickPracticeDirections(seeded(seed));
      expect(LANDOLT_DIRECTIONS).toContain(first);
      expect(LANDOLT_DIRECTIONS).toContain(second);
      expect(first).not.toBe(second);
    }
  });

  it("the same seed gives the same pair", () => {
    expect(pickPracticeDirections(seeded(42))).toEqual(pickPracticeDirections(seeded(42)));
  });

  it("with random 0 then 0: up, then the first of the other three (down)", () => {
    expect(pickPracticeDirections(sequence([0, 0]))).toEqual(["up", "down"]);
  });
});

describe("pickDirectionExcept", () => {
  it("never returns the excluded direction, even for out-of-range random values", () => {
    for (const excluded of LANDOLT_DIRECTIONS) {
      for (const value of [0, 0.2, 0.5, 0.99, 1, -1, Number.NaN]) {
        expect(pickDirectionExcept(() => value, excluded)).not.toBe(excluded);
      }
    }
  });
});

describe("practice", () => {
  it("the first two Cs are practice at the coarsest step, with the planned directions", () => {
    const plan = freshPlan(7);
    const first = planNextC(plan, seeded(99));
    expect(first).toEqual({ practice: true, stepIndex: 10, direction: plan.practiceDirections[0] });
    const afterFirst = answerC(plan, first!, "not_sure").plan;
    const second = planNextC(afterFirst, seeded(99));
    expect(second).toEqual({ practice: true, stepIndex: 10, direction: plan.practiceDirections[1] });
  });

  it("practice uses the coarsest available step when 6/60 does not fit", () => {
    expect(practiceStepIndex([0, 1, 2, 3, 4, 5, 6, 7])).toBe(7);
    const plan = startLandoltPlan([0, 1, 2, 3, 4, 5, 6, 7], seeded(3))!;
    expect(planNextC(plan, seeded(3))!.stepIndex).toBe(7);
  });

  it("practice answers never reach the module: the staircase object is untouched", () => {
    const plan = freshPlan(11);
    const staircaseBefore: CStaircaseState = plan.staircase;
    let current = plan;
    for (const answer of ["up", "not_sure"] as const) {
      const shown = planNextC(current, seeded(5))!;
      expect(shown.practice).toBe(true);
      const answered = answerC(current, shown, answer);
      expect(answered.closedAttempt).toBeNull();
      expect(answered.plan.staircase).toBe(staircaseBefore);
      current = answered.plan;
    }
    expect(current.staircase.scoredCount).toBe(0);
    expect(current.staircase.notSureCount).toBe(0);
    expect(current.staircase.attempts).toEqual([]);
    expect(inPractice(current)).toBe(false);
  });

  it("a wrong practice answer changes nothing but the practice count", () => {
    const plan = freshPlan(13);
    const shown = planNextC(plan, seeded(1))!;
    const wrong = LANDOLT_DIRECTIONS.find((direction) => direction !== shown.direction)!;
    const answered = answerC(plan, shown, wrong);
    expect(answered.outcome).toBe("incorrect");
    expect(answered.plan).toEqual({ ...plan, practiceAnswered: 1 });
  });

  it("after practice the first scored C is at the module start size, 6/12", () => {
    let plan = freshPlan(17);
    plan = answerC(plan, planNextC(plan, seeded(1))!, "left").plan;
    plan = answerC(plan, planNextC(plan, seeded(1))!, "left").plan;
    const scored = planNextC(plan, seeded(1))!;
    expect(scored.practice).toBe(false);
    expect(scored.stepIndex).toBe(3);
  });

  it("practice Cs never count toward the 50: 2 practice plus 50 scored Cs end at 50", () => {
    let plan = freshPlan(19);
    const random = seeded(23);
    let shownCount = 0;
    while (planNextC(plan, random) !== null) {
      const shown = planNextC(plan, random)!;
      // Alternate right and wrong so no size is passed twice quickly.
      const answer: LandoltDirection =
        shown.practice || shownCount % 5 < 3
          ? shown.direction
          : LANDOLT_DIRECTIONS.find((direction) => direction !== shown.direction)!;
      plan = answerC(plan, shown, answer).plan;
      shownCount += 1;
      if (shownCount > 200) {
        throw new Error("did not finish");
      }
    }
    expect(plan.staircase.status).toBe("finished");
    expect(plan.staircase.scoredCount).toBeLessThanOrEqual(C_MAX_SCORED);
    expect(shownCount).toBe(plan.staircase.scoredCount + 2);
  });

  it("refuses a scored answer during practice and a practice answer after it", () => {
    const plan = freshPlan(29);
    expect(() => answerC(plan, { practice: false, stepIndex: 3, direction: "up" }, "up")).toThrow();
    let done = answerC(plan, planNextC(plan, seeded(1))!, "up").plan;
    done = answerC(done, planNextC(done, seeded(1))!, "up").plan;
    expect(() => answerC(done, { practice: true, stepIndex: 10, direction: "up" }, "up")).toThrow();
  });
});

describe("voidC", () => {
  it("a voided practice C gets a fresh direction that still differs from the other practice C", () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const plan = freshPlan(seed);
      const shown = planNextC(plan, seeded(seed))!;
      const voided = voidC(plan, shown, seeded(seed + 1000));
      expect(voided.practiceDirections[0]).not.toBe(voided.practiceDirections[1]);
      expect(voided.practiceAnswered).toBe(0);
      expect(voided.staircase).toBe(plan.staircase);
    }
  });

  it("a voided scored C is kept in the module record and not counted", () => {
    let plan = freshPlan(31);
    plan = answerC(plan, planNextC(plan, seeded(1))!, "up").plan;
    plan = answerC(plan, planNextC(plan, seeded(1))!, "up").plan;
    const shown = planNextC(plan, seeded(1))!;
    const voided = voidC(plan, shown, seeded(2));
    expect(voided.staircase.scoredCount).toBe(0);
    expect(voided.staircase.attempts[0]!.voids).toBe(1);
    expect(planNextC(voided, seeded(3))!.stepIndex).toBe(shown.stepIndex);
  });
});

describe("answerC on scored Cs", () => {
  it("reports the size attempt it closed, and only then", () => {
    let plan = freshPlan(37);
    plan = answerC(plan, planNextC(plan, seeded(1))!, "up").plan;
    plan = answerC(plan, planNextC(plan, seeded(1))!, "up").plan;
    const closures: (number | null)[] = [];
    for (let i = 0; i < 4; i += 1) {
      const shown = planNextC(plan, seeded(i + 50))!;
      const answered = answerC(plan, shown, shown.direction);
      closures.push(answered.closedAttempt === null ? null : answered.closedAttempt.stepIndex);
      plan = answered.plan;
    }
    expect(closures).toEqual([null, null, null, 3]);
  });
});

describe("landoltResultLine", () => {
  it("words every result kind", () => {
    expect(landoltResultLine({ kind: "measured", stepIndex: 2 })).toBe("Approximately 6/9");
    expect(landoltResultLine({ kind: "measured", stepIndex: 0 })).toBe("Approximately 6/6");
    expect(landoltResultLine({ kind: "test-floor", stepIndex: -1 })).toBe("6/5 or better");
    expect(landoltResultLine({ kind: "screen-limited", stepIndex: 1 })).toBe(
      "6/7.5 or better. This screen can’t show smaller sizes reliably.",
    );
    expect(landoltResultLine({ kind: "not-measurable", coarsestStepIndex: 10 })).toBe(
      "Below the test’s measurable range",
    );
    expect(landoltResultLine({ kind: "not-measurable", coarsestStepIndex: 8 })).toBe(
      "Below the largest size this screen can show (6/36)",
    );
    expect(landoltResultLine({ kind: "inconsistent" })).toBe("Inconsistent result");
  });
});

describe("landoltDetailLines", () => {
  it("lists eye, what was worn, distance, Cs answered and not sure answers", () => {
    expect(
      landoltDetailLines({
        eye: "left",
        correction: "glasses",
        distanceMm: 2000,
        scoredCount: 23,
        notSureCount: 4,
      }),
    ).toEqual([
      "Eye tested: Left eye",
      "Wearing: My glasses",
      "Distance: 2 metres",
      "Cs answered: 23 (practice not counted)",
      "Not sure answers: 4",
    ]);
    expect(
      landoltDetailLines({ eye: "both", correction: "none", distanceMm: 3000, scoredCount: 0, notSureCount: 0 })[0],
    ).toBe("Eye tested: Both eyes together");
  });
});

describe("landoltStartHint and landoltStartMessage", () => {
  it("asks for the eye first", () => {
    const hint = landoltStartHint({ eye: null, correction: null, distanceConfirmed: false });
    expect(hint).toBe("eye");
    expect(landoltStartMessage(hint, 3000)).toBe("Choose which eye you’re testing, then press Start.");
  });

  it("then what is worn, then the tick box, then nothing", () => {
    expect(landoltStartHint({ eye: "right", correction: null, distanceConfirmed: true })).toBe("wearing");
    expect(landoltStartMessage("wearing", 3000)).toBe("Choose what you’ll be wearing, then press Start.");
    expect(landoltStartHint({ eye: "right", correction: "none", distanceConfirmed: false })).toBe("distance");
    expect(landoltStartMessage("distance", 2000)).toBe(
      "Tick the box to confirm you’ve marked 2 metres from the screen, then press Start.",
    );
    expect(landoltStartHint({ eye: "both", correction: "contacts", distanceConfirmed: true })).toBeNull();
    expect(landoltStartMessage(null, 3000)).toBeNull();
  });
});

describe("landoltSizeRows", () => {
  it("one row per attempt with Cs, correct, wrong and the outcome word; voids not counted", () => {
    expect(
      landoltSizeRows([
        { stepIndex: 3, outcomes: [], correct: 4, wrong: 0, notSure: 0, voids: 1, passed: true },
        { stepIndex: 2, outcomes: [], correct: 1, wrong: 2, notSure: 1, voids: 0, passed: false },
        { stepIndex: 3, outcomes: [], correct: 2, wrong: 0, notSure: 0, voids: 0, passed: null },
      ]),
    ).toEqual([
      { stepIndex: 3, size: "6/12", cs: 4, correct: 4, wrong: 0, outcome: "Passed" },
      { stepIndex: 2, size: "6/9", cs: 3, correct: 1, wrong: 2, outcome: "Failed" },
      { stepIndex: 3, size: "6/12", cs: 2, correct: 2, wrong: 0, outcome: "Not finished" },
    ]);
  });
});

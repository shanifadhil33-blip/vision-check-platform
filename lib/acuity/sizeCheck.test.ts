import { describe, expect, it } from "vitest";
import {
  drawnMm,
  formatLogMar,
  formatMm,
  labelDenominator,
  roundingAllowanceMm,
  sizeCheckAreaHeightCssPx,
  sizeCheckCopyText,
  sizeCheckStep,
  sizeValues,
} from "./sizeCheck";

const DENOMINATORS: ReadonlyArray<[number, number]> = [
  [-1, 5],
  [0, 6],
  [1, 7.5],
  [2, 9],
  [3, 12],
  [4, 15],
  [5, 18],
  [6, 24],
  [7, 30],
  [8, 36],
  [9, 48],
  [10, 60],
];

describe("labelDenominator", () => {
  it("S1 is the number after 6/ for every step from -1 to 10, and throws for -2 and 11", () => {
    for (const [stepIndex, denominator] of DENOMINATORS) {
      expect(labelDenominator(stepIndex)).toBe(denominator);
    }
    expect(() => labelDenominator(-2)).toThrow(RangeError);
    expect(() => labelDenominator(11)).toThrow(RangeError);
  });
});

describe("sizeValues", () => {
  it("S2 gives the 6/60 values at 3000 mm", () => {
    const values = sizeValues(10, 3000);
    expect(values.label).toBe("6/60");
    expect(values.logMar).toBe(1);
    expect(values.heightMm).toBeCloseTo(43.6335, 3);
    expect(values.strokeMm).toBeCloseTo(8.727, 3);
    expect(values.labelHeightMm).toBeCloseTo(43.6335, 3);
    expect(values.otherDistanceMm).toBe(2000);
    expect(values.otherHeightMm).toBeCloseTo(29.089, 3);
  });

  it("S3 computes the label height from the rounded label at 2000 and 3000 mm", () => {
    const rows: ReadonlyArray<[number, number, number]> = [
      [-1, 2.424, 3.636],
      [2, 4.363, 6.545],
      [5, 8.727, 13.09],
      [8, 17.453, 26.18],
    ];
    for (const [stepIndex, at2000Mm, at3000Mm] of rows) {
      expect(sizeValues(stepIndex, 2000).labelHeightMm).toBeCloseTo(at2000Mm, 3);
      expect(sizeValues(stepIndex, 3000).labelHeightMm).toBeCloseTo(at3000Mm, 3);
    }
  });
});

describe("formatMm and formatLogMar", () => {
  it("S4 formats millimetres and logMAR to two decimals", () => {
    expect(formatMm(43.6335)).toBe("43.63 mm");
    expect(formatMm(2.3106)).toBe("2.31 mm");
    expect(formatLogMar(-0.1)).toBe("-0.10");
    expect(formatLogMar(0)).toBe("0.00");
    expect(formatLogMar(0.3)).toBe("0.30");
    expect(formatLogMar(1)).toBe("1.00");
  });
});

describe("drawnMm and roundingAllowanceMm", () => {
  it("S5 converts screen pixels to millimetres and gives half a screen pixel as the allowance", () => {
    expect(drawnMm(273, 4.1764, 1.5)).toBeCloseTo(43.578, 3);
    expect(roundingAllowanceMm(4.1764, 1.5)).toBeCloseTo(0.08, 3);
  });
});

describe("sizeCheckCopyText", () => {
  const base = {
    values: sizeValues(10, 3000),
    distanceMm: 3000 as const,
    letter: "H" as const,
    cssPxPerMm: 4.1764,
    devicePixelRatio: 1.5,
    dateIso: "2026-10-24",
    userAgent: "UA",
  };

  it("S6 gives the whole block for 6/60 at 3 metres, letter H, drawn 273", () => {
    expect(sizeCheckCopyText({ ...base, drawnDevicePx: 273 })).toBe(
      [
        "Letter size check (size-check-1)",
        "Date: 2026-10-24",
        "Browser: UA",
        "Distance: 3 metres",
        "Letter: H",
        "Size: 6/60, logMAR 1.00",
        "Expected letter height: 43.63 mm",
        "Expected stroke width: 8.73 mm",
        "From the rounded label: height 43.63 mm, stroke 8.73 mm",
        "Drawn on this screen: 273 screen pixels, about 43.58 mm",
        "Screen pixel size: 0.160 mm, so the drawn letter can differ by up to 0.08 mm",
        "At 2 metres this size is 29.09 mm",
        "Screen set up: 4.1764 CSS px per mm, pixel ratio 1.5",
      ].join("\n"),
    );
  });

  it("S6 says not measured when nothing has been measured yet", () => {
    const lines = sizeCheckCopyText({ ...base, drawnDevicePx: null }).split("\n");
    expect(lines).toHaveLength(13);
    expect(lines[9]).toBe("Drawn on this screen: not measured");
  });
});

describe("sizeCheckStep", () => {
  it("S7 keeps the preferred step when the test would draw it", () => {
    expect(sizeCheckStep(4, [2, 3, 4, 5, 10])).toBe(4);
  });

  it("S7 falls back to 6/60 when the preferred step is not drawable", () => {
    expect(sizeCheckStep(-1, [0, 1, 10])).toBe(10);
    expect(sizeCheckStep(null, [0, 1, 10])).toBe(10);
  });

  it("S7 falls back to the coarsest drawable step when 6/60 does not fit", () => {
    expect(sizeCheckStep(9, [0, 1, 2, 3, 4, 5, 6, 7])).toBe(7);
  });

  it("S7 gives null when no step is drawable", () => {
    expect(sizeCheckStep(10, [])).toBeNull();
  });
});

describe("sizeCheckAreaHeightCssPx", () => {
  it("A1 adds twice the letter height when it is between 12 and 40 px", () => {
    expect(sizeCheckAreaHeightCssPx(30)).toBe(30 + 60);
  });

  it("A2 adds twice 12 px when the letter is under 12 px", () => {
    expect(sizeCheckAreaHeightCssPx(10)).toBe(10 + 24);
  });

  it("A3 adds twice 40 px when the letter is over 40 px", () => {
    expect(sizeCheckAreaHeightCssPx(200)).toBe(200 + 80);
  });
});

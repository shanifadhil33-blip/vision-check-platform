import { describe, expect, it } from "vitest";
import {
  SIZE_CHECK_LETTER_LABELS,
  sizeCheckCopyText,
  sizeCheckFormat,
  sizeCheckIntro,
  sizeCheckRingValues,
  sizeValues,
} from "./sizeCheck";

const COMMON = {
  drawnDevicePx: 349,
  cssPxPerMm: 4,
  devicePixelRatio: 2,
  dateIso: "2026-11-01",
  userAgent: "test-agent",
};

describe("size check Landolt C option", () => {
  it("labels the third option Landolt C and keeps H and Z as they were", () => {
    expect(SIZE_CHECK_LETTER_LABELS).toEqual({ H: "H", Z: "Z", landolt: "Landolt C" });
  });

  it("the C uses the single fit, the letters keep the triplet fit", () => {
    expect(sizeCheckFormat("landolt")).toBe("single");
    expect(sizeCheckFormat("H")).toBe("flanked-triplet");
    expect(sizeCheckFormat("Z")).toBe("flanked-triplet");
  });

  it("ring outer diameter is the letter height; ring width and gap are the stroke (to 9 decimals)", () => {
    const values = sizeValues(10, 3000);
    const ring = sizeCheckRingValues(values, 3000);
    expect(ring.outerDiameterMm).toBeCloseTo(values.heightMm, 9);
    expect(ring.ringWidthMm).toBeCloseTo(values.strokeMm, 9);
    expect(ring.gapWidthMm).toBeCloseTo(values.strokeMm, 9);
  });

  it("Copy values says Letter: Landolt C and adds the three ring lines after the stroke width", () => {
    const lines = sizeCheckCopyText({
      ...COMMON,
      values: sizeValues(10, 3000),
      distanceMm: 3000,
      letter: "landolt",
    }).split("\n");
    expect(lines[4]).toBe("Letter: Landolt C");
    expect(lines.slice(7, 10)).toEqual([
      "Expected stroke width: 8.73 mm",
      "Ring outer diameter: 43.63 mm",
      "Ring width: 8.73 mm",
    ]);
    expect(lines[10]).toBe("Gap width: 8.73 mm");
    expect(lines).toHaveLength(16);
  });

  it("H copy text has no ring lines and still 13 lines", () => {
    const lines = sizeCheckCopyText({
      ...COMMON,
      values: sizeValues(10, 3000),
      distanceMm: 3000,
      letter: "H",
    }).split("\n");
    expect(lines[4]).toBe("Letter: H");
    expect(lines).toHaveLength(13);
    expect(lines.some((line) => line.startsWith("Ring") || line.startsWith("Gap"))).toBe(false);
  });
});

describe("size check intro line", () => {
  it("reads the C wording when Landolt C is chosen", () => {
    expect(sizeCheckIntro("landolt")).toBe("Measure the C: its outer diameter, ring width and gap.");
  });

  it("keeps the letter wording exactly as before for H and Z", () => {
    const letterIntro =
      "Shows one test size at a time, drawn exactly as in the test. Measure the middle letter with a ruler held flat against the screen.";
    expect(sizeCheckIntro("H")).toBe(letterIntro);
    expect(sizeCheckIntro("Z")).toBe(letterIntro);
  });
});

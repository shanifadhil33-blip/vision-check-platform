import { describe, expect, it } from "vitest";
import { letterHeightMmForLogMar, strokeWidthMmForLogMar } from "./logmar";

const WORKED_VALUES: ReadonlyArray<{
  distanceMm: number;
  logMar: number;
  heightMm: number;
  strokeMm: number;
}> = [
  { distanceMm: 2000, logMar: -0.1, heightMm: 2.311, strokeMm: 0.462 },
  { distanceMm: 2000, logMar: 0, heightMm: 2.909, strokeMm: 0.582 },
  { distanceMm: 2000, logMar: 0.3, heightMm: 5.804, strokeMm: 1.161 },
  { distanceMm: 2000, logMar: 0.7, heightMm: 14.579, strokeMm: 2.916 },
  { distanceMm: 2000, logMar: 1.0, heightMm: 29.089, strokeMm: 5.818 },
  { distanceMm: 3000, logMar: -0.1, heightMm: 3.466, strokeMm: 0.693 },
  { distanceMm: 3000, logMar: 0, heightMm: 4.363, strokeMm: 0.873 },
  { distanceMm: 3000, logMar: 0.3, heightMm: 8.706, strokeMm: 1.741 },
  { distanceMm: 3000, logMar: 0.7, heightMm: 21.869, strokeMm: 4.374 },
  { distanceMm: 3000, logMar: 1.0, heightMm: 43.6335, strokeMm: 8.727 },
];

describe("letterHeightMmForLogMar and strokeWidthMmForLogMar", () => {
  it("G1 match the worked values at 2000 and 3000 mm to 3 decimals", () => {
    for (const row of WORKED_VALUES) {
      expect(letterHeightMmForLogMar(row.logMar, row.distanceMm)).toBeCloseTo(row.heightMm, 3);
      expect(strokeWidthMmForLogMar(row.logMar, row.distanceMm)).toBeCloseTo(row.strokeMm, 3);
    }
  });

  it("G2 the 3000 mm height is 1.5 times the 2000 mm height at every step from -1 to 10", () => {
    for (let stepIndex = -1; stepIndex <= 10; stepIndex += 1) {
      const logMar = stepIndex / 10;
      const ratio = letterHeightMmForLogMar(logMar, 3000) / letterHeightMmForLogMar(logMar, 2000);
      expect(Math.abs(ratio - 1.5)).toBeLessThan(1e-12);
    }
  });

  it("G3 height is 5 times the stroke at every step from -1 to 10", () => {
    for (const distanceMm of [2000, 3000]) {
      for (let stepIndex = -1; stepIndex <= 10; stepIndex += 1) {
        const logMar = stepIndex / 10;
        const heightMm = letterHeightMmForLogMar(logMar, distanceMm);
        const strokeMm = strokeWidthMmForLogMar(logMar, distanceMm);
        expect(Math.abs(heightMm - 5 * strokeMm)).toBeLessThan(1e-12);
      }
    }
  });
});

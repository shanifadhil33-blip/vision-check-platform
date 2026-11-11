import { describe, expect, it } from "vitest";
import { mean, RollingWindow, sampleStandardDeviation, standardDeviationPercent } from "./stats";

describe("baseline average and SD over 30 frames", () => {
  it("30 values 48.55, 48.65, … 51.45 (step 0.1): mean 50, SD 0.88034, SD 1.76068 %", () => {
    // Sample variance of an evenly spaced run: step² × n(n + 1) / 12 = 0.01 × 30 × 31 / 12 = 0.775.
    const values = Array.from({ length: 30 }, (_, i) => 50 + 0.1 * (i - 14.5));
    expect(mean(values)).toBeCloseTo(50, 10);
    expect(sampleStandardDeviation(values)).toBeCloseTo(Math.sqrt(0.775), 6);
    expect(sampleStandardDeviation(values)).toBeCloseTo(0.88034, 5);
    expect(standardDeviationPercent(values)).toBeCloseTo(1.76068, 5);
  });

  it("15 × 49 and 15 × 51: mean 50, sample SD √(30/29) = 1.01710, SD 2.03419 %", () => {
    const values = Array.from({ length: 30 }, (_, i) => (i % 2 === 0 ? 49 : 51));
    expect(mean(values)).toBe(50);
    expect(sampleStandardDeviation(values)).toBeCloseTo(Math.sqrt(30 / 29), 10);
    expect(standardDeviationPercent(values)).toBeCloseTo(2.03419, 5);
  });

  it("a 30-frame window drops the oldest values", () => {
    const window = new RollingWindow(30);
    for (let i = 0; i < 5; i += 1) {
      window.push(1000);
    }
    for (let i = 0; i < 30; i += 1) {
      window.push(i % 2 === 0 ? 49 : 51);
    }
    expect(window.size).toBe(30);
    expect(window.mean()).toBe(50);
    expect(window.standardDeviationPercent()).toBeCloseTo(2.03419, 5);
  });
});

import { describe, expect, it } from "vitest";
import type { Calibration } from "./types";
import { calibrationForTestRecord } from "./forTestRecord";

const ATTACHED_AT_ISO = "2026-10-05T18:00:00.000Z";

function fixture(): Calibration {
  return {
    cssPxPerMm: 4.127967,
    cardWidthCssPx: 354.5,
    devicePixelRatio: 2,
    viewportWidthCssPx: 1920,
    viewportHeightCssPx: 1080,
    screenWidthCssPx: 1920,
    screenHeightCssPx: 1080,
    userAgent: "Mozilla/5.0 (test)",
    createdAtIso: "2026-09-20T10:00:00.000Z",
    method: "card-id1",
    verifications: [
      {
        claimedMm: 85.6,
        measuredMm: 86.1,
        createdAtIso: "2026-09-20T10:05:00.000Z",
      },
      {
        claimedMm: 50,
        measuredMm: 49.5,
        createdAtIso: "2026-09-20T10:05:00.000Z",
      },
    ],
    rulerBar: {
      barCssPx: 400,
      measuredMm: 96.9,
      createdAtIso: "2026-09-20T10:03:00.000Z",
    },
    cardMatchAttempts: [
      {
        round: 1,
        startCardWidthCssPx: 300,
        cardWidthCssPx: 354,
        devicePixelRatio: 2,
        confirmedAtIso: "2026-09-20T10:01:00.000Z",
      },
      {
        round: 2,
        startCardWidthCssPx: 320,
        cardWidthCssPx: 355,
        devicePixelRatio: 2,
        confirmedAtIso: "2026-09-20T10:02:00.000Z",
      },
    ],
  };
}

describe("calibrationForTestRecord", () => {
  it("C1 stamps the result with the attach time", () => {
    const result = calibrationForTestRecord(fixture(), ATTACHED_AT_ISO);
    expect(result.createdAtIso).toBe("2026-10-05T18:00:00.000Z");
  });

  it("C2 restamps both verifications and keeps the millimetre measurements", () => {
    const source = fixture();
    const result = calibrationForTestRecord(source, ATTACHED_AT_ISO);
    expect(result.verifications).toEqual([
      {
        claimedMm: 85.6,
        measuredMm: 86.1,
        createdAtIso: "2026-10-05T18:00:00.000Z",
      },
      {
        claimedMm: 50,
        measuredMm: 49.5,
        createdAtIso: "2026-10-05T18:00:00.000Z",
      },
    ]);
    expect(result.verifications[0]?.claimedMm).toBe(source.verifications[0]?.claimedMm);
    expect(result.verifications[0]?.measuredMm).toBe(source.verifications[0]?.measuredMm);
    expect(result.verifications[1]?.claimedMm).toBe(source.verifications[1]?.claimedMm);
    expect(result.verifications[1]?.measuredMm).toBe(source.verifications[1]?.measuredMm);
  });

  it("C3 copies the scale, device, and method fields unchanged", () => {
    const source = fixture();
    const result = calibrationForTestRecord(source, ATTACHED_AT_ISO);
    expect(result.cssPxPerMm).toBe(source.cssPxPerMm);
    expect(result.cardWidthCssPx).toBe(source.cardWidthCssPx);
    expect(result.devicePixelRatio).toBe(source.devicePixelRatio);
    expect(result.viewportWidthCssPx).toBe(source.viewportWidthCssPx);
    expect(result.viewportHeightCssPx).toBe(source.viewportHeightCssPx);
    expect(result.screenWidthCssPx).toBe(source.screenWidthCssPx);
    expect(result.screenHeightCssPx).toBe(source.screenHeightCssPx);
    expect(result.userAgent).toBe(source.userAgent);
    expect(result.method).toBe(source.method);
  });

  it("C4 omits rulerBar and cardMatchAttempts", () => {
    const result = calibrationForTestRecord(fixture(), ATTACHED_AT_ISO);
    expect(Object.hasOwn(result, "rulerBar")).toBe(false);
    expect(Object.hasOwn(result, "cardMatchAttempts")).toBe(false);
  });

  it("C5 leaves the fixture unchanged", () => {
    const source = fixture();
    const before = structuredClone(source);
    calibrationForTestRecord(source, ATTACHED_AT_ISO);
    expect(source).toEqual(before);
  });

  it("C6 drops every saved 20 September timestamp from the JSON", () => {
    const result = calibrationForTestRecord(fixture(), ATTACHED_AT_ISO);
    expect(JSON.stringify(result).includes("2026-09-20")).toBe(false);
  });
});

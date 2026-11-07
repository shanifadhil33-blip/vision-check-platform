import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: unknown[] = [];
let nextResponse: { data: unknown; error: unknown; status: number } = { data: 2, error: null, status: 200 };

vi.mock("@/lib/db/client", () => ({
  getSupabaseBrowserClient: () => ({
    rpc: (name: string, args: unknown) => {
      calls.push([name, args]);
      return Promise.resolve(nextResponse);
    },
  }),
}));

import {
  buildDistanceReadingsPayload,
  type DistanceReading,
  distanceReadingPayload,
  recordDistanceReadings,
} from "./distanceReadings";

const BARE: DistanceReading = {
  method: "marker-camera",
  rawValue: 50.2,
  baselineRatio: 1.02,
  absoluteMm: 3060,
  flagged: false,
  capturedAtIso: "2026-11-07T12:00:00.000Z",
};

beforeEach(() => {
  calls.length = 0;
  nextResponse = { data: 2, error: null, status: 200 };
});

describe("distance readings payload", () => {
  it("has the six required keys and no optional keys when they are absent", () => {
    const payload = distanceReadingPayload(BARE);
    expect(payload).toEqual({
      method: "marker-camera",
      raw_value: 50.2,
      baseline_ratio: 1.02,
      absolute_mm: 3060,
      flagged: false,
      captured_at: "2026-11-07T12:00:00.000Z",
    });
    expect(Object.keys(payload).sort()).toEqual(
      ["absolute_mm", "baseline_ratio", "captured_at", "flagged", "method", "raw_value"],
    );
  });

  it("adds confidence and presentation_id only when given", () => {
    const payload = distanceReadingPayload({ ...BARE, confidence: 0.9, presentationId: "p-1" });
    expect(payload.confidence).toBe(0.9);
    expect(payload.presentation_id).toBe("p-1");
  });

  it("refuses an empty batch and a batch over 50, and allows exactly 50", () => {
    expect(buildDistanceReadingsPayload([])).toMatchObject({ ok: false, error: { kind: "batch-refused", code: "V0008" } });
    expect(buildDistanceReadingsPayload(Array.from({ length: 51 }, () => BARE))).toMatchObject({
      ok: false,
      error: { kind: "batch-refused" },
    });
    expect(buildDistanceReadingsPayload(Array.from({ length: 50 }, () => BARE)).ok).toBe(true);
  });
});

describe("recordDistanceReadings", () => {
  it("a batch over 50 is refused before any call", async () => {
    const result = await recordDistanceReadings("s-1", Array.from({ length: 51 }, () => BARE));
    expect(result).toMatchObject({ ok: false, error: { kind: "batch-refused", code: "V0008" } });
    expect(calls).toEqual([]);
  });

  it("sends the session id and the built payload, and returns the row count", async () => {
    const result = await recordDistanceReadings("s-1", [BARE, { ...BARE, presentationId: "p-1" }]);
    expect(result).toEqual({ ok: true, data: 2 });
    expect(calls).toEqual([
      [
        "vcp_record_distance_readings",
        {
          p_session_id: "s-1",
          p_readings: [distanceReadingPayload(BARE), distanceReadingPayload({ ...BARE, presentationId: "p-1" })],
        },
      ],
    ]);
  });

  it("maps a server V0008 to batch-refused and V0003 to presentation-not-in-session", async () => {
    nextResponse = { data: null, error: { code: "V0008", message: "closed" }, status: 400 };
    expect(await recordDistanceReadings("s-1", [BARE])).toMatchObject({ ok: false, error: { kind: "batch-refused" } });
    nextResponse = { data: null, error: { code: "V0003", message: "other session" }, status: 400 };
    expect(await recordDistanceReadings("s-1", [BARE])).toMatchObject({
      ok: false,
      error: { kind: "presentation-not-in-session" },
    });
  });
});

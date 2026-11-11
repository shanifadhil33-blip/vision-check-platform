import { describe, expect, it } from "vitest";
import {
  distanceBroadcast,
  initialDistanceStream,
  parseBaselineBroadcast,
  parseDistanceBroadcast,
  parseUnavailableBroadcast,
  receiveDistance,
} from "./broadcast";

const AT_MS = Date.parse("2026-11-11T10:00:00.250Z");

describe("distance broadcast payload", () => {
  it("found: carries seq, ratio, sizePx, capturedAt ISO and found", () => {
    expect(distanceBroadcast({ seq: 7, ratio: 1.02, sizePx: 89.3, capturedAtMs: AT_MS })).toEqual({
      seq: 7,
      ratio: 1.02,
      sizePx: 89.3,
      capturedAt: "2026-11-11T10:00:00.250Z",
      found: true,
    });
  });

  it("not found: ratio and sizePx are null", () => {
    expect(distanceBroadcast({ seq: 8, ratio: null, sizePx: 91, capturedAtMs: AT_MS })).toEqual({
      seq: 8,
      ratio: null,
      sizePx: null,
      capturedAt: "2026-11-11T10:00:00.250Z",
      found: false,
    });
  });

  it("round-trips through the parser", () => {
    const built = distanceBroadcast({ seq: 9, ratio: 0.97, sizePx: 93.8, capturedAtMs: AT_MS });
    expect(parseDistanceBroadcast(JSON.parse(JSON.stringify(built)))).toEqual(built);
  });

  it("refuses bad payloads", () => {
    const good = { seq: 1, ratio: 1, sizePx: 90, capturedAt: "2026-11-11T10:00:00.250Z", found: true };
    for (const bad of [
      null,
      [],
      { ...good, seq: -1 },
      { ...good, seq: 1.5 },
      { ...good, seq: "1" },
      { ...good, ratio: 0 },
      { ...good, ratio: Number.NaN },
      { ...good, sizePx: -3 },
      { ...good, capturedAt: "yesterday" },
      { ...good, found: "yes" },
      { ...good, found: false },
    ]) {
      expect(parseDistanceBroadcast(bad)).toBeNull();
    }
  });
});

describe("main screen distance stream", () => {
  it("ignores out-of-order, repeated and malformed readings", () => {
    let stream = initialDistanceStream();
    const taken: number[] = [];
    const raws: unknown[] = [
      { seq: 100, ratio: 1, sizePx: 90, capturedAt: "2026-11-11T10:00:00.000Z", found: true },
      { seq: 99, ratio: 1, sizePx: 90, capturedAt: "2026-11-11T09:59:59.750Z", found: true },
      { seq: 100, ratio: 1, sizePx: 90, capturedAt: "2026-11-11T10:00:00.000Z", found: true },
      { seq: 101, ratio: "1", sizePx: 90, capturedAt: "2026-11-11T10:00:00.250Z", found: true },
      { seq: 102, ratio: null, sizePx: null, capturedAt: "2026-11-11T10:00:00.500Z", found: false },
      { seq: 103, ratio: 1.01, sizePx: 89, capturedAt: "2026-11-11T10:00:00.750Z", found: true },
    ];
    for (const raw of raws) {
      const result = receiveDistance(stream, raw);
      stream = result.stream;
      if (result.reading !== null) {
        taken.push(result.reading.seq);
      }
    }
    expect(taken).toEqual([100, 102, 103]);
    expect(stream.lastSeq).toBe(103);
  });
});

describe("baseline and unavailable payloads", () => {
  it("parse good ones and refuse bad ones", () => {
    expect(parseBaselineBroadcast({ baselinePx: 91.2, frames: 30 })).toEqual({ baselinePx: 91.2, frames: 30 });
    expect(parseBaselineBroadcast({ baselinePx: 0, frames: 30 })).toBeNull();
    expect(parseBaselineBroadcast({ baselinePx: 91, frames: 0 })).toBeNull();
    expect(parseUnavailableBroadcast({ reason: "camera_refused" })).toEqual({ reason: "camera_refused" });
    expect(parseUnavailableBroadcast({ reason: "<script>" })).toBeNull();
  });
});

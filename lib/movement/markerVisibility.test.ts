import { describe, expect, it } from "vitest";
import {
  initialMarkerVisibilityStream,
  MARKER_VISIBILITY_EVENT,
  markerVisibilityBroadcast,
  parseMarkerVisibilityBroadcast,
  PHONE_BROADCAST_EVENTS,
  receiveMarkerVisibility,
} from "./broadcast";
import { MARKER_HIDDEN_MAX_MS, phoneMovementStatus } from "./phoneTracking";

describe("marker_visibility payload", () => {
  it("carries visible and seq, and round-trips through the parser", () => {
    expect(MARKER_VISIBILITY_EVENT).toBe("marker_visibility");
    expect(PHONE_BROADCAST_EVENTS).toEqual(["marker_visibility"]);
    const hidden = markerVisibilityBroadcast({ visible: false, seq: 41 });
    expect(hidden).toEqual({ visible: false, seq: 41 });
    expect(markerVisibilityBroadcast({ visible: true, seq: 42 })).toEqual({ visible: true, seq: 42 });
    expect(parseMarkerVisibilityBroadcast(JSON.parse(JSON.stringify(hidden)))).toEqual(hidden);
  });

  it("refuses bad payloads", () => {
    expect(parseMarkerVisibilityBroadcast({ visible: true, seq: 0 })).toEqual({ visible: true, seq: 0 });
    for (const bad of [
      null,
      undefined,
      "visible",
      [true, 1],
      {},
      { seq: 1 },
      { visible: "false", seq: 1 },
      { visible: 0, seq: 1 },
      { visible: false },
      { visible: false, seq: -1 },
      { visible: false, seq: 1.5 },
      { visible: false, seq: Number.NaN },
      { visible: false, seq: "1" },
    ]) {
      expect(parseMarkerVisibilityBroadcast(bad)).toBeNull();
    }
  });

  it("the stream ignores late, repeated and malformed payloads", () => {
    let stream = initialMarkerVisibilityStream();
    let received = receiveMarkerVisibility(stream, { visible: false, seq: 10 });
    expect(received.visibility).toEqual({ visible: false, seq: 10 });
    stream = received.stream;
    received = receiveMarkerVisibility(stream, { visible: true, seq: 10 });
    expect(received).toEqual({ stream: { lastSeq: 10 }, visibility: null });
    received = receiveMarkerVisibility(stream, { visible: true, seq: 9 });
    expect(received).toEqual({ stream: { lastSeq: 10 }, visibility: null });
    received = receiveMarkerVisibility(stream, { visible: "yes", seq: 11 });
    expect(received).toEqual({ stream: { lastSeq: 10 }, visibility: null });
    received = receiveMarkerVisibility(stream, { visible: true, seq: 11 });
    expect(received).toEqual({ stream: { lastSeq: 11 }, visibility: { visible: true, seq: 11 } });
  });
});

describe("phone status with the marker hidden on purpose", () => {
  it("ok while hidden, even with no marker and a far ratio; the flag is ignored from 10 s on", () => {
    expect(MARKER_HIDDEN_MAX_MS).toBe(10_000);
    const base = { lastFoundAtMs: 0, latestRatio: 1.5, markerHiddenAtMs: 1000 };
    expect(phoneMovementStatus({ ...base, nowMs: 1000 + 9999 })).toBe("ok");
    expect(phoneMovementStatus({ ...base, nowMs: 1000 + 10_000 })).toBe("lost");
    expect(phoneMovementStatus({ nowMs: 5, lastFoundAtMs: null, latestRatio: null, markerHiddenAtMs: 0 })).toBe("ok");
  });

  it("shown again: the lost clock restarts when the marker came back", () => {
    const base = { lastFoundAtMs: 0, latestRatio: 1, markerHiddenAtMs: null, markerShownAtMs: 6000 };
    expect(phoneMovementStatus({ ...base, nowMs: 7999 })).toBe("ok");
    expect(phoneMovementStatus({ ...base, nowMs: 8000 })).toBe("lost");
    // A marker found after it came back counts from then.
    expect(phoneMovementStatus({ ...base, lastFoundAtMs: 7000, nowMs: 8999 })).toBe("ok");
  });
});

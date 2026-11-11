/**
 * The three broadcasts the phone sends on the session channel, and the
 * main screen's checks on what arrives. Pure: payloads in, payloads out.
 * Broadcasts are not stored and may be lost or arrive out of order.
 */

export const DISTANCE_EVENT = "distance";
export const DISTANCE_BASELINE_EVENT = "distance_baseline";
export const DISTANCE_UNAVAILABLE_EVENT = "distance_unavailable";

export const MOVEMENT_BROADCAST_EVENTS = [
  DISTANCE_EVENT,
  DISTANCE_BASELINE_EVENT,
  DISTANCE_UNAVAILABLE_EVENT,
] as const;

export type DistanceBroadcast = {
  seq: number;
  /** baseline px / current px; null when the marker was not found. */
  ratio: number | null;
  /** Refined marker side in camera px; null when not found. */
  sizePx: number | null;
  /** When the phone took the frame, ISO. */
  capturedAt: string;
  found: boolean;
};

export type BaselineBroadcast = { baselinePx: number; frames: number };

export const UNAVAILABLE_REASONS = [
  "camera_refused",
  "no_camera",
  "no_rear_camera",
  "camera_error",
  "no_marker",
  "no_baseline",
  "baseline_lost",
  "camera_changed",
] as const;

export type UnavailableReason = (typeof UNAVAILABLE_REASONS)[number];

export type UnavailableBroadcast = { reason: UnavailableReason };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function distanceBroadcast(input: {
  seq: number;
  ratio: number | null;
  sizePx: number | null;
  capturedAtMs: number;
}): DistanceBroadcast {
  const found = input.ratio !== null && input.sizePx !== null;
  return {
    seq: input.seq,
    ratio: found ? input.ratio : null,
    sizePx: found ? input.sizePx : null,
    capturedAt: new Date(input.capturedAtMs).toISOString(),
    found,
  };
}

/** Null for anything that is not exactly a distance broadcast. */
export function parseDistanceBroadcast(value: unknown): DistanceBroadcast | null {
  if (!isRecord(value)) {
    return null;
  }
  const { seq, ratio, sizePx, capturedAt, found } = value;
  if (typeof seq !== "number" || !Number.isSafeInteger(seq) || seq < 0) {
    return null;
  }
  if (typeof found !== "boolean" || typeof capturedAt !== "string") {
    return null;
  }
  if (!Number.isFinite(Date.parse(capturedAt))) {
    return null;
  }
  if (found) {
    if (!isPositiveFinite(ratio) || !isPositiveFinite(sizePx)) {
      return null;
    }
    return { seq, ratio, sizePx, capturedAt, found };
  }
  if (ratio !== null || sizePx !== null) {
    return null;
  }
  return { seq, ratio: null, sizePx: null, capturedAt, found };
}

export function parseBaselineBroadcast(value: unknown): BaselineBroadcast | null {
  if (!isRecord(value)) {
    return null;
  }
  const { baselinePx, frames } = value;
  if (!isPositiveFinite(baselinePx) || typeof frames !== "number" || !Number.isSafeInteger(frames) || frames < 1) {
    return null;
  }
  return { baselinePx, frames };
}

export function parseUnavailableBroadcast(value: unknown): UnavailableBroadcast | null {
  if (!isRecord(value)) {
    return null;
  }
  const reason = value.reason;
  if (typeof reason !== "string" || !(UNAVAILABLE_REASONS as readonly string[]).includes(reason)) {
    return null;
  }
  return { reason: reason as UnavailableReason };
}

/** The main screen's memory of the distance stream: the highest sequence number taken. */
export type DistanceStream = { lastSeq: number | null };

export function initialDistanceStream(): DistanceStream {
  return { lastSeq: null };
}

/**
 * Takes one raw distance payload. A malformed payload, or one whose seq is
 * not above every seq taken so far (late, repeated), is ignored.
 */
export function receiveDistance(
  stream: DistanceStream,
  raw: unknown,
): { stream: DistanceStream; reading: DistanceBroadcast | null } {
  const reading = parseDistanceBroadcast(raw);
  if (reading === null) {
    return { stream, reading: null };
  }
  if (stream.lastSeq !== null && reading.seq <= stream.lastSeq) {
    return { stream, reading: null };
  }
  return { stream: { lastSeq: reading.seq }, reading };
}

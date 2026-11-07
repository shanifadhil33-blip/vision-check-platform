/**
 * Client wrapper for public.vcp_record_distance_readings, added by migration
 * 20261107120000_vcp_distance_readings. Kept in its own file so rpc.ts,
 * payloads.ts and types.ts stay untouched. Same anon-key browser client.
 *
 * Custom SQLSTATEs this function raises:
 *   V0001 session not found
 *   V0003 a presentation_id not in this session
 *   V0004 a required key missing
 *   V0008 batch refused: not an array, empty, over 50, or the session is
 *         complete or abandoned
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "./client";
import { classifyPostgrestFailure, classifyThrown, unexpectedShape, type VcpError } from "./errors";
import type { Database } from "./types";

export const MAX_DISTANCE_READINGS_PER_BATCH = 50;

/** The methods allowed by distance_events_method_chk. */
export type DistanceMethod =
  | "marker-camera"
  | "motion-sensor"
  | "webcam-ipd"
  | "catch-trial"
  | "manual-setup";

export type DistanceReading = {
  method: DistanceMethod;
  /** The measured size the estimate came from, for example marker side in camera px. */
  rawValue: number;
  /** Baseline size / current size. */
  baselineRatio: number;
  absoluteMm: number;
  flagged: boolean;
  capturedAtIso: string;
  confidence?: number;
  presentationId?: string;
};

/** One element of p_readings, exactly as the function reads it. */
export type DistanceReadingPayload = {
  method: string;
  raw_value: number;
  baseline_ratio: number;
  absolute_mm: number;
  flagged: boolean;
  captured_at: string;
  confidence?: number;
  presentation_id?: string;
};

export type BatchRefusal = {
  kind: "batch-refused";
  code: "V0008";
  httpStatus: number | null;
  message: string;
  retryable: false;
};

export type DistanceReadingsResult =
  | { ok: true; data: number }
  | { ok: false; error: VcpError | BatchRefusal };

function batchRefusal(message: string, httpStatus: number | null): BatchRefusal {
  return { kind: "batch-refused", code: "V0008", httpStatus, message, retryable: false };
}

/** Pure. Required keys always; optional keys only when present. */
export function distanceReadingPayload(reading: DistanceReading): DistanceReadingPayload {
  const payload: DistanceReadingPayload = {
    method: reading.method,
    raw_value: reading.rawValue,
    baseline_ratio: reading.baselineRatio,
    absolute_mm: reading.absoluteMm,
    flagged: reading.flagged,
    captured_at: reading.capturedAtIso,
  };
  if (reading.confidence !== undefined) {
    payload.confidence = reading.confidence;
  }
  if (reading.presentationId !== undefined) {
    payload.presentation_id = reading.presentationId;
  }
  return payload;
}

/** Pure. Refuses an empty batch or one over 50 before anything is sent. */
export function buildDistanceReadingsPayload(
  readings: readonly DistanceReading[],
): { ok: true; payload: DistanceReadingPayload[] } | { ok: false; error: BatchRefusal } {
  if (readings.length === 0) {
    return { ok: false, error: batchRefusal("Distance readings refused: empty batch", null) };
  }
  if (readings.length > MAX_DISTANCE_READINGS_PER_BATCH) {
    return {
      ok: false,
      error: batchRefusal(
        `Distance readings refused: ${readings.length} readings, at most ${MAX_DISTANCE_READINGS_PER_BATCH}`,
        null,
      ),
    };
  }
  return { ok: true, payload: readings.map(distanceReadingPayload) };
}

type DistanceFunctions = {
  vcp_record_distance_readings: {
    Args: { p_session_id: string; p_readings: DistanceReadingPayload[] };
    Returns: number;
  };
};

type DistanceDatabase = {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & DistanceFunctions;
  };
};

function distanceClient(): SupabaseClient<DistanceDatabase> {
  return getSupabaseBrowserClient() as unknown as SupabaseClient<DistanceDatabase>;
}

/** Saves 1 to 50 readings in one call. Resolves to the number of rows inserted. */
export async function recordDistanceReadings(
  sessionId: string,
  readings: readonly DistanceReading[],
): Promise<DistanceReadingsResult> {
  const built = buildDistanceReadingsPayload(readings);
  if (!built.ok) {
    return built;
  }
  try {
    const { data, error, status } = await distanceClient().rpc("vcp_record_distance_readings", {
      p_session_id: sessionId,
      p_readings: built.payload,
    });
    if (error) {
      const classified = classifyPostgrestFailure(error, status);
      if (classified.code === "V0008") {
        return { ok: false, error: batchRefusal(classified.message, classified.httpStatus) };
      }
      return { ok: false, error: classified };
    }
    if (typeof data !== "number" || !Number.isInteger(data) || data < 0) {
      return {
        ok: false,
        error: unexpectedShape("vcp_record_distance_readings returned an unexpected shape"),
      };
    }
    return { ok: true, data };
  } catch (thrown) {
    return { ok: false, error: classifyThrown(thrown) };
  }
}

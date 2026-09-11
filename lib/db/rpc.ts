import type { Calibration } from "@/lib/calibration";
import { getSupabaseBrowserClient } from "./client";
import {
  classifyPostgrestFailure,
  classifyThrown,
  unexpectedShape,
  type VcpError,
} from "./errors";
import {
  parseSessionView,
  parseSubmitResult,
  parseVersionedStatus,
  type PresentationPayload,
  type ResponseChoice,
  type SessionStatus,
  type SessionView,
  type SubmitResult,
  type VersionedStatus,
} from "./payloads";
import type { Json } from "./types";

export type RpcResult<T> = { ok: true; data: T } | { ok: false; error: VcpError };

async function callRpc<T>(
  run: () => PromiseLike<{
    data: unknown;
    error: unknown;
    status: number;
  }>,
  parse: (data: unknown) => T | null,
  emptyMessage: string,
): Promise<RpcResult<T>> {
  try {
    const { data, error, status } = await run();
    if (error) {
      return { ok: false, error: classifyPostgrestFailure(error, status) };
    }
    const parsed = parse(data);
    if (parsed === null) {
      return { ok: false, error: unexpectedShape(emptyMessage) };
    }
    return { ok: true, data: parsed };
  } catch (thrown) {
    return { ok: false, error: classifyThrown(thrown) };
  }
}

function parseUuid(data: unknown): string | null {
  return typeof data === "string" && data.length > 0 ? data : null;
}

function parseBoolean(data: unknown): boolean | null {
  return typeof data === "boolean" ? data : null;
}

export async function getSession(sessionId: string): Promise<RpcResult<SessionView>> {
  return callRpc(
    () =>
      getSupabaseBrowserClient().rpc("vcp_get_session", {
        p_session_id: sessionId,
      }),
    parseSessionView,
    "vcp_get_session returned an unexpected shape",
  );
}

export async function createSession(args: {
  distanceMmRequested: number;
  clientBuild: string | null;
}): Promise<RpcResult<string>> {
  return callRpc(
    () =>
      getSupabaseBrowserClient().rpc("vcp_create_session", {
        p_distance_mm_requested: args.distanceMmRequested,
        p_client_build: args.clientBuild,
      }),
    parseUuid,
    "vcp_create_session returned an unexpected shape",
  );
}

export async function pairSession(args: {
  sessionId: string;
  expectedVersion: number;
}): Promise<RpcResult<VersionedStatus>> {
  return callRpc(
    () =>
      getSupabaseBrowserClient().rpc("vcp_pair_session", {
        p_session_id: args.sessionId,
        p_expected_version: args.expectedVersion,
      }),
    parseVersionedStatus,
    "vcp_pair_session returned an unexpected shape",
  );
}

export async function setSessionState(args: {
  sessionId: string;
  expectedVersion: number;
  status: SessionStatus;
  currentState: Json;
}): Promise<RpcResult<VersionedStatus>> {
  return callRpc(
    () =>
      getSupabaseBrowserClient().rpc("vcp_set_session_state", {
        p_session_id: args.sessionId,
        p_expected_version: args.expectedVersion,
        p_status: args.status,
        p_current_state: args.currentState,
      }),
    parseVersionedStatus,
    "vcp_set_session_state returned an unexpected shape",
  );
}

export async function attachCalibration(args: {
  sessionId: string;
  calibration: Calibration;
}): Promise<RpcResult<string>> {
  return callRpc(
    () =>
      getSupabaseBrowserClient().rpc("vcp_attach_calibration", {
        p_session_id: args.sessionId,
        p_calibration: args.calibration,
      }),
    parseUuid,
    "vcp_attach_calibration returned an unexpected shape",
  );
}

export async function recordPresentation(args: {
  sessionId: string;
  presentation: PresentationPayload;
}): Promise<RpcResult<string>> {
  return callRpc(
    () =>
      getSupabaseBrowserClient().rpc("vcp_record_presentation", {
        p_session_id: args.sessionId,
        p_presentation: args.presentation,
      }),
    parseUuid,
    "vcp_record_presentation returned an unexpected shape",
  );
}

export async function recordRendered(args: {
  sessionId: string;
  presentationId: string;
  actualLetterHeightDevicePx: number;
  actualStrokeWidthDevicePx: number | null;
  renderedAtIso: string;
}): Promise<RpcResult<boolean>> {
  return callRpc(
    () =>
      getSupabaseBrowserClient().rpc("vcp_record_rendered", {
        p_session_id: args.sessionId,
        p_presentation_id: args.presentationId,
        p_actual_letter_height_device_px: args.actualLetterHeightDevicePx,
        p_actual_stroke_width_device_px: args.actualStrokeWidthDevicePx,
        p_rendered_at: args.renderedAtIso,
      }),
    parseBoolean,
    "vcp_record_rendered returned an unexpected shape",
  );
}

export async function submitResponse(args: {
  sessionId: string;
  presentationId: string;
  clientRequestId: string;
  choice: ResponseChoice;
  respondedAtIso: string;
  latencyMs: number | null;
}): Promise<RpcResult<SubmitResult>> {
  const responseKind = args.choice.kind === "letter" ? "letter" : "not_sure";
  const responseLetter = args.choice.kind === "letter" ? args.choice.letter : null;
  return callRpc(
    () =>
      getSupabaseBrowserClient().rpc("vcp_submit_response", {
        p_session_id: args.sessionId,
        p_presentation_id: args.presentationId,
        p_client_request_id: args.clientRequestId,
        p_response_kind: responseKind,
        p_response_letter: responseLetter,
        p_responded_at: args.respondedAtIso,
        p_latency_ms: args.latencyMs,
      }),
    parseSubmitResult,
    "vcp_submit_response returned an unexpected shape",
  );
}

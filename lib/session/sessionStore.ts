import type { Calibration } from "@/lib/calibration";
import {
  busyError,
  noSessionError,
  staleReadError,
  type VcpError,
} from "@/lib/db/errors";
import type { Json } from "@/lib/db/types";
import {
  appendEvent as rpcAppendEvent,
  attachCalibration as rpcAttachCalibration,
  createSession as rpcCreateSession,
  getSession as rpcGetSession,
  pairSession as rpcPairSession,
  recordPresentation as rpcRecordPresentation,
  setSessionState as rpcSetSessionState,
  submitResponse as rpcSubmitResponse,
  type RpcResult,
} from "@/lib/db/rpc";
import type {
  PresentationPayload,
  ResponseChoice,
  SessionStatus,
  SessionView,
} from "@/lib/db/payloads";
import { newClientRequestId } from "./clientRequestId";

export type ResponseEntry = {
  clientRequestId: string;
  choice: ResponseChoice;
  respondedAtIso: string;
  latencyMs: number | null;
  state: "pending" | "sent" | "failed";
  responseId: string | null;
  duplicate: boolean | null;
  error: VcpError | null;
  attempts: number;
};

export type SessionSnapshot = {
  sessionId: string | null;
  status: SessionStatus | null;
  version: number | null;
  calibrationId: string | null;
  lastError: VcpError | null;
  responses: Readonly<Record<string, ResponseEntry>>;
};

const SERVER_SNAPSHOT: SessionSnapshot = {
  sessionId: null,
  status: null,
  version: null,
  calibrationId: null,
  lastError: null,
  responses: {},
};

const listeners = new Set<() => void>();
let cachedSnapshot: SessionSnapshot = SERVER_SNAPSHOT;
let versionedCallInFlight = false;

const RETRY_WAITS_MS = [300, 1000] as const;
const MAX_SUBMIT_ATTEMPTS = 3;

function emit(next: SessionSnapshot): void {
  cachedSnapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

function patch(partial: Partial<SessionSnapshot>): void {
  emit({
    ...cachedSnapshot,
    ...partial,
  });
}

function adoptSessionView(view: SessionView, extras?: Partial<SessionSnapshot>): void {
  emit({
    ...cachedSnapshot,
    sessionId: view.id,
    status: view.status,
    version: view.version,
    lastError: null,
    ...extras,
  });
}

function setLastError(error: VcpError): void {
  patch({ lastError: error });
}

async function sleep(ms: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): SessionSnapshot {
  return cachedSnapshot;
}

export function getServerSnapshot(): SessionSnapshot {
  return SERVER_SNAPSHOT;
}

export async function createSession(args: {
  distanceMmRequested: number;
  clientBuild: string | null;
}): Promise<RpcResult<SessionView>> {
  const created = await rpcCreateSession({
    distanceMmRequested: args.distanceMmRequested,
    clientBuild: args.clientBuild,
  });
  if (!created.ok) {
    setLastError(created.error);
    return created;
  }

  const loaded = await rpcGetSession(created.data);
  if (!loaded.ok) {
    setLastError(loaded.error);
    return loaded;
  }

  adoptSessionView(loaded.data, { calibrationId: null, responses: {} });
  return loaded;
}

export async function loadSession(sessionId: string): Promise<RpcResult<SessionView>> {
  const loaded = await rpcGetSession(sessionId);
  if (!loaded.ok) {
    setLastError(loaded.error);
    return loaded;
  }
  const sameId = cachedSnapshot.sessionId === loaded.data.id;
  if (
    sameId &&
    cachedSnapshot.version !== null &&
    loaded.data.version < cachedSnapshot.version
  ) {
    return { ok: false, error: staleReadError() };
  }
  if (sameId) {
    adoptSessionView(loaded.data);
  } else {
    adoptSessionView(loaded.data, { calibrationId: null, responses: {} });
  }
  return loaded;
}

export async function attachCalibration(
  calibration: Calibration,
): Promise<RpcResult<string>> {
  const sessionId = cachedSnapshot.sessionId;
  if (sessionId === null) {
    const error = noSessionError();
    setLastError(error);
    return { ok: false, error };
  }

  const result = await rpcAttachCalibration({ sessionId, calibration });
  if (!result.ok) {
    setLastError(result.error);
    return result;
  }

  patch({ calibrationId: result.data, lastError: null });
  return result;
}

export async function pair(): Promise<RpcResult<{ status: SessionStatus; version: number }>> {
  if (versionedCallInFlight) {
    const error = busyError();
    setLastError(error);
    return { ok: false, error };
  }

  const sessionId = cachedSnapshot.sessionId;
  const expectedVersion = cachedSnapshot.version;
  if (sessionId === null || expectedVersion === null) {
    const error = noSessionError();
    setLastError(error);
    return { ok: false, error };
  }

  versionedCallInFlight = true;
  try {
    const result = await rpcPairSession({ sessionId, expectedVersion });
    if (!result.ok) {
      if (result.error.kind === "version-conflict") {
        const refreshed = await rpcGetSession(sessionId);
        if (refreshed.ok) {
          adoptSessionView(refreshed.data);
        }
      }
      setLastError(result.error);
      return result;
    }

    patch({
      status: result.data.status,
      version: result.data.version,
      lastError: null,
    });
    return result;
  } finally {
    versionedCallInFlight = false;
  }
}

export async function setState(
  status: SessionStatus,
  currentState: Json,
): Promise<RpcResult<{ status: SessionStatus; version: number }>> {
  if (versionedCallInFlight) {
    const error = busyError();
    setLastError(error);
    return { ok: false, error };
  }

  const sessionId = cachedSnapshot.sessionId;
  const expectedVersion = cachedSnapshot.version;
  if (sessionId === null || expectedVersion === null) {
    const error = noSessionError();
    setLastError(error);
    return { ok: false, error };
  }

  versionedCallInFlight = true;
  try {
    const result = await rpcSetSessionState({
      sessionId,
      expectedVersion,
      status,
      currentState,
    });
    if (!result.ok) {
      if (result.error.kind === "version-conflict") {
        const refreshed = await rpcGetSession(sessionId);
        if (refreshed.ok) {
          adoptSessionView(refreshed.data);
        }
      }
      setLastError(result.error);
      return result;
    }

    patch({
      status: result.data.status,
      version: result.data.version,
      lastError: null,
    });
    return result;
  } finally {
    versionedCallInFlight = false;
  }
}

export async function recordPresentation(
  payload: PresentationPayload,
): Promise<RpcResult<string>> {
  const sessionId = cachedSnapshot.sessionId;
  if (sessionId === null) {
    const error = noSessionError();
    setLastError(error);
    return { ok: false, error };
  }

  const result = await rpcRecordPresentation({
    sessionId,
    presentation: payload,
  });
  if (!result.ok) {
    setLastError(result.error);
    return result;
  }

  patch({ lastError: null });
  return result;
}

export async function appendEvent(args: {
  type: string;
  payload: Json;
}): Promise<RpcResult<string>> {
  const sessionId = cachedSnapshot.sessionId;
  if (sessionId === null) {
    const error = noSessionError();
    setLastError(error);
    return { ok: false, error };
  }

  const result = await rpcAppendEvent({
    sessionId,
    type: args.type,
    payload: args.payload,
  });
  if (!result.ok) {
    setLastError(result.error);
    return result;
  }

  patch({ lastError: null });
  return result;
}

function upsertResponse(presentationId: string, entry: ResponseEntry): void {
  patch({
    responses: {
      ...cachedSnapshot.responses,
      [presentationId]: entry,
    },
    lastError: entry.error,
  });
}

/**
 * Single send path for first submit and failed-entry resend.
 * Reuses entry.clientRequestId, choice, respondedAtIso and latencyMs.
 * increments attempts on each try.
 */
async function sendResponseEntry(
  sessionId: string,
  presentationId: string,
  entry: ResponseEntry,
): Promise<RpcResult<ResponseEntry>> {
  let lastError: VcpError | null = null;
  let working = entry;

  for (let round = 1; round <= MAX_SUBMIT_ATTEMPTS; round += 1) {
    const pending: ResponseEntry = {
      ...working,
      attempts: working.attempts + 1,
      state: "pending",
      error: null,
    };
    upsertResponse(presentationId, pending);
    working = pending;

    const result = await rpcSubmitResponse({
      sessionId,
      presentationId,
      clientRequestId: working.clientRequestId,
      choice: working.choice,
      respondedAtIso: working.respondedAtIso,
      latencyMs: working.latencyMs,
    });

    if (result.ok) {
      const sent: ResponseEntry = {
        ...working,
        state: "sent",
        responseId: result.data.id,
        duplicate: result.data.duplicate,
        error: null,
      };
      upsertResponse(presentationId, sent);
      patch({ lastError: null });
      return { ok: true, data: sent };
    }

    lastError = result.error;
    const failed: ResponseEntry = {
      ...working,
      state: "failed",
      error: result.error,
    };
    upsertResponse(presentationId, failed);
    working = failed;

    const canRetry = result.error.retryable && round < MAX_SUBMIT_ATTEMPTS;
    if (!canRetry) {
      setLastError(result.error);
      return { ok: false, error: result.error };
    }

    const waitIndex = round - 1;
    const waitMs = RETRY_WAITS_MS[waitIndex] ?? 1000;
    await sleep(waitMs);
  }

  const fallback = lastError ?? noSessionError();
  setLastError(fallback);
  return { ok: false, error: fallback };
}

export async function submitResponse(
  presentationId: string,
  choice: ResponseChoice,
  latencyMs: number | null,
): Promise<RpcResult<ResponseEntry>> {
  const existing = cachedSnapshot.responses[presentationId];
  if (existing !== undefined) {
    if (existing.state === "sent" || existing.state === "pending") {
      return { ok: true, data: existing };
    }

    const sessionId = cachedSnapshot.sessionId;
    if (sessionId === null) {
      const error = noSessionError();
      setLastError(error);
      return { ok: false, error };
    }
    // failed: resend same entry; ignore new choice and latencyMs.
    return sendResponseEntry(sessionId, presentationId, existing);
  }

  const sessionId = cachedSnapshot.sessionId;
  if (sessionId === null) {
    const error = noSessionError();
    setLastError(error);
    return { ok: false, error };
  }

  const entry: ResponseEntry = {
    clientRequestId: newClientRequestId(),
    choice,
    respondedAtIso: new Date().toISOString(),
    latencyMs,
    state: "pending",
    responseId: null,
    duplicate: null,
    error: null,
    attempts: 0,
  };
  upsertResponse(presentationId, entry);
  return sendResponseEntry(sessionId, presentationId, entry);
}

export function reset(): RpcResult<null> {
  versionedCallInFlight = false;
  emit({
    sessionId: null,
    status: null,
    version: null,
    calibrationId: null,
    lastError: null,
    responses: {},
  });
  return { ok: true, data: null };
}

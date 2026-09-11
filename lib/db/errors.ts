/**
 * Classifies PostgREST / Postgres errors and client-side failures.
 *
 * Fetch failures with throwOnError off (the default) do not throw: they are
 * returned as { error: { message, details, hint, code: '' }, data: null,
 * status: 0 } from PostgrestBuilder.then — see
 * node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts around the
 * res.catch path that builds that object. Thrown errors still happen for
 * missing env vars from getSupabaseBrowserClient.
 */

export type VcpErrorKind =
  | "session-not-found"
  | "version-conflict"
  | "presentation-not-in-session"
  | "missing-key"
  | "presentation-not-updated"
  | "submission-in-flight"
  | "check-violation"
  | "not-null-violation"
  | "unique-violation"
  | "permission-denied"
  | "function-not-found"
  | "network"
  | "not-configured"
  | "unexpected-shape"
  | "no-session"
  | "busy"
  | "stale-read"
  | "unknown";

export type VcpError = {
  kind: VcpErrorKind;
  code: string | null;
  httpStatus: number | null;
  message: string;
  retryable: boolean;
};

function kindFromCode(code: string): VcpErrorKind | null {
  switch (code) {
    case "V0001":
      return "session-not-found";
    case "V0002":
      return "version-conflict";
    case "V0003":
      return "presentation-not-in-session";
    case "V0004":
      return "missing-key";
    case "V0005":
      return "presentation-not-updated";
    case "V0006":
      return "submission-in-flight";
    case "23514":
      return "check-violation";
    case "23502":
      return "not-null-violation";
    case "23505":
      return "unique-violation";
    case "42501":
      return "permission-denied";
    case "PGRST202":
    case "42883":
      return "function-not-found";
    default:
      return null;
  }
}

function isRetryable(kind: VcpErrorKind): boolean {
  return kind === "submission-in-flight" || kind === "network";
}

function makeError(
  kind: VcpErrorKind,
  code: string | null,
  httpStatus: number | null,
  message: string,
): VcpError {
  return {
    kind,
    code,
    httpStatus,
    message,
    retryable: isRetryable(kind),
  };
}

function isErrorLike(value: unknown): value is {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
} {
  return value !== null && typeof value === "object";
}

/**
 * Classify a PostgREST error object (returned, not thrown) plus HTTP status.
 */
export function classifyPostgrestFailure(
  error: unknown,
  httpStatus: number | null,
): VcpError {
  if (!isErrorLike(error)) {
    return makeError("unknown", null, httpStatus, "Unknown PostgREST failure");
  }

  const message =
    typeof error.message === "string" && error.message.length > 0
      ? error.message
      : "Request failed";
  const code = typeof error.code === "string" && error.code.length > 0 ? error.code : null;

  // Fetch failure path: status 0 and empty code (PostgrestBuilder catch).
  if (httpStatus === 0 || (httpStatus === null && code === null && message.startsWith("FetchError"))) {
    return makeError("network", code, httpStatus === null ? 0 : httpStatus, message);
  }

  if (code !== null) {
    const kind = kindFromCode(code);
    if (kind !== null) {
      return makeError(kind, code, httpStatus, message);
    }
  }

  return makeError("unknown", code, httpStatus, message);
}

/**
 * Classify a thrown value (e.g. missing env from getSupabaseBrowserClient).
 */
export function classifyThrown(thrown: unknown): VcpError {
  if (thrown instanceof Error) {
    if (
      thrown.message.includes("NEXT_PUBLIC_SUPABASE_URL") ||
      thrown.message.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY")
    ) {
      return makeError("not-configured", null, null, thrown.message);
    }
    if (thrown.name === "TypeError" || thrown.message.toLowerCase().includes("fetch")) {
      return makeError("network", null, null, thrown.message);
    }
    return makeError("unknown", null, null, thrown.message);
  }
  return makeError("unknown", null, null, "Unknown thrown failure");
}

export function unexpectedShape(message: string): VcpError {
  return makeError("unexpected-shape", null, 200, message);
}

export function noSessionError(): VcpError {
  return makeError("no-session", null, null, "No session in the store");
}

export function busyError(): VcpError {
  return makeError("busy", null, null, "A pair or set-state call is already in flight");
}

export function staleReadError(): VcpError {
  return makeError(
    "stale-read",
    null,
    null,
    "Loaded session version is older than the store; discarded",
  );
}

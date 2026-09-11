import { SLOAN_LETTERS, type SloanLetter } from "@/lib/acuity";
import type { Json } from "./types";

export type Eye = "right" | "left" | "both";

export type PresentationFormat = "single" | "flanked-triplet" | "row";

export type SessionStatus =
  | "created"
  | "paired"
  | "running"
  | "paused"
  | "complete"
  | "abandoned";

/**
 * Snake_case keys matching vcp_record_presentation. Optional keys are omitted
 * when absent — never send null for them.
 */
export type PresentationPayload = {
  trial_index: number;
  eye: Eye;
  logmar_step_index: number;
  requested_letter_height_mm: number;
  requested_stroke_width_mm: number;
  requested_letter_height_css_px: number;
  requested_letter_height_device_px: number;
  optotypes: SloanLetter[];
  target_index: number;
  format: PresentationFormat;
  distance_mm_requested: number;
  actual_letter_height_device_px?: number;
  actual_stroke_width_device_px?: number;
  crowding_spec?: { [key: string]: Json };
  distance_mm_observed?: number;
  rendered_at?: string;
  visibility_confirmed?: boolean;
};

export type ResponseChoice =
  | { kind: "letter"; letter: SloanLetter }
  | { kind: "not_sure" };

export type SessionView = {
  id: string;
  status: SessionStatus;
  version: number;
  currentState: Json;
  distanceMmRequested: number | null;
  createdAtIso: string;
  updatedAtIso: string;
};

export type VersionedStatus = {
  status: SessionStatus;
  version: number;
};

export type SubmitResult = {
  id: string;
  responseKind: "letter" | "not_sure";
  responseLetter: SloanLetter | null;
  duplicate: boolean;
};

const SESSION_STATUSES: ReadonlySet<string> = new Set([
  "created",
  "paired",
  "running",
  "paused",
  "complete",
  "abandoned",
]);

const SLOAN_SET: ReadonlySet<string> = new Set(SLOAN_LETTERS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSessionStatus(value: unknown): value is SessionStatus {
  return typeof value === "string" && SESSION_STATUSES.has(value);
}

function isSloanLetter(value: unknown): value is SloanLetter {
  return typeof value === "string" && SLOAN_SET.has(value);
}

function isJson(value: unknown): value is Json {
  if (value === null) {
    return true;
  }
  if (typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isJson);
  }
  if (isRecord(value)) {
    return Object.values(value).every((entry) => entry === undefined || isJson(entry));
  }
  return false;
}

export function parseSessionView(value: unknown): SessionView | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = value.id;
  const status = value.status;
  const version = value.version;
  const currentState = value.current_state;
  const distanceMmRequested = value.distance_mm_requested;
  const createdAtIso = value.created_at;
  const updatedAtIso = value.updated_at;

  if (typeof id !== "string") {
    return null;
  }
  if (!isSessionStatus(status)) {
    return null;
  }
  if (typeof version !== "number" || !Number.isInteger(version)) {
    return null;
  }
  if (!isJson(currentState)) {
    return null;
  }
  if (
    distanceMmRequested !== null &&
    (typeof distanceMmRequested !== "number" || !Number.isFinite(distanceMmRequested))
  ) {
    return null;
  }
  if (typeof createdAtIso !== "string" || typeof updatedAtIso !== "string") {
    return null;
  }

  return {
    id,
    status,
    version,
    currentState,
    distanceMmRequested,
    createdAtIso,
    updatedAtIso,
  };
}

export function parseVersionedStatus(value: unknown): VersionedStatus | null {
  if (!isRecord(value)) {
    return null;
  }
  const status = value.status;
  const version = value.version;
  if (!isSessionStatus(status)) {
    return null;
  }
  if (typeof version !== "number" || !Number.isInteger(version)) {
    return null;
  }
  return { status, version };
}

export function parseSubmitResult(value: unknown): SubmitResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const id = value.id;
  const responseKind = value.response_kind;
  const responseLetter = value.response_letter;
  const duplicate = value.duplicate;

  if (typeof id !== "string") {
    return null;
  }
  if (responseKind !== "letter" && responseKind !== "not_sure") {
    return null;
  }
  if (responseKind === "letter") {
    if (!isSloanLetter(responseLetter)) {
      return null;
    }
  } else if (responseLetter !== null) {
    return null;
  }
  if (typeof duplicate !== "boolean") {
    return null;
  }

  return {
    id,
    responseKind,
    responseLetter: responseKind === "letter" ? responseLetter : null,
    duplicate,
  };
}

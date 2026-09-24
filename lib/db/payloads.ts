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

/**
 * One answered trial from vcp_get_answered_trials. Snake_case in JSON;
 * camelCase after parse.
 */
export type AnsweredTrial = {
  presentationId: string;
  trialIndex: number;
  eye: Eye;
  logmarStepIndex: number;
  format: PresentationFormat;
  optotypes: SloanLetter[];
  targetIndex: number;
  requestedLetterHeightDevicePx: number;
  actualLetterHeightDevicePx: number | null;
  actualStrokeWidthDevicePx: number | null;
  visibilityConfirmed: boolean;
  renderedAt: string | null;
  responseKind: "letter" | "not_sure";
  responseLetter: SloanLetter | null;
  respondedAt: string;
  latencyMs: number | null;
  responseCount: number;
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

function isEye(value: unknown): value is Eye {
  return value === "right" || value === "left" || value === "both";
}

function isPresentationFormat(value: unknown): value is PresentationFormat {
  return value === "single" || value === "flanked-triplet" || value === "row";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInteger(value: unknown): value is number {
  return isFiniteNumber(value) && Number.isInteger(value);
}

function parseOptotypes(value: unknown): SloanLetter[] | null {
  if (!Array.isArray(value) || value.length < 1) {
    return null;
  }
  const letters: SloanLetter[] = [];
  for (const entry of value) {
    if (!isSloanLetter(entry)) {
      return null;
    }
    letters.push(entry);
  }
  return letters;
}

export function parseAnsweredTrial(value: unknown): AnsweredTrial | null {
  if (!isRecord(value)) {
    return null;
  }

  const presentationId = value.presentation_id;
  const trialIndex = value.trial_index;
  const eye = value.eye;
  const logmarStepIndex = value.logmar_step_index;
  const format = value.format;
  const optotypes = parseOptotypes(value.optotypes);
  const targetIndex = value.target_index;
  const requestedLetterHeightDevicePx = value.requested_letter_height_device_px;
  const actualLetterHeightDevicePx = value.actual_letter_height_device_px;
  const actualStrokeWidthDevicePx = value.actual_stroke_width_device_px;
  const visibilityConfirmed = value.visibility_confirmed;
  const renderedAt = value.rendered_at;
  const responseKind = value.response_kind;
  const responseLetter = value.response_letter;
  const respondedAt = value.responded_at;
  const latencyMs = value.latency_ms;
  const responseCount = value.response_count;

  if (typeof presentationId !== "string" || presentationId.length === 0) {
    return null;
  }
  if (!isInteger(trialIndex) || trialIndex < 0) {
    return null;
  }
  if (!isEye(eye)) {
    return null;
  }
  if (!isInteger(logmarStepIndex)) {
    return null;
  }
  if (!isPresentationFormat(format)) {
    return null;
  }
  if (optotypes === null) {
    return null;
  }
  if (!isInteger(targetIndex) || targetIndex < 0 || targetIndex >= optotypes.length) {
    return null;
  }
  if (format === "flanked-triplet") {
    if (targetIndex < 1 || targetIndex + 1 >= optotypes.length) {
      return null;
    }
  }
  if (!isFiniteNumber(requestedLetterHeightDevicePx) || requestedLetterHeightDevicePx <= 0) {
    return null;
  }
  if (
    actualLetterHeightDevicePx !== null &&
    (!isFiniteNumber(actualLetterHeightDevicePx) || actualLetterHeightDevicePx <= 0)
  ) {
    return null;
  }
  if (
    actualStrokeWidthDevicePx !== null &&
    (!isFiniteNumber(actualStrokeWidthDevicePx) || actualStrokeWidthDevicePx <= 0)
  ) {
    return null;
  }
  if (typeof visibilityConfirmed !== "boolean") {
    return null;
  }
  if (renderedAt !== null && typeof renderedAt !== "string") {
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
  if (typeof respondedAt !== "string") {
    return null;
  }
  if (latencyMs !== null && (!isInteger(latencyMs) || latencyMs < 0)) {
    return null;
  }
  if (!isInteger(responseCount) || responseCount < 1) {
    return null;
  }

  return {
    presentationId,
    trialIndex,
    eye,
    logmarStepIndex,
    format,
    optotypes,
    targetIndex,
    requestedLetterHeightDevicePx,
    actualLetterHeightDevicePx,
    actualStrokeWidthDevicePx,
    visibilityConfirmed,
    renderedAt,
    responseKind,
    responseLetter: responseKind === "letter" ? responseLetter : null,
    respondedAt,
    latencyMs,
    responseCount,
  };
}

export function parseAnsweredTrials(value: unknown): AnsweredTrial[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const trials: AnsweredTrial[] = [];
  for (const entry of value) {
    const parsed = parseAnsweredTrial(entry);
    if (parsed === null) {
      return null;
    }
    trials.push(parsed);
  }
  return trials;
}

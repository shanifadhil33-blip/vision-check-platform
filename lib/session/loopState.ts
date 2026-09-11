import type { SloanLetter } from "@/lib/acuity/sloan";
import { SLOAN_LETTERS } from "@/lib/acuity/sloan";
import type { Json } from "@/lib/db/types";

export type LoopState =
  | { phase: "ready" }
  | {
      phase: "awaiting_response";
      trialIndex: number;
      presentationId: string;
      choices: SloanLetter[];
    }
  | {
      phase: "responded";
      trialIndex: number;
      presentationId: string;
      responseId: string;
      responseKind: "letter" | "not_sure";
      responseLetter: SloanLetter | null;
    }
  | { phase: "complete"; trialsCompleted: number };

const SLOAN_SET: ReadonlySet<string> = new Set(SLOAN_LETTERS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSloanLetter(value: unknown): value is SloanLetter {
  return typeof value === "string" && SLOAN_SET.has(value);
}

function isNonNegInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function parseChoices(value: unknown): SloanLetter[] | null {
  if (!Array.isArray(value) || value.length !== 5) {
    return null;
  }
  const choices: SloanLetter[] = [];
  for (const entry of value) {
    if (!isSloanLetter(entry)) {
      return null;
    }
    choices.push(entry);
  }
  return choices;
}

export function parseLoopState(value: unknown): LoopState | null {
  if (!isRecord(value)) {
    return null;
  }
  const phase = value.phase;
  if (phase === "ready") {
    return { phase: "ready" };
  }
  if (phase === "complete") {
    if (!isNonNegInt(value.trialsCompleted)) {
      return null;
    }
    return { phase: "complete", trialsCompleted: value.trialsCompleted };
  }
  if (phase === "awaiting_response") {
    if (!isNonNegInt(value.trialIndex)) {
      return null;
    }
    if (typeof value.presentationId !== "string" || value.presentationId.length === 0) {
      return null;
    }
    const choices = parseChoices(value.choices);
    if (choices === null) {
      return null;
    }
    return {
      phase: "awaiting_response",
      trialIndex: value.trialIndex,
      presentationId: value.presentationId,
      choices,
    };
  }
  if (phase === "responded") {
    if (!isNonNegInt(value.trialIndex)) {
      return null;
    }
    if (typeof value.presentationId !== "string" || value.presentationId.length === 0) {
      return null;
    }
    if (typeof value.responseId !== "string" || value.responseId.length === 0) {
      return null;
    }
    const responseKind = value.responseKind;
    if (responseKind !== "letter" && responseKind !== "not_sure") {
      return null;
    }
    const responseLetter = value.responseLetter;
    if (responseKind === "letter") {
      if (!isSloanLetter(responseLetter)) {
        return null;
      }
      return {
        phase: "responded",
        trialIndex: value.trialIndex,
        presentationId: value.presentationId,
        responseId: value.responseId,
        responseKind: "letter",
        responseLetter,
      };
    }
    if (responseLetter !== null) {
      return null;
    }
    return {
      phase: "responded",
      trialIndex: value.trialIndex,
      presentationId: value.presentationId,
      responseId: value.responseId,
      responseKind: "not_sure",
      responseLetter: null,
    };
  }
  return null;
}

export function readyState(): Json {
  return { phase: "ready" };
}

export function awaitingResponseState(args: {
  trialIndex: number;
  presentationId: string;
  choices: SloanLetter[];
}): Json {
  return {
    phase: "awaiting_response",
    trialIndex: args.trialIndex,
    presentationId: args.presentationId,
    choices: [...args.choices],
  };
}

export function respondedState(args: {
  trialIndex: number;
  presentationId: string;
  responseId: string;
  responseKind: "letter" | "not_sure";
  responseLetter: SloanLetter | null;
}): Json {
  return {
    phase: "responded",
    trialIndex: args.trialIndex,
    presentationId: args.presentationId,
    responseId: args.responseId,
    responseKind: args.responseKind,
    responseLetter: args.responseLetter,
  };
}

export function completeState(trialsCompleted: number): Json {
  return { phase: "complete", trialsCompleted };
}

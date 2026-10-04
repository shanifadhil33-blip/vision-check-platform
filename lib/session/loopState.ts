import type { SloanLetter } from "@/lib/acuity/sloan";
import { SLOAN_LETTERS } from "@/lib/acuity/sloan";
import { COARSEST_TESTED_STEP_INDEX, FINEST_TESTED_STEP_INDEX } from "@/lib/acuity/testLevels";
import type { Json } from "@/lib/db/types";

export type RunContext = {
  correction: "none" | "contacts" | "glasses";
  stepIndices: number[];
  finestLimitedBy: "screen-resolution" | "viewport-size" | "requested-bound";
  coarsestLimitedBy: "screen-resolution" | "viewport-size" | "requested-bound";
  voidedTrialIndices: number[];
};

export type RunResult =
  | { kind: "measured" | "screen-limited" | "test-floor"; stepIndex: number }
  | { kind: "not-measurable"; coarsestStepIndex: number };

export type LoopState =
  | { phase: "ready"; run: RunContext | null }
  | {
      phase: "awaiting_response";
      trialIndex: number;
      presentationId: string;
      choices: SloanLetter[];
      run: RunContext | null;
    }
  | {
      phase: "responded";
      trialIndex: number;
      presentationId: string;
      responseId: string;
      responseKind: "letter" | "not_sure";
      responseLetter: SloanLetter | null;
      run: RunContext | null;
    }
  | {
      phase: "complete";
      trialsCompleted: number;
      run: RunContext | null;
      result: RunResult | null;
      nextSessionId: string | null;
    };

const SLOAN_SET: ReadonlySet<string> = new Set(SLOAN_LETTERS);

const SESSION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const CORRECTIONS: ReadonlySet<string> = new Set(["none", "contacts", "glasses"]);

const LIMITS: ReadonlySet<string> = new Set([
  "screen-resolution",
  "viewport-size",
  "requested-bound",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSloanLetter(value: unknown): value is SloanLetter {
  return typeof value === "string" && SLOAN_SET.has(value);
}

function isNonNegInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isLimit(
  value: unknown,
): value is RunContext["finestLimitedBy"] {
  return typeof value === "string" && LIMITS.has(value);
}

function parseStepIndices(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const stepIndices: number[] = [];
  for (const entry of value) {
    if (
      typeof entry !== "number" ||
      !Number.isInteger(entry) ||
      entry < FINEST_TESTED_STEP_INDEX ||
      entry > COARSEST_TESTED_STEP_INDEX
    ) {
      return null;
    }
    const previous = stepIndices[stepIndices.length - 1];
    if (previous !== undefined && entry !== previous + 1) {
      return null;
    }
    stepIndices.push(entry);
  }
  return stepIndices;
}

function parseVoidedTrialIndices(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const voidedTrialIndices: number[] = [];
  for (const entry of value) {
    if (!isNonNegInt(entry)) {
      return null;
    }
    voidedTrialIndices.push(entry);
  }
  return voidedTrialIndices;
}

export function parseRunContext(value: unknown): RunContext | null {
  if (!isRecord(value)) {
    return null;
  }
  if (typeof value.correction !== "string" || !CORRECTIONS.has(value.correction)) {
    return null;
  }
  const stepIndices = parseStepIndices(value.stepIndices);
  if (stepIndices === null) {
    return null;
  }
  if (!isLimit(value.finestLimitedBy) || !isLimit(value.coarsestLimitedBy)) {
    return null;
  }
  const voidedTrialIndices = parseVoidedTrialIndices(value.voidedTrialIndices);
  if (voidedTrialIndices === null) {
    return null;
  }
  return {
    correction: value.correction as RunContext["correction"],
    stepIndices,
    finestLimitedBy: value.finestLimitedBy,
    coarsestLimitedBy: value.coarsestLimitedBy,
    voidedTrialIndices,
  };
}

export function parseRunResult(value: unknown): RunResult | null {
  if (!isRecord(value)) {
    return null;
  }
  const kind = value.kind;
  if (kind === "measured" || kind === "screen-limited" || kind === "test-floor") {
    if (
      typeof value.stepIndex !== "number" ||
      !Number.isInteger(value.stepIndex) ||
      value.stepIndex < FINEST_TESTED_STEP_INDEX ||
      value.stepIndex > COARSEST_TESTED_STEP_INDEX
    ) {
      return null;
    }
    return { kind, stepIndex: value.stepIndex };
  }
  if (kind === "not-measurable") {
    if (
      typeof value.coarsestStepIndex !== "number" ||
      !Number.isInteger(value.coarsestStepIndex) ||
      value.coarsestStepIndex < FINEST_TESTED_STEP_INDEX ||
      value.coarsestStepIndex > COARSEST_TESTED_STEP_INDEX
    ) {
      return null;
    }
    return { kind, coarsestStepIndex: value.coarsestStepIndex };
  }
  return null;
}

function nextSessionIdFrom(value: unknown): string | null {
  if (typeof value === "string" && SESSION_UUID_RE.test(value)) {
    return value;
  }
  return null;
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
  const run = parseRunContext(value.run);
  const phase = value.phase;
  if (phase === "ready") {
    return { phase: "ready", run };
  }
  if (phase === "complete") {
    if (!isNonNegInt(value.trialsCompleted)) {
      return null;
    }
    return {
      phase: "complete",
      trialsCompleted: value.trialsCompleted,
      run,
      result: parseRunResult(value.result),
      nextSessionId: nextSessionIdFrom(value.nextSessionId),
    };
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
      run,
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
        run,
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
      run,
    };
  }
  return null;
}

function runJson(run: RunContext): Json {
  return {
    correction: run.correction,
    stepIndices: [...run.stepIndices],
    finestLimitedBy: run.finestLimitedBy,
    coarsestLimitedBy: run.coarsestLimitedBy,
    voidedTrialIndices: [...run.voidedTrialIndices],
  };
}

function resultJson(result: RunResult): Json {
  if (result.kind === "not-measurable") {
    return {
      kind: result.kind,
      coarsestStepIndex: result.coarsestStepIndex,
    };
  }
  return {
    kind: result.kind,
    stepIndex: result.stepIndex,
  };
}

function withRun(body: { [key: string]: Json }, run: RunContext | null | undefined): Json {
  if (run !== null && run !== undefined) {
    body.run = runJson(run);
  }
  return body;
}

export function readyState(run?: RunContext | null): Json {
  return withRun({ phase: "ready" }, run);
}

export function awaitingResponseState(args: {
  trialIndex: number;
  presentationId: string;
  choices: SloanLetter[];
  run?: RunContext | null;
}): Json {
  return withRun(
    {
      phase: "awaiting_response",
      trialIndex: args.trialIndex,
      presentationId: args.presentationId,
      choices: [...args.choices],
    },
    args.run,
  );
}

export function respondedState(args: {
  trialIndex: number;
  presentationId: string;
  responseId: string;
  responseKind: "letter" | "not_sure";
  responseLetter: SloanLetter | null;
  run?: RunContext | null;
}): Json {
  return withRun(
    {
      phase: "responded",
      trialIndex: args.trialIndex,
      presentationId: args.presentationId,
      responseId: args.responseId,
      responseKind: args.responseKind,
      responseLetter: args.responseLetter,
    },
    args.run,
  );
}

export function completeState(
  trialsCompleted: number,
  options?: {
    run?: RunContext | null;
    result?: RunResult | null;
    nextSessionId?: string | null;
  },
): Json {
  const body: { [key: string]: Json } = {
    phase: "complete",
    trialsCompleted,
  };
  const withOptionalRun = withRun(body, options?.run);
  const result = options?.result;
  if (result !== null && result !== undefined) {
    body.result = resultJson(result);
  }
  const nextSessionId = options?.nextSessionId;
  if (typeof nextSessionId === "string") {
    body.nextSessionId = nextSessionId;
  }
  return withOptionalRun;
}

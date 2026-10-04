import type { Calibration } from "@/lib/calibration";
import { mmToCssPx, pixelPitchMm } from "@/lib/calibration";
import {
  letterHeightMmForLogMar,
  strokeWidthMmForLogMar,
} from "@/lib/acuity/logmar";
import { buildTrialChoices, pickFlankers } from "@/lib/acuity/thinLoop";
import type { SloanLetter } from "@/lib/acuity/sloan";
import { computeTestLevels } from "@/lib/acuity/testLevels";
import {
  pickNextTarget,
  recordTrial,
  startStaircase,
  type StaircaseState,
} from "@/lib/acuity/staircase";
import {
  notSureCount,
  replayRun,
  setupCheck,
  testQualityPayload,
} from "@/lib/acuity/testRun";
import type { VcpError } from "@/lib/db/errors";
import type { AnsweredTrial, PresentationPayload } from "@/lib/db/payloads";
import { getAnsweredTrials, setSessionState as rpcSetSessionState } from "@/lib/db/rpc";
import type { Json } from "@/lib/db/types";
import type { OptotypeMeasurement } from "@/app/(display)/display/optotype/OptotypeCanvas";
import { joinSessionChannel, type SessionChannel } from "@/lib/session/channel";
import {
  awaitingResponseState,
  completeState,
  parseLoopState,
  readyState,
  type LoopState,
  type RunContext,
  type RunResult,
} from "@/lib/session/loopState";
import * as sessionStore from "@/lib/session/sessionStore";
import { isResponseCorrect } from "./isResponseCorrect";
import {
  setVisibilityPresentationId,
  startVisibilityTracking,
  stopVisibilityTracking,
} from "./visibilityTracker";

export type TestPhase =
  | "idle"
  | "creating"
  | "resuming"
  | "waiting_for_phone"
  | "ready"
  | "presenting"
  | "awaiting_response"
  | "complete"
  | "stopped"
  | "error";

export type SessionFormat = "single" | "flanked-triplet";

export type FormatSource = "chosen" | "state" | "resumed-default";

export type CompletedTrial = {
  trialIndex: number;
  stepIndex: number;
  target: SloanLetter;
  leftFlanker: SloanLetter | null;
  rightFlanker: SloanLetter | null;
  responseKind: "letter" | "not_sure";
  responseLetter: SloanLetter | null;
  correct: boolean;
  voided: boolean;
};

export type TestSnapshot = {
  phase: TestPhase;
  format: SessionFormat;
  formatSource: FormatSource;
  distanceMm: number | null;
  sessionId: string | null;
  remoteUrl: string | null;
  qrDataUrl: string | null;
  currentTrialIndex: number | null;
  currentStepIndex: number | null;
  currentTarget: SloanLetter | null;
  currentLeftFlanker: SloanLetter | null;
  currentRightFlanker: SloanLetter | null;
  cssPxPerMm: number | null;
  devicePixelRatio: number | null;
  history: readonly CompletedTrial[];
  historyLoadFailed: boolean;
  errorMessage: string | null;
  correction: RunContext["correction"] | null;
  result: RunResult | null;
  notSureCount: number;
  errorDetail: string | null;
};

type ActiveTrial = {
  trialIndex: number;
  stepIndex: number;
  target: SloanLetter;
  leftFlanker: SloanLetter | null;
  rightFlanker: SloanLetter | null;
  choices: SloanLetter[];
  presentationId: string | null;
  recorded: boolean;
  voided: boolean;
};

type RememberedTrial = {
  trialIndex: number;
  stepIndex: number;
  target: SloanLetter;
  leftFlanker: SloanLetter | null;
  rightFlanker: SloanLetter | null;
  presentationId: string | null;
};

type SetupProbe = () => {
  validityOk: boolean;
  zoomState: "default" | "not-default" | "unknown";
  viewportWidthCssPx: number;
  viewportHeightCssPx: number;
};

type RespondedState = Extract<LoopState, { phase: "responded" }>;

const POLL_MS = 3000;
const CLIENT_BUILD = "m4-staircase-1";

const MSG_CONNECTION = "The test lost its connection. Refresh the page to carry on.";
const MSG_SETUP_CHANGED =
  "Your screen settings changed during the test, so it has stopped. Please set up your screen again and start a new test.";
const MSG_SCREEN_CANNOT_SHOW = "This screen can't show the test letters at this distance.";
const MSG_SESSION_ENDED = "This test has ended. Start a new test to continue.";
export const MSG_SESSION_CANNOT_CONTINUE =
  "This test cannot be continued. Start a new test to continue.";

const SERVER_SNAPSHOT: TestSnapshot = {
  phase: "idle",
  format: "flanked-triplet",
  formatSource: "chosen",
  distanceMm: null,
  sessionId: null,
  remoteUrl: null,
  qrDataUrl: null,
  currentTrialIndex: null,
  currentStepIndex: null,
  currentTarget: null,
  currentLeftFlanker: null,
  currentRightFlanker: null,
  cssPxPerMm: null,
  devicePixelRatio: null,
  history: [],
  historyLoadFailed: false,
  errorMessage: null,
  correction: null,
  result: null,
  notSureCount: 0,
  errorDetail: null,
};

const listeners = new Set<() => void>();
let cachedSnapshot: TestSnapshot = SERVER_SNAPSHOT;

let calibration: Calibration | null = null;
let staircase: StaircaseState | null = null;
let run: RunContext | null = null;
let nextTrialIndex = 0;
let activeTrial: ActiveTrial | null = null;
let history: CompletedTrial[] = [];
let channel: SessionChannel | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let pollInFlight = false;
let startInFlight = false;
let resumeInFlight = false;
let beginInFlight = false;
let measureInFlight = false;
let advanceInFlight = false;
let disposed = false;
let resumeGeneration = 0;
let setupProbe: SetupProbe | null = null;
let setupStopped = false;
let skippingDuplicateTrial = false;
let visibilityGeneration = 0;
let visibilityChain: Promise<void> = Promise.resolve();
let stateChain: Promise<void> = Promise.resolve();
const voidedLetters = new Map<number, RememberedTrial>();
const voidEventSent = new Set<number>();
const voidStateSaved = new Set<string>();

type RememberedFinishedTest = {
  sessionId: string;
  version: number;
  run: RunContext;
  result: RunResult;
  scoredLetterCount: number;
};

let rememberedFinishedTest: RememberedFinishedTest | null = null;
let finishedScoredLetterCount: number | null = null;

const SESSION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isSessionUuid(value: string): boolean {
  return SESSION_UUID_RE.test(value);
}

function setSessionIdInUrl(sessionId: string): void {
  const nextUrl = `${window.location.pathname}?session=${sessionId}`;
  window.history.replaceState(window.history.state, "", nextUrl);
}

function clearSessionIdFromUrl(): void {
  window.history.replaceState(window.history.state, "", window.location.pathname);
}

function detailText(detail: unknown): string {
  if (typeof detail === "string") {
    return detail;
  }
  if (detail instanceof Error) {
    return detail.message;
  }
  if (
    detail !== null &&
    typeof detail === "object" &&
    "message" in detail &&
    typeof detail.message === "string"
  ) {
    return detail.message;
  }
  return String(detail);
}

function resetRunMemory(): void {
  staircase = null;
  run = null;
  nextTrialIndex = 0;
  voidedLetters.clear();
  voidEventSent.clear();
  voidStateSaved.clear();
  skippingDuplicateTrial = false;
  visibilityGeneration += 1;
  visibilityChain = Promise.resolve();
}

function currentNotSureCount(): number {
  if (run === null) {
    return 0;
  }
  return notSureCount(
    history.map((row) => ({
      trialIndex: row.trialIndex,
      stepIndex: row.stepIndex,
      target: row.target,
      responseKind: row.responseKind,
      responseLetter: row.responseLetter,
    })),
    run.voidedTrialIndices,
  );
}

function scoredLetterCount(state: StaircaseState): number {
  let count = 0;
  for (const level of state.levels) {
    count += level.scored;
  }
  return count;
}

/**
 * vcp_record_presentation inserts into presentations. A second row for the
 * same (session_id, trial_index) hits presentations_session_id_trial_index_key
 * and Postgres raises 23505, which the app classifies as unique-violation.
 */
function isDuplicateTrialIndex(error: VcpError): boolean {
  return error.kind === "unique-violation";
}

function enqueueState<T>(fn: () => Promise<T>): Promise<T> {
  const result = stateChain.then(fn, fn);
  stateChain = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function writeState(
  status: "created" | "running" | "complete" | "abandoned",
  currentState: Json,
): Promise<Awaited<ReturnType<typeof sessionStore.setState>>> {
  return enqueueState(() => sessionStore.setState(status, currentState));
}

function rememberTrial(trial: ActiveTrial): void {
  voidedLetters.set(trial.trialIndex, {
    trialIndex: trial.trialIndex,
    stepIndex: trial.stepIndex,
    target: trial.target,
    leftFlanker: trial.leftFlanker,
    rightFlanker: trial.rightFlanker,
    presentationId: trial.presentationId,
  });
}

/**
 * Records the void in the staircase and in run before any await.
 * A phone answer read after this returns cannot be scored.
 */
function commitVoid(trial: ActiveTrial): boolean {
  if (trial.voided) {
    return true;
  }
  if (run === null || staircase === null || staircase.status !== "running") {
    return false;
  }
  staircase = recordTrial(staircase, { letter: trial.target, outcome: "void" });
  if (!run.voidedTrialIndices.includes(trial.trialIndex)) {
    run = {
      ...run,
      voidedTrialIndices: [...run.voidedTrialIndices, trial.trialIndex],
    };
  }
  trial.voided = true;
  rememberTrial(trial);
  return true;
}

function isVoidedPresentation(trialIndex: number, presentationId: string): boolean {
  if (run !== null && run.voidedTrialIndices.includes(trialIndex)) {
    return true;
  }
  if (
    activeTrial !== null &&
    activeTrial.voided &&
    activeTrial.presentationId === presentationId
  ) {
    return true;
  }
  return voidedLetters.has(trialIndex);
}

function sourceForTrial(trialIndex: number): RememberedTrial | ActiveTrial | null {
  const remembered = voidedLetters.get(trialIndex);
  if (remembered !== undefined) {
    return remembered;
  }
  if (activeTrial !== null && activeTrial.trialIndex === trialIndex) {
    return activeTrial;
  }
  return null;
}

function appendVoidedHistory(state: RespondedState): void {
  if (history.some((row) => row.trialIndex === state.trialIndex)) {
    return;
  }
  const source = sourceForTrial(state.trialIndex);
  if (source === null) {
    return;
  }
  history = [
    ...history,
    {
      trialIndex: state.trialIndex,
      stepIndex: source.stepIndex,
      target: source.target,
      leftFlanker: source.leftFlanker,
      rightFlanker: source.rightFlanker,
      responseKind: state.responseKind,
      responseLetter: state.responseLetter,
      correct: isResponseCorrect(state.responseKind, state.responseLetter, source.target),
      voided: true,
    },
  ];
  patch({ history, notSureCount: currentNotSureCount() });
}

/**
 * Plain ended screen: start controls available, session cleared from the
 * address bar so a refresh does not reopen it. No further writes.
 */
function showSessionEndedScreen(message: string, detail?: unknown): void {
  if (setupStopped) {
    return;
  }
  stopPoll();
  leaveChannel();
  stopVisibilityTracking();
  activeTrial = null;
  clearSessionIdFromUrl();
  sessionStore.reset();
  if (detail !== undefined) {
    console.error(detail);
  }
  patch({
    phase: "error",
    sessionId: null,
    remoteUrl: null,
    qrDataUrl: null,
    currentTrialIndex: null,
    currentStepIndex: null,
    currentTarget: null,
    currentLeftFlanker: null,
    currentRightFlanker: null,
    history: [],
    historyLoadFailed: false,
    errorMessage: message,
    errorDetail: detail === undefined ? null : detailText(detail),
    result: null,
    notSureCount: 0,
    correction: null,
  });
}

function formatFromCurrentState(currentState: unknown): SessionFormat | null {
  if (currentState === null || typeof currentState !== "object" || Array.isArray(currentState)) {
    return null;
  }
  if (!("format" in currentState)) {
    return null;
  }
  const format = currentState.format;
  if (format === "single" || format === "flanked-triplet") {
    return format;
  }
  return null;
}

async function buildRemotePairing(sessionId: string): Promise<{
  remoteUrl: string;
  qrDataUrl: string;
}> {
  const remoteUrl = `${window.location.origin}/remote?session=${sessionId}`;
  const qrcode = await import("qrcode");
  const qrDataUrl = await qrcode.toDataURL(remoteUrl, { margin: 1, width: 280 });
  return { remoteUrl, qrDataUrl };
}

function emit(next: TestSnapshot): void {
  cachedSnapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

function patch(partial: Partial<TestSnapshot>): void {
  emit({
    ...cachedSnapshot,
    ...partial,
  });
}

function fail(message: string, detail?: unknown): void {
  stopVisibilityTracking();
  if (detail !== undefined) {
    console.error(detail);
  }
  patch({
    phase: "error",
    errorMessage: message,
    errorDetail: detail === undefined ? null : detailText(detail),
  });
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): TestSnapshot {
  return cachedSnapshot;
}

export function getServerSnapshot(): TestSnapshot {
  return SERVER_SNAPSHOT;
}

export function setSetupProbe(probe: SetupProbe | null): void {
  setupProbe = probe;
}

function currentStepForSetup(): number | null {
  if (staircase === null || staircase.status !== "running") {
    return null;
  }
  return staircase.currentStepIndex;
}

function evaluateSetup(
  format: SessionFormat,
  viewport?: {
    viewportWidthCssPx: number;
    viewportHeightCssPx: number;
  },
): "ok" | "calibration" | "zoom" | "window" | null {
  if (setupProbe === null || calibration === null || cachedSnapshot.distanceMm === null) {
    return null;
  }
  const probe = setupProbe();
  let drawableStepIndices: number[] = [];
  try {
    drawableStepIndices = computeTestLevels({
      distanceMm: cachedSnapshot.distanceMm,
      pixelPitchMm: pixelPitchMm(calibration.cssPxPerMm, calibration.devicePixelRatio),
      cssPxPerMm: calibration.cssPxPerMm,
      viewportWidthCssPx: viewport?.viewportWidthCssPx ?? probe.viewportWidthCssPx,
      viewportHeightCssPx: viewport?.viewportHeightCssPx ?? probe.viewportHeightCssPx,
      format,
    }).stepIndices;
  } catch (error) {
    console.error(error);
    return "window";
  }
  return setupCheck({
    validityOk: probe.validityOk,
    zoomState: probe.zoomState,
    drawableStepIndices,
    currentStepIndex: currentStepForSetup(),
  });
}

export function checkSetupNow(): void {
  const phase = cachedSnapshot.phase;
  if (phase !== "ready" && phase !== "presenting" && phase !== "awaiting_response") {
    return;
  }
  const outcome = evaluateSetup(cachedSnapshot.format);
  if (outcome === null || outcome === "ok") {
    return;
  }
  void stopForSetup(outcome);
}

function stopPoll(): void {
  if (pollTimer !== null) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  pollInFlight = false;
}

function leaveChannel(): void {
  if (channel !== null) {
    channel.leave();
    channel = null;
  }
}

async function stopForSetup(reason: "calibration" | "zoom" | "window"): Promise<void> {
  if (setupStopped || disposed) {
    return;
  }
  setupStopped = true;
  visibilityGeneration += 1;
  const currentRun = run;
  if (currentRun !== null) {
    const eventResult = await sessionStore.appendEvent({
      type: "stopped_for_setup",
      payload: { reason },
    });
    if (!eventResult.ok) {
      console.error(eventResult.error);
    }
    const abandoned = await writeState("abandoned", readyState(currentRun));
    if (!abandoned.ok) {
      console.error(abandoned.error);
    }
  }
  stopPoll();
  leaveChannel();
  stopVisibilityTracking();
  activeTrial = null;
  clearSessionIdFromUrl();
  patch({
    phase: "stopped",
    sessionId: null,
    errorMessage: MSG_SETUP_CHANGED,
    errorDetail: null,
    currentTrialIndex: null,
    currentStepIndex: null,
    currentTarget: null,
    currentLeftFlanker: null,
    currentRightFlanker: null,
  });
}

function completedTrialFromAnswered(row: AnsweredTrial): CompletedTrial {
  const target = row.optotypes[row.targetIndex]!;
  let leftFlanker: SloanLetter | null = null;
  let rightFlanker: SloanLetter | null = null;
  if (row.format === "flanked-triplet") {
    leftFlanker = row.optotypes[row.targetIndex - 1]!;
    rightFlanker = row.optotypes[row.targetIndex + 1]!;
  }
  return {
    trialIndex: row.trialIndex,
    stepIndex: row.logmarStepIndex,
    target,
    leftFlanker,
    rightFlanker,
    responseKind: row.responseKind,
    responseLetter: row.responseLetter,
    correct: isResponseCorrect(row.responseKind, row.responseLetter, target),
    voided: false,
  };
}

function withVoidedFlags(
  rows: CompletedTrial[],
  voidedTrialIndices: readonly number[],
): CompletedTrial[] {
  const voided = new Set(voidedTrialIndices);
  return rows.map((row) => ({
    ...row,
    voided: voided.has(row.trialIndex),
  }));
}

/**
 * Rebuild the results list from the database. Failures leave history empty
 * and set historyLoadFailed; the original error is logged by the caller.
 */
async function rebuildHistoryFromAnsweredTrials(sessionId: string): Promise<{
  history: CompletedTrial[];
  historyLoadFailed: boolean;
  error: unknown | null;
}> {
  const result = await getAnsweredTrials(sessionId);
  if (!result.ok) {
    return { history: [], historyLoadFailed: true, error: result.error };
  }
  return {
    history: result.data.map(completedTrialFromAnswered),
    historyLoadFailed: false,
    error: null,
  };
}

async function persistHiddenVoid(trial: ActiveTrial): Promise<void> {
  if (!voidEventSent.has(trial.trialIndex)) {
    voidEventSent.add(trial.trialIndex);
    const eventResult = await sessionStore.appendEvent({
      type: "trial_voided",
      payload: {
        trial_index: trial.trialIndex,
        presentation_id: trial.presentationId,
        reason: "page_hidden",
      },
    });
    if (!eventResult.ok) {
      console.error(eventResult.error);
    }
  }
  if (disposed || setupStopped) {
    return;
  }
  const presentationId = trial.presentationId;
  const currentRun = run;
  if (presentationId === null || currentRun === null) {
    return;
  }
  if (voidStateSaved.has(presentationId)) {
    return;
  }
  voidStateSaved.add(presentationId);
  const stateResult = await writeState(
    "running",
    awaitingResponseState({
      trialIndex: trial.trialIndex,
      presentationId,
      choices: trial.choices,
      run: currentRun,
    }),
  );
  if (stateResult.ok) {
    return;
  }
  voidStateSaved.delete(presentationId);
  if (stateResult.error.kind === "version-conflict") {
    await captureVoidedAnswerIfResponded();
    const latestRun = run;
    const latestPresentationId = trial.presentationId;
    if (latestRun === null || latestPresentationId === null || disposed || setupStopped) {
      fail(MSG_CONNECTION, stateResult.error);
      return;
    }
    const retry = await writeState(
      "running",
      awaitingResponseState({
        trialIndex: trial.trialIndex,
        presentationId: latestPresentationId,
        choices: trial.choices,
        run: latestRun,
      }),
    );
    if (!retry.ok) {
      fail(MSG_CONNECTION, retry.error);
      return;
    }
    voidStateSaved.add(latestPresentationId);
    return;
  }
  fail(MSG_CONNECTION, stateResult.error);
}

async function restoreFreshTrialIfNeeded(): Promise<void> {
  const fresh = activeTrial;
  const currentRun = run;
  if (
    fresh === null ||
    fresh.voided ||
    fresh.presentationId === null ||
    currentRun === null ||
    disposed ||
    setupStopped
  ) {
    return;
  }
  const rewritten = await writeState(
    "running",
    awaitingResponseState({
      trialIndex: fresh.trialIndex,
      presentationId: fresh.presentationId,
      choices: fresh.choices,
      run: currentRun,
    }),
  );
  if (!rewritten.ok) {
    fail(MSG_CONNECTION, rewritten.error);
    return;
  }
  if (channel !== null) {
    await channel.sendNudge("awaiting_response");
  }
}

async function finishRun(): Promise<void> {
  if (disposed || setupStopped) {
    return;
  }
  const currentRun = run;
  const currentStaircase = staircase;
  if (currentRun === null || currentStaircase === null || currentStaircase.status !== "finished") {
    fail(MSG_CONNECTION);
    return;
  }
  const distanceMm = cachedSnapshot.distanceMm;
  if (distanceMm === null) {
    fail(MSG_SESSION_CANNOT_CONTINUE);
    return;
  }
  const result = currentStaircase.result;
  const letterCount = scoredLetterCount(currentStaircase);
  finishedScoredLetterCount = letterCount;
  const done = await writeState(
    "complete",
    completeState(letterCount, { run: currentRun, result }),
  );
  if (!done.ok) {
    fail(MSG_CONNECTION, done.error);
    return;
  }
  if (disposed || setupStopped) {
    return;
  }
  if (channel !== null) {
    await channel.sendNudge("complete");
  }
  try {
    const qualityResult = await sessionStore.upsertTestQuality(
      testQualityPayload({
        result,
        run: currentRun,
        distanceMm,
        notSureCount: currentNotSureCount(),
      }),
    );
    if (!qualityResult.ok) {
      console.error(qualityResult.error);
      const logged = await sessionStore.appendEvent({
        type: "test_quality_write_failed",
        payload: { message: qualityResult.error.message },
      });
      if (!logged.ok) {
        console.error(logged.error);
      }
    }
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    const logged = await sessionStore.appendEvent({
      type: "test_quality_write_failed",
      payload: { message },
    });
    if (!logged.ok) {
      console.error(logged.error);
    }
  }
  if (disposed || setupStopped) {
    return;
  }
  activeTrial = null;
  stopVisibilityTracking();
  patch({
    phase: "complete",
    result,
    correction: currentRun.correction,
    notSureCount: currentNotSureCount(),
    currentTrialIndex: null,
    currentStepIndex: null,
    currentTarget: null,
    currentLeftFlanker: null,
    currentRightFlanker: null,
    history,
    errorMessage: null,
    errorDetail: null,
  });
}

async function captureVoidedAnswerIfResponded(): Promise<void> {
  const sessionId = cachedSnapshot.sessionId;
  if (sessionId === null || disposed || setupStopped) {
    return;
  }
  const loaded = await sessionStore.loadSession(sessionId);
  if (!loaded.ok || disposed || setupStopped) {
    return;
  }
  if (loaded.data.status === "abandoned") {
    showSessionEndedScreen(MSG_SESSION_ENDED);
    return;
  }
  const state = parseLoopState(loaded.data.currentState);
  if (state === null || state.phase !== "responded") {
    return;
  }
  if (!isVoidedPresentation(state.trialIndex, state.presentationId)) {
    return;
  }
  appendVoidedHistory(state);
}

/**
 * Advance only after a vcp_get_session read shows phase 'responded'
 * for the current presentation id. A voided presentation is kept and not scored.
 */
async function tryAdvanceFromResponded(): Promise<void> {
  if (disposed || setupStopped || advanceInFlight) {
    return;
  }
  const phase = cachedSnapshot.phase;
  if (phase !== "awaiting_response" && phase !== "presenting") {
    return;
  }
  const sessionId = cachedSnapshot.sessionId;
  if (sessionId === null) {
    return;
  }

  advanceInFlight = true;
  try {
    const loaded = await sessionStore.loadSession(sessionId);
    if (!loaded.ok || disposed || setupStopped) {
      return;
    }
    if (loaded.data.status === "abandoned") {
      showSessionEndedScreen(MSG_SESSION_ENDED);
      return;
    }
    if (
      cachedSnapshot.phase !== "awaiting_response" &&
      cachedSnapshot.phase !== "presenting"
    ) {
      return;
    }

    const state = parseLoopState(loaded.data.currentState);
    if (state === null || state.phase !== "responded") {
      return;
    }

    if (isVoidedPresentation(state.trialIndex, state.presentationId)) {
      appendVoidedHistory(state);
      const fresh = activeTrial;
      if (
        fresh !== null &&
        !fresh.voided &&
        fresh.presentationId !== null &&
        fresh.presentationId !== state.presentationId
      ) {
        await restoreFreshTrialIfNeeded();
      }
      return;
    }

    if (cachedSnapshot.phase !== "awaiting_response") {
      return;
    }
    const trial = activeTrial;
    if (trial === null || trial.voided || trial.presentationId === null) {
      return;
    }
    if (state.presentationId !== trial.presentationId) {
      return;
    }
    const currentStaircase = staircase;
    if (currentStaircase === null || currentStaircase.status !== "running") {
      return;
    }

    const correct = isResponseCorrect(
      state.responseKind,
      state.responseLetter,
      trial.target,
    );
    history = [
      ...history,
      {
        trialIndex: trial.trialIndex,
        stepIndex: trial.stepIndex,
        target: trial.target,
        leftFlanker: trial.leftFlanker,
        rightFlanker: trial.rightFlanker,
        responseKind: state.responseKind,
        responseLetter: state.responseLetter,
        correct,
        voided: false,
      },
    ];
    staircase = recordTrial(currentStaircase, {
      letter: trial.target,
      outcome: correct ? "correct" : "incorrect",
    });
    activeTrial = null;
    stopVisibilityTracking();
    patch({ history, notSureCount: currentNotSureCount() });

    if (staircase.status === "finished") {
      await finishRun();
      return;
    }
    await presentNextLetter();
  } finally {
    advanceInFlight = false;
  }
}

async function onSessionNudgeOrPoll(): Promise<void> {
  if (disposed || setupStopped) {
    return;
  }
  const sessionId = cachedSnapshot.sessionId;
  if (sessionId === null) {
    return;
  }

  const loaded = await sessionStore.loadSession(sessionId);
  if (!loaded.ok || disposed || setupStopped) {
    return;
  }

  if (loaded.data.status === "abandoned") {
    showSessionEndedScreen(MSG_SESSION_ENDED);
    return;
  }

  const uiPhase = cachedSnapshot.phase;
  if (
    (uiPhase === "waiting_for_phone" || uiPhase === "creating") &&
    loaded.data.status === "paired"
  ) {
    patch({ phase: "ready", errorMessage: null, errorDetail: null });
  }

  await tryAdvanceFromResponded();
}

/** Channel + poll. Called from TestClient useEffect when sessionId appears. */
export function watchSession(sessionId: string): void {
  if (disposed || setupStopped) {
    return;
  }
  if (channel === null) {
    channel = joinSessionChannel(sessionId, () => {
      void onSessionNudgeOrPoll();
    });
  }
  if (pollTimer === null) {
    pollTimer = setInterval(() => {
      if (pollInFlight || disposed || setupStopped) {
        return;
      }
      pollInFlight = true;
      void onSessionNudgeOrPoll().finally(() => {
        pollInFlight = false;
      });
    }, POLL_MS);
  }
}

function queueVisibility(state: "hidden" | "visible"): void {
  const generation = visibilityGeneration;
  visibilityChain = visibilityChain
    .then(async () => {
      if (generation !== visibilityGeneration || disposed || setupStopped) {
        return;
      }
      if (state === "hidden") {
        await interruptActiveLetter();
        return;
      }
      await presentFreshAfterVoid();
    })
    .catch((error: unknown) => {
      console.error(error);
    });
}

async function interruptActiveLetter(): Promise<void> {
  if (disposed || setupStopped) {
    return;
  }
  const phase = cachedSnapshot.phase;
  if (phase !== "presenting" && phase !== "awaiting_response") {
    return;
  }
  const trial = activeTrial;
  if (trial === null || trial.voided) {
    return;
  }
  if (!commitVoid(trial)) {
    fail(MSG_CONNECTION);
    return;
  }
  await persistHiddenVoid(trial);
}

async function presentFreshAfterVoid(): Promise<void> {
  if (disposed || setupStopped) {
    return;
  }
  const trial = activeTrial;
  if (trial === null || !trial.voided) {
    return;
  }
  const phase = cachedSnapshot.phase;
  if (phase !== "presenting" && phase !== "awaiting_response") {
    return;
  }
  await captureVoidedAnswerIfResponded();
  if (disposed || setupStopped || cachedSnapshot.phase === "error") {
    return;
  }
  const outcome = evaluateSetup(cachedSnapshot.format);
  if (outcome === null) {
    console.error("setup probe is not registered");
    return;
  }
  if (outcome !== "ok") {
    await stopForSetup(outcome);
    return;
  }
  if (disposed || setupStopped) {
    return;
  }
  if (staircase !== null && staircase.status === "finished") {
    await finishRun();
    return;
  }
  await presentNextLetter();
}

async function presentNextLetter(): Promise<void> {
  if (disposed || setupStopped) {
    return;
  }
  const current = staircase;
  const currentRun = run;
  if (
    current === null ||
    current.status !== "running" ||
    currentRun === null ||
    calibration === null
  ) {
    fail(MSG_SCREEN_CANNOT_SHOW);
    return;
  }

  const target = pickNextTarget(current, Math.random);
  const choices = buildTrialChoices(target, Math.random);
  let leftFlanker: SloanLetter | null = null;
  let rightFlanker: SloanLetter | null = null;
  if (cachedSnapshot.format === "flanked-triplet") {
    const flankers = pickFlankers(target, Math.random);
    leftFlanker = flankers[0];
    rightFlanker = flankers[1];
  }
  const trialIndex = nextTrialIndex;
  nextTrialIndex += 1;
  const stepIndex = current.currentStepIndex;
  activeTrial = {
    trialIndex,
    stepIndex,
    target,
    leftFlanker,
    rightFlanker,
    choices,
    presentationId: null,
    recorded: false,
    voided: false,
  };

  startVisibilityTracking(trialIndex, queueVisibility);

  patch({
    phase: "presenting",
    correction: currentRun.correction,
    currentTrialIndex: trialIndex,
    currentStepIndex: stepIndex,
    currentTarget: target,
    currentLeftFlanker: leftFlanker,
    currentRightFlanker: rightFlanker,
    errorMessage: null,
    errorDetail: null,
  });
}

/**
 * Stable onMeasured identity. Accepts a measurement only for the active
 * presenting trial that has not been recorded yet.
 */
export function handleCanvasMeasured(measurement: OptotypeMeasurement): void {
  void acceptMeasurement(measurement);
}

async function acceptMeasurement(measurement: OptotypeMeasurement): Promise<void> {
  if (disposed || setupStopped || measureInFlight) {
    return;
  }
  if (cachedSnapshot.phase !== "presenting") {
    return;
  }
  const trial = activeTrial;
  if (trial === null || trial.recorded || trial.voided) {
    return;
  }
  if (calibration === null || cachedSnapshot.distanceMm === null) {
    return;
  }
  if (measurement.inkBounds === null) {
    fail("The letter could not be measured on this screen.");
    return;
  }

  measureInFlight = true;
  try {
    if (
      disposed ||
      setupStopped ||
      cachedSnapshot.phase !== "presenting" ||
      activeTrial !== trial ||
      trial.recorded ||
      trial.voided
    ) {
      return;
    }

    const distanceMm = cachedSnapshot.distanceMm;
    const logMar = trial.stepIndex / 10;
    const letterHeightMm = letterHeightMmForLogMar(logMar, distanceMm);
    const strokeWidthMm = strokeWidthMmForLogMar(logMar, distanceMm);
    const letterHeightCssPx = mmToCssPx(letterHeightMm, calibration.cssPxPerMm);
    const letterHeightDevicePx = letterHeightCssPx * calibration.devicePixelRatio;

    const payload: PresentationPayload = {
      trial_index: trial.trialIndex,
      eye: "both",
      logmar_step_index: trial.stepIndex,
      requested_letter_height_mm: letterHeightMm,
      requested_stroke_width_mm: strokeWidthMm,
      requested_letter_height_css_px: letterHeightCssPx,
      requested_letter_height_device_px: letterHeightDevicePx,
      optotypes:
        trial.leftFlanker !== null && trial.rightFlanker !== null
          ? [trial.leftFlanker, trial.target, trial.rightFlanker]
          : [trial.target],
      target_index:
        trial.leftFlanker !== null && trial.rightFlanker !== null ? 1 : 0,
      format:
        trial.leftFlanker !== null && trial.rightFlanker !== null
          ? "flanked-triplet"
          : "single",
      distance_mm_requested: distanceMm,
      actual_letter_height_device_px: measurement.inkBounds.heightPx,
      rendered_at: new Date().toISOString(),
      visibility_confirmed: document.visibilityState === "visible",
    };

    if (trial.leftFlanker !== null && trial.rightFlanker !== null) {
      const arrowHeightCssPx = Math.min(40, Math.max(12, letterHeightCssPx));
      const arrowGapCssPx = Math.min(40, Math.max(12, letterHeightCssPx));
      payload.crowding_spec = {
        spacing_letter_widths: 1,
        spacing_basis: "edge-to-edge",
        arrow: "above-target",
        flanker_rule: "random-distinct",
        arrow_height_css_px: arrowHeightCssPx,
        arrow_gap_css_px: arrowGapCssPx,
      };
    }

    if (trial.target === "H" && measurement.strokeWidthDevicePx !== null) {
      payload.actual_stroke_width_device_px = measurement.strokeWidthDevicePx;
    }

    trial.recorded = true;
    const recorded = await sessionStore.recordPresentation(payload);
    if (!recorded.ok) {
      trial.recorded = false;
      if (isDuplicateTrialIndex(recorded.error) && !skippingDuplicateTrial) {
        skippingDuplicateTrial = true;
        if (!commitVoid(trial)) {
          skippingDuplicateTrial = false;
          fail(MSG_CONNECTION, recorded.error);
          return;
        }
        if (nextTrialIndex <= trial.trialIndex) {
          nextTrialIndex = trial.trialIndex + 1;
        }
        if (staircase !== null && staircase.status === "finished") {
          await finishRun();
          return;
        }
        await presentNextLetter();
        return;
      }
      skippingDuplicateTrial = false;
      fail(MSG_CONNECTION, recorded.error);
      return;
    }
    skippingDuplicateTrial = false;

    if (disposed || setupStopped) {
      return;
    }

    trial.presentationId = recorded.data;
    if (trial.voided) {
      rememberTrial(trial);
      const fresh = activeTrial;
      const freshAlreadySaved =
        fresh !== null &&
        fresh !== trial &&
        !fresh.voided &&
        fresh.presentationId !== null;
      if (!freshAlreadySaved) {
        await persistHiddenVoid(trial);
      }
      return;
    }

    if (activeTrial !== trial || cachedSnapshot.phase !== "presenting") {
      return;
    }

    setVisibilityPresentationId(recorded.data);

    const eventResult = await sessionStore.appendEvent({
      type: "choices_offered",
      payload: {
        presentation_id: recorded.data,
        choices: [...trial.choices],
      },
    });
    if (!eventResult.ok) {
      fail(MSG_CONNECTION, eventResult.error);
      return;
    }

    const currentRun = run;
    if (currentRun === null) {
      fail(MSG_CONNECTION);
      return;
    }
    const stateResult = await writeState(
      "running",
      awaitingResponseState({
        trialIndex: trial.trialIndex,
        presentationId: recorded.data,
        choices: trial.choices,
        run: currentRun,
      }),
    );
    if (!stateResult.ok) {
      fail(MSG_CONNECTION, stateResult.error);
      return;
    }

    if (channel !== null) {
      await channel.sendNudge("awaiting_response");
    }

    patch({ phase: "awaiting_response" });
  } finally {
    measureInFlight = false;
  }
}

function copyRun(source: RunContext): RunContext {
  return {
    correction: source.correction,
    stepIndices: [...source.stepIndices],
    finestLimitedBy: source.finestLimitedBy,
    coarsestLimitedBy: source.coarsestLimitedBy,
    voidedTrialIndices: [...source.voidedTrialIndices],
  };
}

function copyResult(source: RunResult): RunResult {
  if (source.kind === "not-measurable") {
    return { kind: "not-measurable", coarsestStepIndex: source.coarsestStepIndex };
  }
  return { kind: source.kind, stepIndex: source.stepIndex };
}

/**
 * Leaves the finished test on screen and remembers it so the next start()
 * can point that session at the new one. Each test is its own session.
 */
export function prepareTestAgain(): void {
  const sessionId = cachedSnapshot.sessionId;
  const result = cachedSnapshot.result;
  const version = sessionStore.getSnapshot().version;
  if (
    sessionId !== null &&
    version !== null &&
    run !== null &&
    result !== null &&
    finishedScoredLetterCount !== null
  ) {
    rememberedFinishedTest = {
      sessionId,
      version,
      run: copyRun(run),
      result: copyResult(result),
      scoredLetterCount: finishedScoredLetterCount,
    };
  } else {
    rememberedFinishedTest = null;
  }
  stopPoll();
  leaveChannel();
  clearSessionIdFromUrl();
  patch({
    phase: "idle",
    result: null,
    sessionId: null,
    remoteUrl: null,
    qrDataUrl: null,
  });
}

async function handOverFinishedTest(nextSessionId: string): Promise<void> {
  const prior = rememberedFinishedTest;
  if (prior === null) {
    return;
  }
  try {
    const handover = await rpcSetSessionState({
      sessionId: prior.sessionId,
      expectedVersion: prior.version,
      status: "complete",
      currentState: completeState(prior.scoredLetterCount, {
        run: prior.run,
        result: prior.result,
        nextSessionId,
      }),
    });
    if (!handover.ok) {
      console.error(handover.error);
      const logged = await sessionStore.appendEvent({
        type: "handover_failed",
        payload: { message: handover.error.message },
      });
      if (!logged.ok) {
        console.error(logged.error);
      }
    }
  } finally {
    rememberedFinishedTest = null;
  }
}

export async function start(
  distanceMm: number,
  nextCalibration: Calibration,
  format: SessionFormat,
  viewportWidthCssPx: number,
  viewportHeightCssPx: number,
  correction: RunContext["correction"],
): Promise<void> {
  if (startInFlight) {
    return;
  }
  if (cachedSnapshot.phase !== "idle" && cachedSnapshot.phase !== "error") {
    return;
  }

  startInFlight = true;
  disposed = false;
  setupStopped = false;
  leaveChannel();
  stopPoll();
  stopVisibilityTracking();
  activeTrial = null;
  history = [];
  calibration = nextCalibration;
  resetRunMemory();

  try {
    let levels: ReturnType<typeof computeTestLevels>;
    try {
      levels = computeTestLevels({
        distanceMm,
        pixelPitchMm: pixelPitchMm(
          nextCalibration.cssPxPerMm,
          nextCalibration.devicePixelRatio,
        ),
        cssPxPerMm: nextCalibration.cssPxPerMm,
        viewportWidthCssPx,
        viewportHeightCssPx,
        format,
      });
    } catch (error) {
      fail(MSG_SCREEN_CANNOT_SHOW, error);
      return;
    }
    if (levels.stepIndices.length === 0) {
      fail(MSG_SCREEN_CANNOT_SHOW);
      return;
    }

    const nextRun: RunContext = {
      correction,
      stepIndices: levels.stepIndices,
      finestLimitedBy: levels.finestLimitedBy,
      coarsestLimitedBy: levels.coarsestLimitedBy,
      voidedTrialIndices: [],
    };
    let started: ReturnType<typeof startStaircase>;
    try {
      started = startStaircase(nextRun.stepIndices);
    } catch (error) {
      fail(MSG_SCREEN_CANNOT_SHOW, error);
      return;
    }
    if (started.status !== "running") {
      fail(MSG_SCREEN_CANNOT_SHOW);
      return;
    }
    run = nextRun;
    staircase = started;
    nextTrialIndex = 0;

    patch({
      phase: "creating",
      format,
      formatSource: "chosen",
      correction,
      distanceMm,
      sessionId: null,
      remoteUrl: null,
      qrDataUrl: null,
      currentTrialIndex: null,
      currentStepIndex: null,
      currentTarget: null,
      currentLeftFlanker: null,
      currentRightFlanker: null,
      cssPxPerMm: nextCalibration.cssPxPerMm,
      devicePixelRatio: nextCalibration.devicePixelRatio,
      history: [],
      historyLoadFailed: false,
      errorMessage: null,
      errorDetail: null,
      result: null,
      notSureCount: 0,
    });

    sessionStore.reset();
    const created = await sessionStore.createSession({
      distanceMmRequested: distanceMm,
      clientBuild: CLIENT_BUILD,
    });
    if (!created.ok) {
      fail(MSG_CONNECTION, created.error);
      return;
    }

    const attached = await sessionStore.attachCalibration(nextCalibration);
    if (!attached.ok) {
      fail(MSG_CONNECTION, attached.error);
      return;
    }

    const ready = await writeState("created", readyState(nextRun));
    if (!ready.ok) {
      fail(MSG_CONNECTION, ready.error);
      return;
    }

    const startedPayload: { [key: string]: Json } = {
      correction,
      step_indices: [...nextRun.stepIndices],
      finest_limited_by: nextRun.finestLimitedBy,
      coarsest_limited_by: nextRun.coarsestLimitedBy,
      client_build: CLIENT_BUILD,
    };
    if (rememberedFinishedTest !== null) {
      startedPayload.repeat_of = rememberedFinishedTest.sessionId;
    }
    const startedEvent = await sessionStore.appendEvent({
      type: "test_started",
      payload: startedPayload,
    });
    if (!startedEvent.ok) {
      fail(MSG_CONNECTION, startedEvent.error);
      return;
    }

    const sessionId = created.data.id;
    await handOverFinishedTest(sessionId);
    setSessionIdInUrl(sessionId);
    const pairing = await buildRemotePairing(sessionId);

    patch({
      phase: "waiting_for_phone",
      sessionId,
      remoteUrl: pairing.remoteUrl,
      qrDataUrl: pairing.qrDataUrl,
    });
  } finally {
    startInFlight = false;
  }
}

function adoptPausedRun(nextRun: RunContext): boolean {
  let started: ReturnType<typeof startStaircase>;
  try {
    started = startStaircase(nextRun.stepIndices);
  } catch (error) {
    console.error(error);
    return false;
  }
  if (started.status !== "running") {
    return false;
  }
  run = {
    ...nextRun,
    voidedTrialIndices: [...nextRun.voidedTrialIndices],
  };
  staircase = started;
  nextTrialIndex = 0;
  return true;
}

/**
 * Adopt an existing session from the address bar after reload.
 * Never creates, pairs, or attaches calibration.
 */
export async function resume(
  sessionId: string,
  nextCalibration: Calibration,
  viewportWidthCssPx: number,
  viewportHeightCssPx: number,
): Promise<void> {
  if (resumeInFlight) {
    return;
  }
  if (cachedSnapshot.sessionId !== null) {
    return;
  }
  if (!isSessionUuid(sessionId)) {
    return;
  }

  resumeInFlight = true;
  disposed = false;
  setupStopped = false;
  const generation = resumeGeneration;
  leaveChannel();
  stopPoll();
  stopVisibilityTracking();
  activeTrial = null;
  history = [];
  calibration = nextCalibration;
  resetRunMemory();

  patch({
    phase: "resuming",
    sessionId: null,
    remoteUrl: null,
    qrDataUrl: null,
    currentTrialIndex: null,
    currentStepIndex: null,
    currentTarget: null,
    currentLeftFlanker: null,
    currentRightFlanker: null,
    cssPxPerMm: nextCalibration.cssPxPerMm,
    devicePixelRatio: nextCalibration.devicePixelRatio,
    history: [],
    historyLoadFailed: false,
    errorMessage: null,
    errorDetail: null,
    result: null,
    notSureCount: 0,
    correction: null,
  });

  try {
    sessionStore.reset();
    const loaded = await sessionStore.loadSession(sessionId);
    if (!loaded.ok) {
      fail(MSG_CONNECTION, loaded.error);
      return;
    }
    if (disposed || generation !== resumeGeneration) {
      return;
    }

    const view = loaded.data;

    if (view.status === "abandoned") {
      showSessionEndedScreen(MSG_SESSION_ENDED);
      return;
    }

    if (
      view.status !== "created" &&
      view.status !== "paired" &&
      view.status !== "complete" &&
      view.status !== "running"
    ) {
      showSessionEndedScreen(MSG_SESSION_CANNOT_CONTINUE);
      return;
    }

    const distanceMm = view.distanceMmRequested;
    if (distanceMm === null) {
      fail(MSG_SESSION_CANNOT_CONTINUE);
      return;
    }

    const stateFormat = formatFromCurrentState(view.currentState);
    const format: SessionFormat = stateFormat ?? "flanked-triplet";
    const formatSource: FormatSource = stateFormat !== null ? "state" : "resumed-default";
    const loopState = parseLoopState(view.currentState);

    setSessionIdInUrl(view.id);
    const pairing = await buildRemotePairing(view.id);
    if (disposed || generation !== resumeGeneration) {
      return;
    }

    if (view.status === "created" || view.status === "paired") {
      if (loopState === null || loopState.run === null) {
        showSessionEndedScreen(MSG_SESSION_CANNOT_CONTINUE);
        return;
      }
      if (!adoptPausedRun(loopState.run)) {
        showSessionEndedScreen(MSG_SESSION_CANNOT_CONTINUE);
        return;
      }
      patch({
        phase: view.status === "created" ? "waiting_for_phone" : "ready",
        format,
        formatSource,
        correction: loopState.run.correction,
        distanceMm,
        sessionId: view.id,
        remoteUrl: pairing.remoteUrl,
        qrDataUrl: pairing.qrDataUrl,
        errorMessage: null,
        errorDetail: null,
      });
      return;
    }

    if (view.status === "complete") {
      if (
        loopState === null ||
        loopState.phase !== "complete" ||
        loopState.run === null ||
        loopState.result === null
      ) {
        showSessionEndedScreen(MSG_SESSION_CANNOT_CONTINUE);
        return;
      }
      finishedScoredLetterCount = loopState.trialsCompleted;
      run = {
        ...loopState.run,
        voidedTrialIndices: [...loopState.run.voidedTrialIndices],
      };
      const rebuilt = await rebuildHistoryFromAnsweredTrials(view.id);
      if (disposed || generation !== resumeGeneration) {
        return;
      }
      if (rebuilt.error !== null) {
        console.error(rebuilt.error);
      }
      history = withVoidedFlags(rebuilt.history, run.voidedTrialIndices);
      patch({
        phase: "complete",
        format,
        formatSource,
        correction: run.correction,
        result: loopState.result,
        notSureCount: currentNotSureCount(),
        distanceMm,
        sessionId: view.id,
        remoteUrl: pairing.remoteUrl,
        qrDataUrl: pairing.qrDataUrl,
        history,
        historyLoadFailed: rebuilt.historyLoadFailed,
        errorMessage: null,
        errorDetail: rebuilt.error === null ? null : detailText(rebuilt.error),
      });
      return;
    }

    // view.status === "running"
    if (loopState === null || loopState.run === null) {
      showSessionEndedScreen(MSG_SESSION_CANNOT_CONTINUE);
      return;
    }
    const savedRun = loopState.run;
    const rebuilt = await rebuildHistoryFromAnsweredTrials(view.id);
    if (disposed || generation !== resumeGeneration) {
      return;
    }
    if (rebuilt.error !== null) {
      showSessionEndedScreen(MSG_SESSION_CANNOT_CONTINUE, rebuilt.error);
      return;
    }

    const highestPresentedTrialIndex =
      loopState.phase === "awaiting_response" || loopState.phase === "responded"
        ? loopState.trialIndex
        : null;
    const replay = replayRun({
      stepIndices: savedRun.stepIndices,
      answered: rebuilt.history.map((row) => ({
        trialIndex: row.trialIndex,
        stepIndex: row.stepIndex,
        target: row.target,
        responseKind: row.responseKind,
        responseLetter: row.responseLetter,
      })),
      voidedTrialIndices: savedRun.voidedTrialIndices,
      highestPresentedTrialIndex,
    });
    if (replay.status === "inconsistent") {
      showSessionEndedScreen(MSG_SESSION_CANNOT_CONTINUE, replay.reason);
      return;
    }

    const previousVoided = new Set(savedRun.voidedTrialIndices);
    run = {
      ...savedRun,
      voidedTrialIndices: [...replay.voidedTrialIndices],
    };
    staircase = replay.staircase;
    nextTrialIndex = replay.nextTrialIndex;
    history = withVoidedFlags(rebuilt.history, run.voidedTrialIndices);

    const newlyVoided = replay.voidedTrialIndices.filter(
      (trialIndex) => !previousVoided.has(trialIndex),
    );
    for (const trialIndex of newlyVoided) {
      const appended = await sessionStore.appendEvent({
        type: "trial_voided",
        payload: {
          trial_index: trialIndex,
          presentation_id: null,
          reason: "reload",
        },
      });
      if (!appended.ok) {
        console.error(appended.error);
      }
      if (disposed || generation !== resumeGeneration || setupStopped) {
        return;
      }
    }

    patch({
      format,
      formatSource,
      correction: run.correction,
      distanceMm,
      sessionId: view.id,
      remoteUrl: pairing.remoteUrl,
      qrDataUrl: pairing.qrDataUrl,
      history,
      historyLoadFailed: false,
      notSureCount: currentNotSureCount(),
      errorMessage: null,
      errorDetail: null,
    });

    const setup = evaluateSetup("flanked-triplet", {
      viewportWidthCssPx,
      viewportHeightCssPx,
    });
    if (setup === null) {
      console.error("setup probe is not registered");
      showSessionEndedScreen(MSG_SESSION_CANNOT_CONTINUE);
      return;
    }
    if (setup !== "ok") {
      await stopForSetup(setup);
      return;
    }
    if (disposed || generation !== resumeGeneration) {
      return;
    }

    if (staircase.status === "finished") {
      await finishRun();
      return;
    }

    const currentRun = run;
    if (currentRun === null) {
      showSessionEndedScreen(MSG_SESSION_CANNOT_CONTINUE);
      return;
    }
    const ready = await writeState("running", readyState(currentRun));
    if (!ready.ok) {
      fail(MSG_CONNECTION, ready.error);
      return;
    }
    if (disposed || generation !== resumeGeneration || setupStopped) {
      return;
    }
    if (channel !== null) {
      await channel.sendNudge("running");
    }

    await presentNextLetter();
  } finally {
    resumeInFlight = false;
  }
}

export async function beginTrials(): Promise<void> {
  if (beginInFlight || setupStopped) {
    return;
  }
  if (cachedSnapshot.phase !== "ready") {
    return;
  }
  const currentRun = run;
  if (
    currentRun === null ||
    currentRun.stepIndices.length === 0 ||
    staircase === null ||
    staircase.status !== "running"
  ) {
    fail(MSG_SCREEN_CANNOT_SHOW);
    return;
  }

  beginInFlight = true;
  try {
    const session = sessionStore.getSnapshot();
    if (session.status !== "paired" && session.status !== "running") {
      fail("Phone is not paired yet.");
      return;
    }
    if (session.status === "paired") {
      const running = await writeState("running", readyState(currentRun));
      if (!running.ok) {
        fail(MSG_CONNECTION, running.error);
        return;
      }
      if (channel !== null) {
        await channel.sendNudge("running");
      }
    }
    await presentNextLetter();
  } finally {
    beginInFlight = false;
  }
}

export function dispose(): void {
  disposed = true;
  setupStopped = false;
  resumeGeneration += 1;
  stopPoll();
  leaveChannel();
  stopVisibilityTracking();
  startInFlight = false;
  resumeInFlight = false;
  beginInFlight = false;
  measureInFlight = false;
  advanceInFlight = false;
  activeTrial = null;
  history = [];
  calibration = null;
  resetRunMemory();
  rememberedFinishedTest = null;
  finishedScoredLetterCount = null;
  sessionStore.reset();
  emit({ ...SERVER_SNAPSHOT });
}

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
  afterCountdown,
  autoStartDecision,
  COUNTDOWN_NUMBERS,
  COUNTDOWN_STEP_MS,
  MSG_ZOOM_AT_START,
  zoomBlocksStart,
} from "@/lib/acuity/autoStart";
import {
  ALLOWED_TEST_DISTANCES_MM,
  checkDistanceBeforeStart,
  DEFAULT_TEST_DISTANCE_MM,
  msgDistanceNotConfirmed,
  msgScreenCannotShow,
  MSG_SETUP_FAILED,
  storedDistanceMatches,
  type DistanceConfirmation,
} from "@/lib/acuity/distanceSetup";
import { MSG_LETTER_NOT_MEASURED, STOPPED_HEADING } from "@/lib/acuity/flowWording";
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
import { movementSwitchOn } from "@/lib/movement/switch";
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
import { forgetOpenSession, readOpenSession, rememberOpenSession } from "./openSessionMemory";
import {
  setVisibilityPresentationId,
  startVisibilityTracking,
  stopVisibilityTracking,
} from "./visibilityTracker";
import { releaseScreenAwake, requestScreenAwake } from "./wakeLock";
import type {
  DisplayMovement,
  DisplayMovementView,
  LetterPlan,
} from "./movement/displayMovement";

export type TestPhase =
  | "idle"
  | "creating"
  | "resuming"
  | "waiting_for_phone"
  | "ready"
  | "countdown"
  | "presenting"
  | "awaiting_response"
  /** Movement detection only: no letter, the movement hold screen is up. */
  | "movement_hold"
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
  countdownValue: number | null;
  stopReason: "calibration" | "zoom" | "window" | null;
  /** Movement detection only; null whenever the switch is off. */
  movement: DisplayMovementView | null;
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
  /** Movement detection only: the effective distance this letter is drawn and saved at. */
  letterDistanceMm?: number;
  /** Movement detection only: the smoothed distance when this letter was planned. */
  observedDistanceMm?: number;
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
const CLIENT_BUILD = "m6-distance-4";

export const MSG_CONNECTION = "The test lost its connection. Refresh the page to carry on.";
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
  countdownValue: null,
  stopReason: null,
  movement: null,
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
let countdownTimer: ReturnType<typeof setTimeout> | null = null;
let pollInFlight = false;
let startInFlight = false;
let resumeInFlight = false;
let beginInFlight = false;
let distanceAbandonInFlight = false;
let measureInFlight = false;
let advanceInFlight = false;
let disposed = false;
let resumeGeneration = 0;
let setupProbe: SetupProbe | null = null;
let setupStopped = false;
let skippingDuplicateTrial = false;
let backInFlight = false;
let endedSessionClose: Promise<void> | null = null;
let straySessionClose: Promise<void> | null = null;
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

/** Movement detection: null unless the address has movement=1 and a session is open. */
let movement: DisplayMovement | null = null;
let movementModule: Promise<typeof import("./movement/displayMovement") | null> | null = null;

/** Loads the movement code only when the switch is on; null when off or the load failed. */
function loadMovementModule(): Promise<typeof import("./movement/displayMovement") | null> {
  if (!movementSwitchOn(window.location.search)) {
    return Promise.resolve(null);
  }
  movementModule ??= import("./movement/displayMovement").catch((error: unknown) => {
    console.error(error);
    movementModule = null;
    return null;
  });
  return movementModule;
}

/** Stops the movement timers and drops it; pending readings are sent without waiting. */
function releaseMovement(): void {
  const current = movement;
  if (current === null) {
    return;
  }
  movement = null;
  current.stop();
  void current.flush();
  if (cachedSnapshot.movement !== null) {
    patch({ movement: null });
  }
}

function appendMovementEvent(type: string, payload: Json): void {
  void sessionStore.appendEvent({ type, payload }).then(
    (logged) => {
      if (!logged.ok) {
        console.error(logged.error);
      }
    },
    (error: unknown) => {
      console.error(error);
    },
  );
}

/**
 * Movement detection only. Creates the movement state for the session now in
 * the store and logs movement_enabled. Does nothing when the switch is off.
 */
async function startMovementFor(
  sessionId: string,
  distanceMm: number,
  format: SessionFormat,
  viewportWidthCssPx: number,
  viewportHeightCssPx: number,
): Promise<void> {
  const loaded = await loadMovementModule();
  if (loaded === null || calibration === null) {
    return;
  }
  releaseMovement();
  const created = loaded.createDisplayMovement({
    sessionId,
    confirmedDistanceMm: distanceMm,
    cssPxPerMm: calibration.cssPxPerMm,
    devicePixelRatio: calibration.devicePixelRatio,
    viewportWidthCssPx,
    viewportHeightCssPx,
    format,
    initialStepIndex: staircase !== null && staircase.status === "running" ? staircase.currentStepIndex : null,
    hooks: {
      appendEvent: appendMovementEvent,
      pauseLetter: (reason) => {
        queueMovementWork(() => pauseLetterForMovement(reason));
      },
      resume: () => {
        queueMovementWork(resumeAfterMovementHold);
      },
      viewChanged: (view) => {
        if (movement === created) {
          patch({ movement: view });
        }
      },
    },
  });
  movement = created;
  patch({ movement: created.view() });
  appendMovementEvent("movement_enabled", created.enabledPayload());
}

/** Movement pauses and resumes share the visibility chain, so they never overlap a void or a fresh letter. */
function queueMovementWork(work: () => Promise<void>): void {
  const generation = visibilityGeneration;
  visibilityChain = visibilityChain
    .then(async () => {
      if (generation !== visibilityGeneration || disposed || setupStopped) {
        return;
      }
      await work();
    })
    .catch((error: unknown) => {
      console.error(error);
    });
}

function enterMovementHold(): void {
  stopVisibilityTracking();
  patch({
    phase: "movement_hold",
    currentTrialIndex: null,
    currentStepIndex: null,
    currentTarget: null,
    currentLeftFlanker: null,
    currentRightFlanker: null,
    errorMessage: null,
    errorDetail: null,
    movement: movement?.view() ?? null,
  });
}

/** A letter on screen while the person moved or the marker was lost: voided as on a hidden page, then the hold screen. */
async function pauseLetterForMovement(reason: "moved" | "marker_lost"): Promise<void> {
  if (disposed || setupStopped || movement === null) {
    return;
  }
  const phase = cachedSnapshot.phase;
  if (phase !== "presenting" && phase !== "awaiting_response") {
    return;
  }
  const trial = activeTrial;
  if (trial !== null && !trial.voided) {
    if (!commitVoid(trial)) {
      fail(MSG_SESSION_CANNOT_CONTINUE, "void_commit_failed");
      return;
    }
    enterMovementHold();
    await persistHiddenVoid(trial, reason);
    return;
  }
  enterMovementHold();
}

/** The hold is over: a fresh letter at the same step, as after a hidden page. */
async function resumeAfterMovementHold(): Promise<void> {
  if (disposed || setupStopped || cachedSnapshot.phase !== "movement_hold") {
    return;
  }
  await captureVoidedAnswerIfResponded();
  if (disposed || setupStopped || cachedSnapshot.phase !== "movement_hold") {
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
  if (staircase !== null && staircase.status === "finished") {
    await finishRun();
    return;
  }
  await presentNextLetter();
}

const SESSION_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isSessionUuid(value: string): boolean {
  return SESSION_UUID_RE.test(value);
}

function testUrl(sessionId: string | null): string {
  const params = new URLSearchParams();
  if (sessionId !== null) {
    params.set("session", sessionId);
  }
  const diag = new URLSearchParams(window.location.search).get("diag");
  if (diag !== null) {
    params.set("diag", diag);
  }
  const movementParam = new URLSearchParams(window.location.search).get("movement");
  if (movementParam !== null) {
    params.set("movement", movementParam);
  }
  const query = params.toString();
  return query === "" ? window.location.pathname : `${window.location.pathname}?${query}`;
}

function addressSessionId(): string | null {
  return new URLSearchParams(window.location.search).get("session");
}

/** Adds one history entry when the address goes from no session to a session; otherwise replaces. */
function setSessionIdInUrl(sessionId: string): void {
  if (addressSessionId() === null) {
    window.history.pushState({ vcp: "session" }, "", testUrl(sessionId));
    return;
  }
  window.history.replaceState(window.history.state, "", testUrl(sessionId));
}

function clearSessionIdFromUrl(): void {
  window.history.replaceState(window.history.state, "", testUrl(null));
}

/**
 * Browser Back or Forward on the test page. Returns "back-to-start" when the
 * address lost its session while the page is past Start; the caller then
 * takes the same path as the Back to the start button. While a session is
 * being created or resumed the address is left alone.
 */
export function addressPopped(): "back-to-start" | "none" {
  const phase = cachedSnapshot.phase;
  if (phase === "creating" || phase === "resuming") {
    return "none";
  }
  const sessionId = addressSessionId();
  if (sessionId === null) {
    return phase === "idle" ? "none" : "back-to-start";
  }
  if (sessionId !== cachedSnapshot.sessionId) {
    window.history.replaceState(window.history.state, "", testUrl(cachedSnapshot.sessionId));
  }
  return "none";
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

type WriteResult = Awaited<ReturnType<typeof sessionStore.setState>>;

function writeState(
  status: "created" | "paired" | "running" | "complete" | "abandoned",
  currentState: Json,
): Promise<WriteResult> {
  return enqueueState(() => sessionStore.setState(status, currentState));
}

/**
 * On a version conflict, reloads once and writes again. A session that the
 * reload shows complete or abandoned is not written.
 */
async function writePairedRetryOnce(currentState: Json): Promise<WriteResult> {
  const first = await writeState("paired", currentState);
  if (first.ok || first.error.kind !== "version-conflict") {
    return first;
  }
  const sessionId = sessionStore.getSnapshot().sessionId;
  if (sessionId === null) {
    return first;
  }
  const reloaded = await sessionStore.loadSession(sessionId);
  if (!reloaded.ok) {
    return { ok: false, error: reloaded.error };
  }
  if (reloaded.data.status === "complete" || reloaded.data.status === "abandoned") {
    return first;
  }
  return writeState("paired", currentState);
}

/**
 * The status is read inside the state queue, at the version the write expects,
 * so a session that is complete, already abandoned or no longer the one in the
 * store is never written. Returns null when nothing was written.
 */
function writeAbandoned(sessionId: string, currentState: Json): Promise<WriteResult | null> {
  return enqueueState(async () => {
    const session = sessionStore.getSnapshot();
    if (
      session.sessionId !== sessionId ||
      session.status === null ||
      session.status === "complete" ||
      session.status === "abandoned"
    ) {
      return null;
    }
    return sessionStore.setState("abandoned", currentState);
  });
}

/** Never throws. Reloads once and writes again on a version conflict; logs other failures. */
async function writeAbandonedRetryOnce(currentState: Json): Promise<void> {
  try {
    const sessionId = sessionStore.getSnapshot().sessionId;
    if (sessionId === null) {
      return;
    }
    const first = await writeAbandoned(sessionId, currentState);
    if (first === null || first.ok) {
      return;
    }
    if (first.error.kind !== "version-conflict") {
      console.error(first.error);
      return;
    }
    const reloaded = await sessionStore.loadSession(sessionId);
    if (!reloaded.ok) {
      console.error(reloaded.error);
      return;
    }
    const second = await writeAbandoned(sessionId, currentState);
    if (second !== null && !second.ok) {
      console.error(second.error);
    }
  } catch (error) {
    console.error(error);
  }
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
 * address bar so a refresh does not reopen it. Stays synchronous for its
 * callers: an open session is closed in the background, after any earlier
 * close, and the store is reset after that close only if it still holds the
 * same session. start() and backToStart() await endedSessionClose, so no new
 * session can enter the store while a close runs.
 */
function showSessionEndedScreen(message: string, reason: string, error?: unknown): void {
  if (setupStopped) {
    return;
  }
  clearCountdown();
  stopPoll();
  leaveChannel();
  stopVisibilityTracking();
  releaseScreenAwake();
  activeTrial = null;
  clearSessionIdFromUrl();
  reportClientError(message, reason, error);
  const heldSessionId = sessionStore.getSnapshot().sessionId;
  const heldRun = run;
  const previousClose = endedSessionClose;
  const close = (async () => {
    if (previousClose !== null) {
      await previousClose;
    }
    await closeOpenSession(reason, heldRun);
    if (sessionStore.getSnapshot().sessionId === heldSessionId) {
      sessionStore.reset();
    }
  })();
  endedSessionClose = close;
  void close.finally(() => {
    if (endedSessionClose === close) {
      endedSessionClose = null;
    }
  });
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
    errorDetail: errorDetailText(reason, error),
    result: null,
    notSureCount: 0,
    correction: null,
    countdownValue: null,
    stopReason: null,
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
  const remoteUrl = movementSwitchOn(window.location.search)
    ? `${window.location.origin}/remote?session=${sessionId}&movement=1`
    : `${window.location.origin}/remote?session=${sessionId}`;
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

function errorDetailText(reason: string, error: unknown): string {
  return error === undefined ? reason : `${reason}: ${detailText(error)}`;
}

/**
 * Logs the failure and, when a session is held, appends client_error to it
 * without waiting. appendEvent reads the session id before its first await.
 */
function reportClientError(message: string, reason: string, error: unknown): void {
  console.error(reason, error ?? "");
  if (sessionStore.getSnapshot().sessionId === null) {
    return;
  }
  void sessionStore
    .appendEvent({
      type: "client_error",
      payload: {
        reason,
        message: error === undefined ? message : detailText(error),
      },
    })
    .then(
      (logged) => {
        if (!logged.ok) {
          console.error(logged.error);
        }
      },
      (appendError: unknown) => {
        console.error(appendError);
      },
    );
}

function fail(message: string, reason: string, error?: unknown): void {
  clearCountdown();
  stopVisibilityTracking();
  releaseScreenAwake();
  reportClientError(message, reason, error);
  patch({
    phase: "error",
    errorMessage: message,
    errorDetail: errorDetailText(reason, error),
    countdownValue: null,
  });
}

function clearCountdown(): void {
  if (countdownTimer !== null) {
    clearTimeout(countdownTimer);
    countdownTimer = null;
  }
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
  if (
    phase !== "ready" &&
    phase !== "countdown" &&
    phase !== "presenting" &&
    phase !== "awaiting_response" &&
    phase !== "movement_hold"
  ) {
    return;
  }
  if (movement !== null && setupProbe !== null) {
    const probe = setupProbe();
    movement.viewportChanged(probe.viewportWidthCssPx, probe.viewportHeightCssPx);
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
  releaseMovement();
}

async function stopForSetup(reason: "calibration" | "zoom" | "window"): Promise<void> {
  if (setupStopped || disposed) {
    return;
  }
  setupStopped = true;
  clearCountdown();
  visibilityGeneration += 1;
  const currentRun = run;
  if (movement !== null) {
    await movement.flush();
  }
  if (currentRun !== null) {
    const eventResult = await sessionStore.appendEvent({
      type: "stopped_for_setup",
      payload: { reason },
    });
    if (!eventResult.ok) {
      console.error(eventResult.error);
    }
    await writeAbandonedRetryOnce(readyState(currentRun));
  }
  stopPoll();
  leaveChannel();
  stopVisibilityTracking();
  releaseScreenAwake();
  activeTrial = null;
  clearSessionIdFromUrl();
  patch({
    phase: "stopped",
    sessionId: null,
    errorMessage: STOPPED_HEADING,
    errorDetail: `stopped_for_setup: ${reason}`,
    currentTrialIndex: null,
    currentStepIndex: null,
    currentTarget: null,
    currentLeftFlanker: null,
    currentRightFlanker: null,
    countdownValue: null,
    stopReason: reason,
  });
}

/**
 * Closes the held session as abandoned unless it is complete or already
 * abandoned, then tears down the poll, channel, countdown, wake lock and
 * ?session=. Never throws.
 */
async function closeOpenSession(
  reason: string,
  runForState: RunContext | null = run,
): Promise<void> {
  try {
    if (movement !== null) {
      await movement.flush();
    }
    const session = sessionStore.getSnapshot();
    if (
      session.sessionId !== null &&
      session.status !== null &&
      session.status !== "complete" &&
      session.status !== "abandoned"
    ) {
      const logged = await sessionStore.appendEvent({
        type: "session_closed",
        payload: { reason },
      });
      if (!logged.ok) {
        console.error(logged.error);
      }
      await writeAbandonedRetryOnce(readyState(runForState));
    }
    if (session.sessionId !== null) {
      forgetOpenSession(session.sessionId);
    }
  } catch (error) {
    console.error(error);
  }
  try {
    stopPoll();
    leaveChannel();
    clearCountdown();
    releaseScreenAwake();
    clearSessionIdFromUrl();
  } catch (error) {
    console.error(error);
  }
}

/**
 * Called once per page load when ?session= is valid but calibration is not,
 * and for a session this tab left open. Loads that session and closes it if
 * it is still open.
 */
export async function closeSessionById(
  sessionId: string,
  reason = "calibration_invalid_on_reload",
): Promise<void> {
  if (!isSessionUuid(sessionId)) {
    return;
  }
  if (cachedSnapshot.sessionId !== null || cachedSnapshot.phase !== "idle") {
    return;
  }
  try {
    sessionStore.reset();
    const loaded = await sessionStore.loadSession(sessionId);
    if (!loaded.ok) {
      console.error(loaded.error);
      return;
    }
    if (loaded.data.status === "complete" || loaded.data.status === "abandoned") {
      return;
    }
    const loopState = parseLoopState(loaded.data.currentState);
    await closeOpenSession(reason, loopState === null ? null : loopState.run);
  } catch (error) {
    console.error(error);
  }
}

/**
 * Called on mount when the address holds no valid session. Closes the
 * session this tab left open, then forgets it. start() awaits this, so no
 * new session is created while the close runs.
 */
export function closeStraySession(): void {
  if (straySessionClose !== null) {
    return;
  }
  const sessionId = readOpenSession();
  if (sessionId === null) {
    return;
  }
  const close = (async () => {
    await closeSessionById(sessionId, "stray_session_on_open");
    forgetOpenSession();
  })();
  straySessionClose = close;
  void close.finally(() => {
    if (straySessionClose === close) {
      straySessionClose = null;
    }
  });
}

/**
 * The session row does not hold the distance the letters are drawn at.
 * Logs, abandons the session and shows the setup failure.
 */
async function abandonForDistanceMismatch(
  confirmedMm: number | null,
  storedMm: number | null,
): Promise<void> {
  if (distanceAbandonInFlight) {
    return;
  }
  distanceAbandonInFlight = true;
  clearCountdown();
  stopPoll();
  leaveChannel();
  try {
    const mismatchEvent = await sessionStore.appendEvent({
      type: "distance_mismatch",
      payload: {
        confirmed_mm: confirmedMm,
        stored_mm: storedMm,
      },
    });
    if (!mismatchEvent.ok) {
      console.error(mismatchEvent.error);
    }
    await writeAbandonedRetryOnce(readyState(run));
    fail(
      MSG_SETUP_FAILED,
      `distance_mismatch confirmed ${String(confirmedMm)} stored ${String(storedMm)}`,
    );
  } finally {
    distanceAbandonInFlight = false;
  }
}

function startCountdown(): void {
  if (cachedSnapshot.phase !== "ready" || countdownTimer !== null) {
    return;
  }
  let position = 0;
  patch({ phase: "countdown", countdownValue: COUNTDOWN_NUMBERS[0] ?? null });
  const step = (): void => {
    position += 1;
    const next = COUNTDOWN_NUMBERS[position];
    if (next !== undefined) {
      patch({ countdownValue: next });
      countdownTimer = setTimeout(step, COUNTDOWN_STEP_MS);
      return;
    }
    countdownTimer = null;
    patch({ countdownValue: null });
    finishCountdown();
  };
  countdownTimer = setTimeout(step, COUNTDOWN_STEP_MS);
}

function finishCountdown(): void {
  if (disposed || setupStopped || cachedSnapshot.phase !== "countdown") {
    return;
  }
  const outcome = afterCountdown(evaluateSetup(cachedSnapshot.format));
  if (outcome.kind === "begin") {
    void beginTrials();
    return;
  }
  if (outcome.kind === "stop-setup") {
    void stopForSetup(outcome.reason);
    return;
  }
  fail(MSG_SETUP_FAILED, "after_countdown_setup_null");
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

async function persistHiddenVoid(
  trial: ActiveTrial,
  reason: "page_hidden" | "moved" | "marker_lost" = "page_hidden",
): Promise<void> {
  const generation = resumeGeneration;
  if (!voidEventSent.has(trial.trialIndex)) {
    voidEventSent.add(trial.trialIndex);
    const eventResult = await sessionStore.appendEvent({
      type: "trial_voided",
      payload: {
        trial_index: trial.trialIndex,
        presentation_id: trial.presentationId,
        reason,
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
  if (stateResult.ok || generation !== resumeGeneration) {
    return;
  }
  voidStateSaved.delete(presentationId);
  if (stateResult.error.kind === "version-conflict") {
    await captureVoidedAnswerIfResponded();
    if (generation !== resumeGeneration) {
      return;
    }
    const latestRun = run;
    const latestPresentationId = trial.presentationId;
    if (latestRun === null || latestPresentationId === null || disposed || setupStopped) {
      fail(MSG_SESSION_CANNOT_CONTINUE, "void_state_conflict_unrecoverable", stateResult.error);
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
      if (generation === resumeGeneration) {
        fail(MSG_CONNECTION, "void_state_retry_failed", retry.error);
      }
      return;
    }
    voidStateSaved.add(latestPresentationId);
    return;
  }
  fail(MSG_CONNECTION, "void_state_write_failed", stateResult.error);
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
  const generation = resumeGeneration;
  const rewritten = await writeState(
    "running",
    awaitingResponseState({
      trialIndex: fresh.trialIndex,
      presentationId: fresh.presentationId,
      choices: fresh.choices,
      run: currentRun,
    }),
  );
  if (generation !== resumeGeneration) {
    return;
  }
  if (!rewritten.ok) {
    fail(MSG_CONNECTION, "restore_fresh_write_failed", rewritten.error);
    return;
  }
  if (channel !== null) {
    await channel.sendNudge("awaiting_response");
  }
}

/** Logged only against its own session: after Back the store may hold a later one. */
async function logTestQualityFailure(sessionId: string | null, message: string): Promise<void> {
  if (sessionId === null || sessionStore.getSnapshot().sessionId !== sessionId) {
    return;
  }
  const logged = await sessionStore.appendEvent({
    type: "test_quality_write_failed",
    payload: { message },
  });
  if (!logged.ok) {
    console.error(logged.error);
  }
}

async function finishRun(): Promise<void> {
  if (disposed || setupStopped) {
    return;
  }
  const generation = resumeGeneration;
  const runSessionId = sessionStore.getSnapshot().sessionId;
  const currentRun = run;
  const currentStaircase = staircase;
  if (currentRun === null || currentStaircase === null || currentStaircase.status !== "finished") {
    fail(MSG_SESSION_CANNOT_CONTINUE, "finish_staircase_not_finished");
    return;
  }
  const distanceMm = cachedSnapshot.distanceMm;
  if (distanceMm === null) {
    await closeOpenSession("resume_distance");
    showSessionEndedScreen(MSG_SESSION_CANNOT_CONTINUE, "finish distance null");
    return;
  }
  const result = currentStaircase.result;
  const letterCount = scoredLetterCount(currentStaircase);
  finishedScoredLetterCount = letterCount;
  const finishingMovement = movement;
  if (finishingMovement !== null) {
    finishingMovement.stop();
    await finishingMovement.flush();
  }
  const done = await writeState(
    "complete",
    completeState(letterCount, { run: currentRun, result }),
  );
  if (!done.ok) {
    if (generation !== resumeGeneration) {
      return;
    }
    fail(MSG_CONNECTION, "finish_complete_write_failed", done.error);
    return;
  }
  if (runSessionId !== null) {
    forgetOpenSession(runSessionId);
  }
  // A completed session gets its quality row even after Back; the nudge and the screen only while this run is current.
  if (!disposed && !setupStopped && generation === resumeGeneration && channel !== null) {
    await channel.sendNudge("complete");
  }
  if (sessionStore.getSnapshot().sessionId !== runSessionId) {
    return;
  }
  try {
    const quality: Json = testQualityPayload({
      result,
      run: currentRun,
      distanceMm,
      notSureCount: currentNotSureCount(),
    });
    const observed = finishingMovement?.qualityExtras() ?? null;
    const qualityResult = await sessionStore.upsertTestQuality(
      observed === null ? quality : { ...(quality as { [key: string]: Json }), ...observed },
    );
    if (!qualityResult.ok) {
      console.error(qualityResult.error);
      await logTestQualityFailure(runSessionId, qualityResult.error.message);
    }
  } catch (error) {
    console.error(error);
    const message = error instanceof Error ? error.message : String(error);
    await logTestQualityFailure(runSessionId, message);
  }
  if (disposed || setupStopped || generation !== resumeGeneration) {
    return;
  }
  activeTrial = null;
  stopVisibilityTracking();
  releaseScreenAwake();
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
  const generation = resumeGeneration;
  const sessionId = cachedSnapshot.sessionId;
  if (sessionId === null || disposed || setupStopped) {
    return;
  }
  const loaded = await sessionStore.loadSession(sessionId);
  if (!loaded.ok || disposed || setupStopped || generation !== resumeGeneration) {
    return;
  }
  if (loaded.data.status === "abandoned") {
    showSessionEndedScreen(MSG_SESSION_ENDED, "capture_void_session_abandoned");
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
  const generation = resumeGeneration;
  try {
    const loaded = await sessionStore.loadSession(sessionId);
    if (!loaded.ok || disposed || setupStopped || generation !== resumeGeneration) {
      return;
    }
    if (loaded.data.status === "abandoned") {
      showSessionEndedScreen(MSG_SESSION_ENDED, "advance_session_abandoned");
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
    if (movement !== null) {
      movement.letterScored(trial.observedDistanceMm);
      movement.letterEnded();
    }
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
  if (cachedSnapshot.sessionId !== sessionId) {
    return;
  }

  if (loaded.data.status === "abandoned") {
    showSessionEndedScreen(MSG_SESSION_ENDED, "poll_session_abandoned");
    return;
  }

  const uiPhase = cachedSnapshot.phase;
  if (
    (uiPhase === "waiting_for_phone" || uiPhase === "creating") &&
    loaded.data.status === "paired"
  ) {
    patch({ phase: "ready", errorMessage: null, errorDetail: null });
  }

  const loopState = parseLoopState(loaded.data.currentState);
  const decision = autoStartDecision({
    uiPhase: cachedSnapshot.phase,
    sessionStatus: loaded.data.status,
    positionConfirmed:
      loopState !== null && loopState.phase === "ready" && loopState.positionConfirmed === true,
    storedDistanceMm: loaded.data.distanceMmRequested,
    snapshotDistanceMm: cachedSnapshot.distanceMm,
    setup: evaluateSetup(cachedSnapshot.format),
  });
  if (decision.kind === "stop-distance") {
    await abandonForDistanceMismatch(
      cachedSnapshot.distanceMm,
      loaded.data.distanceMmRequested,
    );
    return;
  }
  if (decision.kind === "stop-setup") {
    await stopForSetup(decision.reason);
    return;
  }
  if (decision.kind === "start-countdown") {
    // Not awaited: the phase must turn "countdown" in this tick so a concurrent nudge waits.
    void sessionStore
      .appendEvent({
        type: "position_confirmed",
        payload: { distance_mm: cachedSnapshot.distanceMm },
      })
      .then((logged) => {
        if (!logged.ok) {
          console.error(logged.error);
        }
      });
    startCountdown();
    return;
  }

  await tryAdvanceFromResponded();
}

/** Channel + poll. Called from TestClient useEffect when sessionId appears. */
export function watchSession(sessionId: string): void {
  if (disposed || setupStopped) {
    return;
  }
  if (channel === null) {
    const onNudge = (): void => {
      void onSessionNudgeOrPoll();
    };
    channel =
      movement !== null ? movement.joinChannel(sessionId, onNudge) : joinSessionChannel(sessionId, onNudge);
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
    fail(MSG_SESSION_CANNOT_CONTINUE, "void_commit_failed");
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
    fail(
      msgScreenCannotShow(cachedSnapshot.distanceMm ?? DEFAULT_TEST_DISTANCE_MM),
      "staircase_not_running",
    );
    return;
  }

  let movementPlan: LetterPlan | null = null;
  if (movement !== null) {
    movementPlan = movement.planLetter(current.currentStepIndex);
    if (movementPlan.kind === "hold") {
      enterMovementHold();
      return;
    }
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
  if (movement !== null && movementPlan !== null && movementPlan.kind === "show") {
    // One value for the drawing (snapshot) and the saved sizes (activeTrial).
    activeTrial.letterDistanceMm = movementPlan.effectiveDistanceMm;
    activeTrial.observedDistanceMm = movementPlan.observedDistanceMm;
    movement.letterShown(movementPlan);
    patch({ movement: movement.view() });
  }

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
  if (document.visibilityState === "hidden") {
    // No visibilitychange fires for a letter put up in a hidden tab; commitVoid runs before the first await.
    void interruptActiveLetter();
  }
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
    fail(MSG_LETTER_NOT_MEASURED, "presentation_measure_failed");
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

    const confirmedDistanceMm = cachedSnapshot.distanceMm;
    const distanceMm = trial.letterDistanceMm ?? confirmedDistanceMm;
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
      distance_mm_requested: confirmedDistanceMm,
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

    if (trial.observedDistanceMm !== undefined) {
      payload.distance_mm_observed = trial.observedDistanceMm;
    }

    if (document.visibilityState === "hidden" && !commitVoid(trial)) {
      fail(MSG_SESSION_CANNOT_CONTINUE, "void_commit_failed");
      return;
    }
    trial.recorded = true;
    const generation = resumeGeneration;
    const recorded = await sessionStore.recordPresentation(payload);
    if (generation !== resumeGeneration) {
      return;
    }
    if (!recorded.ok) {
      trial.recorded = false;
      if (isDuplicateTrialIndex(recorded.error) && !skippingDuplicateTrial) {
        skippingDuplicateTrial = true;
        if (!commitVoid(trial)) {
          skippingDuplicateTrial = false;
          fail(MSG_CONNECTION, "duplicate_trial_void_failed", recorded.error);
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
      fail(MSG_CONNECTION, "presentation_record_failed", recorded.error);
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
    movement?.letterRecorded(recorded.data);

    const eventResult = await sessionStore.appendEvent({
      type: "choices_offered",
      payload: {
        presentation_id: recorded.data,
        choices: [...trial.choices],
      },
    });
    if (generation !== resumeGeneration) {
      return;
    }
    if (!eventResult.ok) {
      fail(MSG_CONNECTION, "choices_offered_failed", eventResult.error);
      return;
    }

    const currentRun = run;
    if (currentRun === null) {
      fail(MSG_SESSION_CANNOT_CONTINUE, "presentation_run_missing");
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
    if (generation !== resumeGeneration) {
      return;
    }
    if (!stateResult.ok) {
      fail(MSG_CONNECTION, "awaiting_response_write_failed", stateResult.error);
      return;
    }

    if (channel !== null) {
      await channel.sendNudge("awaiting_response");
    }
    if (generation !== resumeGeneration) {
      return;
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

/** Clears a start screen message left by an earlier Start press, which may name the other distance. */
export function dismissStartError(): void {
  if (
    cachedSnapshot.phase === "error" &&
    cachedSnapshot.sessionId === null &&
    cachedSnapshot.errorMessage !== null
  ) {
    patch({ errorMessage: null, errorDetail: null });
  }
}

/**
 * Closes the held session unless it is complete or already abandoned, then
 * returns to the start screen holding nothing from it: same module state and
 * snapshot as a first visit.
 */
export async function backToStart(): Promise<void> {
  if (backInFlight) {
    return;
  }
  backInFlight = true;
  const heldSessionId = sessionStore.getSnapshot().sessionId ?? cachedSnapshot.sessionId;
  // Letter work still in flight stops at its next check instead of drawing or writing.
  resumeGeneration += 1;
  setupStopped = true;
  try {
    clearCountdown();
    stopPoll();
    leaveChannel();
    stopVisibilityTracking();
    if (endedSessionClose !== null) {
      await endedSessionClose;
    }
    await closeOpenSession("back_to_start");
    if (heldSessionId !== null) {
      forgetOpenSession(heldSessionId);
    }
    setupStopped = false;
    releaseScreenAwake();
    activeTrial = null;
    history = [];
    calibration = null;
    resetRunMemory();
    rememberedFinishedTest = null;
    finishedScoredLetterCount = null;
    sessionStore.reset();
    emit({ ...SERVER_SNAPSHOT });
  } finally {
    backInFlight = false;
  }
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
  distance: DistanceConfirmation,
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
  const generation = resumeGeneration;
  if (straySessionClose !== null) {
    await straySessionClose;
    if (generation !== resumeGeneration) {
      startInFlight = false;
      return;
    }
  }
  if (endedSessionClose !== null) {
    await endedSessionClose;
    if (generation !== resumeGeneration) {
      startInFlight = false;
      return;
    }
  }
  if (cachedSnapshot.sessionId !== null || sessionStore.getSnapshot().sessionId !== null) {
    await closeOpenSession("new_start");
    if (generation !== resumeGeneration) {
      startInFlight = false;
      return;
    }
  }
  sessionStore.reset();
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
    const gate = checkDistanceBeforeStart(distance);
    if (!gate.ok) {
      if (gate.reason === "not-confirmed") {
        fail(msgDistanceNotConfirmed(distance.distanceMm), "start_distance_not_confirmed");
      } else {
        fail(MSG_SETUP_FAILED, `start_distance_not_allowed ${String(distance.distanceMm)}`);
      }
      return;
    }
    const distanceMm = gate.distanceMm;
    if (setupProbe !== null && zoomBlocksStart(setupProbe().zoomState)) {
      fail(MSG_ZOOM_AT_START, "start_zoom_not_default");
      return;
    }

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
      fail(msgScreenCannotShow(distanceMm), "start_levels_failed", error);
      return;
    }
    if (levels.stepIndices.length === 0) {
      fail(msgScreenCannotShow(distanceMm), "start_no_drawable_levels");
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
      fail(msgScreenCannotShow(distanceMm), "start_staircase_failed", error);
      return;
    }
    if (started.status !== "running") {
      fail(msgScreenCannotShow(distanceMm), "start_staircase_not_running");
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
      stopReason: null,
    });

    const created = await sessionStore.createSession({
      distanceMmRequested: distanceMm,
      clientBuild: CLIENT_BUILD,
    });
    if (!created.ok) {
      fail(MSG_CONNECTION, "create_session_failed", created.error);
      return;
    }
    rememberOpenSession(created.data.id);
    if (!storedDistanceMatches(distanceMm, created.data.distanceMmRequested)) {
      await abandonForDistanceMismatch(distanceMm, created.data.distanceMmRequested);
      return;
    }

    const attached = await sessionStore.attachCalibration(nextCalibration);
    if (!attached.ok) {
      fail(MSG_CONNECTION, "attach_calibration_failed", attached.error);
      return;
    }

    const ready = await writeState("created", readyState(nextRun));
    if (!ready.ok) {
      fail(MSG_CONNECTION, "start_state_write_failed", ready.error);
      return;
    }

    const confirmedEvent = await sessionStore.appendEvent({
      type: "distance_confirmed",
      payload: { distance_mm: distanceMm, recommended_mm: DEFAULT_TEST_DISTANCE_MM },
    });
    if (!confirmedEvent.ok) {
      fail(MSG_CONNECTION, "distance_confirmed_event_failed", confirmedEvent.error);
      return;
    }

    const startedPayload: { [key: string]: Json } = {
      correction,
      distance_mm: distanceMm,
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
      fail(MSG_CONNECTION, "test_started_event_failed", startedEvent.error);
      return;
    }

    const sessionId = created.data.id;
    if (movementSwitchOn(window.location.search)) {
      await startMovementFor(sessionId, distanceMm, format, viewportWidthCssPx, viewportHeightCssPx);
    }
    await handOverFinishedTest(sessionId);
    setSessionIdInUrl(sessionId);
    const pairing = await buildRemotePairing(sessionId);

    patch({
      phase: "waiting_for_phone",
      sessionId,
      remoteUrl: pairing.remoteUrl,
      qrDataUrl: pairing.qrDataUrl,
    });
    requestScreenAwake();
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
    stopReason: null,
  });

  try {
    sessionStore.reset();
    const loaded = await sessionStore.loadSession(sessionId);
    if (!loaded.ok) {
      fail(MSG_CONNECTION, "resume_load_failed", loaded.error);
      return;
    }
    if (disposed || generation !== resumeGeneration) {
      return;
    }

    const view = loaded.data;

    if (view.status === "abandoned") {
      showSessionEndedScreen(MSG_SESSION_ENDED, "resume_status_abandoned");
      return;
    }

    if (
      view.status !== "created" &&
      view.status !== "paired" &&
      view.status !== "complete" &&
      view.status !== "running"
    ) {
      showSessionEndedScreen(MSG_SESSION_CANNOT_CONTINUE, `resume_status_${String(view.status)}`);
      return;
    }

    const loopState = parseLoopState(view.currentState);
    const distanceMm = view.distanceMmRequested;
    if (distanceMm === null || !ALLOWED_TEST_DISTANCES_MM.includes(distanceMm)) {
      await closeOpenSession("resume_distance", loopState === null ? null : loopState.run);
      if (disposed || generation !== resumeGeneration) {
        return;
      }
      showSessionEndedScreen(MSG_SESSION_CANNOT_CONTINUE, `resume distance ${String(distanceMm)}`);
      return;
    }

    const stateFormat = formatFromCurrentState(view.currentState);
    const format: SessionFormat = stateFormat ?? "flanked-triplet";
    const formatSource: FormatSource = stateFormat !== null ? "state" : "resumed-default";

    setSessionIdInUrl(view.id);
    const pairing = await buildRemotePairing(view.id);
    if (disposed || generation !== resumeGeneration) {
      return;
    }
    if (movementSwitchOn(window.location.search) && view.status !== "complete") {
      await startMovementFor(view.id, distanceMm, format, viewportWidthCssPx, viewportHeightCssPx);
      if (disposed || generation !== resumeGeneration) {
        return;
      }
    }

    if (view.status === "created" || view.status === "paired") {
      if (loopState === null || loopState.run === null) {
        showSessionEndedScreen(MSG_SESSION_CANNOT_CONTINUE, "resume_paused_state_missing");
        return;
      }
      if (!adoptPausedRun(loopState.run)) {
        showSessionEndedScreen(MSG_SESSION_CANNOT_CONTINUE, "resume_paused_run_invalid");
        return;
      }
      const clearPosition =
        view.status === "paired" &&
        loopState.phase === "ready" &&
        loopState.positionConfirmed === true;
      if (clearPosition) {
        const cleared = await writePairedRetryOnce(readyState(loopState.run));
        if (!cleared.ok) {
          fail(MSG_CONNECTION, "resume_clear_tap_failed", cleared.error);
          return;
        }
        if (disposed || generation !== resumeGeneration || setupStopped) {
          return;
        }
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
      requestScreenAwake();
      return;
    }

    if (view.status === "complete") {
      if (
        loopState === null ||
        loopState.phase !== "complete" ||
        loopState.run === null ||
        loopState.result === null
      ) {
        showSessionEndedScreen(MSG_SESSION_CANNOT_CONTINUE, "resume_complete_state_invalid");
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
      releaseScreenAwake();
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
      showSessionEndedScreen(MSG_SESSION_CANNOT_CONTINUE, "resume_running_state_missing");
      return;
    }
    const savedRun = loopState.run;
    const rebuilt = await rebuildHistoryFromAnsweredTrials(view.id);
    if (disposed || generation !== resumeGeneration) {
      return;
    }
    if (rebuilt.error !== null) {
      showSessionEndedScreen(
        MSG_SESSION_CANNOT_CONTINUE,
        "resume_history_load_failed",
        rebuilt.error,
      );
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
      showSessionEndedScreen(
        MSG_SESSION_CANNOT_CONTINUE,
        "resume_replay_inconsistent",
        replay.reason,
      );
      return;
    }

    const previousVoided = new Set(savedRun.voidedTrialIndices);
    run = {
      ...savedRun,
      voidedTrialIndices: [...replay.voidedTrialIndices],
    };
    staircase = replay.staircase;
    nextTrialIndex = replay.nextTrialIndex;
    if (movement !== null && staircase.status === "running") {
      movement.setStepIndex(staircase.currentStepIndex);
    }
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

    const setup = evaluateSetup(format, {
      viewportWidthCssPx,
      viewportHeightCssPx,
    });
    if (setup === null) {
      showSessionEndedScreen(MSG_SESSION_CANNOT_CONTINUE, "resume_setup_probe_missing");
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
      showSessionEndedScreen(MSG_SESSION_CANNOT_CONTINUE, "resume_run_missing");
      return;
    }
    // The customer may be at the computer after a reload: no letter until a new tap and countdown.
    const paired = await writePairedRetryOnce(readyState(currentRun));
    if (!paired.ok) {
      fail(MSG_CONNECTION, "resume_position_reset_write_failed", paired.error);
      return;
    }
    if (disposed || generation !== resumeGeneration || setupStopped) {
      return;
    }
    const resetEvent = await sessionStore.appendEvent({
      type: "position_reset",
      payload: { reason: "reload" },
    });
    if (!resetEvent.ok) {
      console.error(resetEvent.error);
    }
    if (disposed || generation !== resumeGeneration || setupStopped) {
      return;
    }
    patch({ phase: "ready", countdownValue: null });
    requestScreenAwake();
    if (channel !== null) {
      await channel.sendNudge("paired");
    }
  } finally {
    resumeInFlight = false;
  }
}

async function beginTrials(): Promise<void> {
  if (beginInFlight || setupStopped) {
    return;
  }
  if (cachedSnapshot.phase !== "countdown") {
    return;
  }
  const currentRun = run;
  if (
    currentRun === null ||
    currentRun.stepIndices.length === 0 ||
    staircase === null ||
    staircase.status !== "running"
  ) {
    fail(
      msgScreenCannotShow(cachedSnapshot.distanceMm ?? DEFAULT_TEST_DISTANCE_MM),
      "begin_staircase_not_running",
    );
    return;
  }

  beginInFlight = true;
  const generation = resumeGeneration;
  try {
    const session = sessionStore.getSnapshot();
    if (session.status !== "paired" && session.status !== "running") {
      fail(MSG_SETUP_FAILED, "begin_not_paired");
      return;
    }
    if (session.status === "paired") {
      const running = await writeState("running", readyState(currentRun));
      if (generation !== resumeGeneration) {
        return;
      }
      if (!running.ok) {
        fail(MSG_CONNECTION, "begin_running_write_failed", running.error);
        return;
      }
      if (channel !== null) {
        await channel.sendNudge("running");
      }
    }
    if (generation !== resumeGeneration) {
      return;
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
  clearCountdown();
  stopPoll();
  leaveChannel();
  stopVisibilityTracking();
  releaseScreenAwake();
  startInFlight = false;
  resumeInFlight = false;
  beginInFlight = false;
  distanceAbandonInFlight = false;
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

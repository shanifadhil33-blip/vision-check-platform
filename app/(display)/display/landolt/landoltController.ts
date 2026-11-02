/**
 * Landolt C comparison test, main screen. Same flow as the letter test's
 * testController (calibration, distance, session, phone, tap, countdown,
 * setup checks, voids, stops) with the Landolt C module in place of the
 * letter staircase, two practice Cs first, and no resume: a reload closes
 * the session and shows the interrupted screen.
 *
 * Every C is drawn from activeTrial.shown and saved from activeTrial.shown;
 * the canvas reports back what it drew and a mismatch is never saved.
 */

import type { Calibration } from "@/lib/calibration";
import { pixelPitchMm } from "@/lib/calibration";
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
  checkDistanceBeforeStart,
  DEFAULT_TEST_DISTANCE_MM,
  msgDistanceNotConfirmed,
  msgScreenCannotShow,
  MSG_SETUP_FAILED,
  storedDistanceMatches,
  type DistanceConfirmation,
} from "@/lib/acuity/distanceSetup";
import { STOPPED_HEADING } from "@/lib/acuity/flowWording";
import type { CResult, LandoltAnswer, LandoltDirection } from "@/lib/acuity/landoltStaircase";
import {
  answerC,
  inPractice,
  landoltSizeRows,
  planNextC,
  practiceStepIndex,
  startLandoltPlan,
  voidC,
  type LandoltPlan,
  type LandoltSizeRow,
  type PlannedC,
} from "@/lib/acuity/landoltRun";
import { setupCheck } from "@/lib/acuity/testRun";
import {
  MSG_C_CONNECTION,
  MSG_C_NOT_MEASURED,
  type LandoltEye,
} from "@/lib/acuity/landoltWording";
import { setSessionState as rpcSetSessionState } from "@/lib/db/rpc";
import type { Json } from "@/lib/db/types";
import { joinSessionChannel, type SessionChannel } from "@/lib/session/channel";
import {
  isLandoltState,
  landoltAwaitingResponseState,
  landoltCompleteState,
  parseAnyLoopState,
  readyState,
  type LandoltRunContext,
  type RunContext,
} from "@/lib/session/loopState";
import * as sessionStore from "@/lib/session/sessionStore";
import {
  setVisibilityPresentationId,
  startVisibilityTracking,
  stopVisibilityTracking,
} from "@/app/(display)/display/test/visibilityTracker";
import { releaseScreenAwake, requestScreenAwake } from "@/app/(display)/display/test/wakeLock";
import type { LandoltMeasurement } from "./LandoltCanvas";
import {
  cSizeClosedPayload,
  LANDOLT_CLIENT_BUILD,
  landoltPresentationPayload,
  landoltTestQualityPayload,
  landoltTestStartedPayload,
  RELOAD_CLOSE_REASON,
} from "./landoltRecords";
import {
  forgetOpenSession,
  isSessionUuid,
  readOpenSession,
  rememberOpenSession,
} from "./landoltSessionMemory";

export type LandoltPhase =
  | "idle"
  | "creating"
  | "waiting_for_phone"
  | "ready"
  | "countdown"
  | "presenting"
  | "awaiting_response"
  | "complete"
  | "stopped"
  | "error"
  | "interrupted";

export type LandoltSnapshot = {
  phase: LandoltPhase;
  distanceMm: number | null;
  sessionId: string | null;
  remoteUrl: string | null;
  qrDataUrl: string | null;
  currentTrialIndex: number | null;
  currentStepIndex: number | null;
  currentDirection: LandoltDirection | null;
  currentPractice: boolean;
  cssPxPerMm: number | null;
  devicePixelRatio: number | null;
  eye: LandoltEye | null;
  correction: RunContext["correction"] | null;
  result: CResult | null;
  scoredCount: number;
  notSureCount: number;
  sizeRows: readonly LandoltSizeRow[];
  errorMessage: string | null;
  errorDetail: string | null;
  countdownValue: number | null;
  stopReason: "calibration" | "zoom" | "window" | null;
};

type ActiveC = {
  trialIndex: number;
  shown: PlannedC;
  presentationId: string | null;
  recorded: boolean;
  voided: boolean;
};

type SetupProbe = () => {
  validityOk: boolean;
  zoomState: "default" | "not-default" | "unknown";
  viewportWidthCssPx: number;
  viewportHeightCssPx: number;
};

const POLL_MS = 3000;

/** No resume on this page, so a lost connection means starting again. */
const MSG_CONNECTION = MSG_C_CONNECTION;
/** Copied text from testController.ts, which the C page must not change. */
const MSG_SESSION_ENDED = "This test has ended. Start a new test to continue.";
export const MSG_SESSION_CANNOT_CONTINUE =
  "This test cannot be continued. Start a new test to continue.";

const SERVER_SNAPSHOT: LandoltSnapshot = {
  phase: "idle",
  distanceMm: null,
  sessionId: null,
  remoteUrl: null,
  qrDataUrl: null,
  currentTrialIndex: null,
  currentStepIndex: null,
  currentDirection: null,
  currentPractice: false,
  cssPxPerMm: null,
  devicePixelRatio: null,
  eye: null,
  correction: null,
  result: null,
  scoredCount: 0,
  notSureCount: 0,
  sizeRows: [],
  errorMessage: null,
  errorDetail: null,
  countdownValue: null,
  stopReason: null,
};

const listeners = new Set<() => void>();
let cachedSnapshot: LandoltSnapshot = SERVER_SNAPSHOT;

let calibration: Calibration | null = null;
let plan: LandoltPlan | null = null;
let run: LandoltRunContext | null = null;
let nextTrialIndex = 0;
let activeTrial: ActiveC | null = null;
let channel: SessionChannel | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let countdownTimer: ReturnType<typeof setTimeout> | null = null;
let pollInFlight = false;
let startInFlight = false;
let beginInFlight = false;
let distanceAbandonInFlight = false;
let measureInFlight = false;
let advanceInFlight = false;
let backInFlight = false;
let disposed = false;
let runGeneration = 0;
let setupProbe: SetupProbe | null = null;
let setupStopped = false;
let skippingDuplicateTrial = false;
let endedSessionClose: Promise<void> | null = null;
let straySessionClose: Promise<void> | null = null;
let visibilityGeneration = 0;
let visibilityChain: Promise<void> = Promise.resolve();
let stateChain: Promise<void> = Promise.resolve();
/** Voided Cs by trial index. Their answers are kept in the database and never scored. */
const voidedTrials = new Map<number, ActiveC>();
const voidEventSent = new Set<number>();
const voidStateSaved = new Set<string>();

type RememberedFinishedTest = {
  sessionId: string;
  version: number;
  run: LandoltRunContext;
  result: CResult;
  scoredCount: number;
};

let rememberedFinishedTest: RememberedFinishedTest | null = null;
let finishedScoredCount: number | null = null;

function addressSessionId(): string | null {
  return new URLSearchParams(window.location.search).get("session");
}

function pageUrl(sessionId: string | null): string {
  if (sessionId === null) {
    return window.location.pathname;
  }
  const params = new URLSearchParams();
  params.set("session", sessionId);
  return `${window.location.pathname}?${params.toString()}`;
}

/** Adds one history entry when the address goes from no session to a session; otherwise replaces. */
function setSessionIdInUrl(sessionId: string): void {
  if (addressSessionId() === null) {
    window.history.pushState({ vcp: "landolt-session" }, "", pageUrl(sessionId));
    return;
  }
  window.history.replaceState(window.history.state, "", pageUrl(sessionId));
}

function clearSessionIdFromUrl(): void {
  window.history.replaceState(window.history.state, "", pageUrl(null));
}

/**
 * Browser Back or Forward. Returns "back-to-start" when the address lost its
 * session while the page is past Start; the caller then takes the same path
 * as the Back to the start button. While a session is being created the
 * address is left alone.
 */
export function addressPopped(): "back-to-start" | "none" {
  const phase = cachedSnapshot.phase;
  if (phase === "creating") {
    return "none";
  }
  const sessionId = addressSessionId();
  if (sessionId === null) {
    return phase === "idle" || phase === "interrupted" ? "none" : "back-to-start";
  }
  if (sessionId !== cachedSnapshot.sessionId) {
    window.history.replaceState(window.history.state, "", pageUrl(cachedSnapshot.sessionId));
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

function emit(next: LandoltSnapshot): void {
  cachedSnapshot = next;
  for (const listener of listeners) {
    listener();
  }
}

function patch(partial: Partial<LandoltSnapshot>): void {
  emit({ ...cachedSnapshot, ...partial });
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): LandoltSnapshot {
  return cachedSnapshot;
}

export function getServerSnapshot(): LandoltSnapshot {
  return SERVER_SNAPSHOT;
}

export function setSetupProbe(probe: SetupProbe | null): void {
  setupProbe = probe;
}

function resetRunMemory(): void {
  plan = null;
  run = null;
  nextTrialIndex = 0;
  voidedTrials.clear();
  voidEventSent.clear();
  voidStateSaved.clear();
  skippingDuplicateTrial = false;
  visibilityGeneration += 1;
  visibilityChain = Promise.resolve();
}

function errorDetailText(reason: string, error: unknown): string {
  return error === undefined ? reason : `${reason}: ${detailText(error)}`;
}

/** Logs, and appends client_error to the held session without waiting. */
function reportClientError(message: string, reason: string, error: unknown): void {
  console.error(reason, error ?? "");
  if (sessionStore.getSnapshot().sessionId === null) {
    return;
  }
  void sessionStore
    .appendEvent({
      type: "client_error",
      payload: { reason, message: error === undefined ? message : detailText(error) },
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

function clearCountdown(): void {
  if (countdownTimer !== null) {
    clearTimeout(countdownTimer);
    countdownTimer = null;
  }
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

/** Never writes a session that is complete, already abandoned or no longer the one in the store. */
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
 * Plain ended screen, session cleared from the address bar. An open session
 * is closed in the background; start() and backToStart() wait for it.
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
    currentDirection: null,
    currentPractice: false,
    errorMessage: message,
    errorDetail: errorDetailText(reason, error),
    result: null,
    countdownValue: null,
    stopReason: null,
  });
}

/** Loads a session by id and closes it if it is still open. Never throws. */
async function closeSessionById(sessionId: string, reason: string): Promise<void> {
  if (!isSessionUuid(sessionId)) {
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
    const loopState = parseAnyLoopState(loaded.data.currentState);
    await closeOpenSession(reason, loopState === null ? null : loopState.run);
  } catch (error) {
    console.error(error);
  } finally {
    forgetOpenSession(sessionId);
    sessionStore.reset();
  }
}

function trackStrayClose(close: Promise<void>): void {
  straySessionClose = close;
  void close.finally(() => {
    if (straySessionClose === close) {
      straySessionClose = null;
    }
  });
}

/**
 * Called on mount when the address holds no session. Closes the session this
 * tab left open on the C page, then forgets it. start() waits for this.
 */
export function closeStraySession(): void {
  if (straySessionClose !== null) {
    return;
  }
  const sessionId = readOpenSession();
  if (sessionId === null) {
    return;
  }
  trackStrayClose(closeSessionById(sessionId, "stray_session_on_open"));
}

/**
 * Called on mount when the address holds a session: the page was reloaded
 * during a test. There is no resume on the C page. The session is closed with
 * reason landolt_reload, the answers already saved stay, and the interrupted
 * screen is shown.
 */
export function closeReloadedSession(sessionId: string): void {
  if (straySessionClose !== null || !isSessionUuid(sessionId)) {
    clearSessionIdFromUrl();
    return;
  }
  clearSessionIdFromUrl();
  patch({ phase: "interrupted", errorMessage: null, errorDetail: null });
  trackStrayClose(closeSessionById(sessionId, RELOAD_CLOSE_REASON));
}

function currentStepForSetup(): number | null {
  if (activeTrial !== null) {
    return activeTrial.shown.stepIndex;
  }
  if (plan === null) {
    return null;
  }
  if (inPractice(plan)) {
    return practiceStepIndex(plan.staircase.stepIndices);
  }
  return plan.staircase.status === "running" ? plan.staircase.currentStepIndex : null;
}

function evaluateSetup(viewport?: {
  viewportWidthCssPx: number;
  viewportHeightCssPx: number;
}): "ok" | "calibration" | "zoom" | "window" | null {
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
      format: "single",
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
    phase !== "awaiting_response"
  ) {
    return;
  }
  const outcome = evaluateSetup();
  if (outcome === null || outcome === "ok") {
    return;
  }
  void stopForSetup(outcome);
}

async function stopForSetup(reason: "calibration" | "zoom" | "window"): Promise<void> {
  if (setupStopped || disposed) {
    return;
  }
  setupStopped = true;
  clearCountdown();
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
    await writeAbandonedRetryOnce(readyState(currentRun));
    const heldSessionId = sessionStore.getSnapshot().sessionId;
    if (heldSessionId !== null) {
      forgetOpenSession(heldSessionId);
    }
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
    currentDirection: null,
    currentPractice: false,
    countdownValue: null,
    stopReason: reason,
  });
}

/** The session row does not hold the distance the Cs are drawn at. */
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
      payload: { confirmed_mm: confirmedMm, stored_mm: storedMm },
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
  const outcome = afterCountdown(evaluateSetup());
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

function rememberVoided(trial: ActiveC): void {
  voidedTrials.set(trial.trialIndex, { ...trial });
}

/**
 * Records the void in the plan and in run before any await, so a phone
 * answer read after this returns cannot be scored. A scored void is kept in
 * the module record; a practice void gets a fresh practice direction.
 */
function commitVoid(trial: ActiveC): boolean {
  if (trial.voided) {
    return true;
  }
  if (run === null || plan === null) {
    return false;
  }
  if (!trial.shown.practice && plan.staircase.status !== "running") {
    return false;
  }
  plan = voidC(plan, trial.shown, Math.random);
  if (!run.voidedTrialIndices.includes(trial.trialIndex)) {
    run = { ...run, voidedTrialIndices: [...run.voidedTrialIndices, trial.trialIndex] };
  }
  trial.voided = true;
  rememberVoided(trial);
  return true;
}

/** Trial indices of the voided practice Cs in this run, left out of interruptions. */
function voidedPracticeTrialIndices(): number[] {
  return [...voidedTrials.values()]
    .filter((trial) => trial.shown.practice)
    .map((trial) => trial.trialIndex);
}

function isVoidedPresentation(trialIndex: number, presentationId: string): boolean {
  if (run !== null && run.voidedTrialIndices.includes(trialIndex)) {
    return true;
  }
  if (activeTrial !== null && activeTrial.voided && activeTrial.presentationId === presentationId) {
    return true;
  }
  return voidedTrials.has(trialIndex);
}

/** Logs the void and keeps the phone able to answer the voided C; that answer is never scored. */
async function persistHiddenVoid(trial: ActiveC): Promise<void> {
  const generation = runGeneration;
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
    landoltAwaitingResponseState({
      trialIndex: trial.trialIndex,
      presentationId,
      practice: trial.shown.practice,
      run: currentRun,
    }),
  );
  if (stateResult.ok || generation !== runGeneration) {
    return;
  }
  voidStateSaved.delete(presentationId);
  if (stateResult.error.kind === "version-conflict") {
    // The phone answered first; that answer belongs to a voided C and is not scored.
    const latestRun = run;
    if (latestRun === null || disposed || setupStopped) {
      fail(MSG_SESSION_CANNOT_CONTINUE, "void_state_conflict_unrecoverable", stateResult.error);
      return;
    }
    const retry = await writeState(
      "running",
      landoltAwaitingResponseState({
        trialIndex: trial.trialIndex,
        presentationId,
        practice: trial.shown.practice,
        run: latestRun,
      }),
    );
    if (!retry.ok) {
      if (generation === runGeneration) {
        fail(MSG_CONNECTION, "void_state_retry_failed", retry.error);
      }
      return;
    }
    voidStateSaved.add(presentationId);
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
  const generation = runGeneration;
  const rewritten = await writeState(
    "running",
    landoltAwaitingResponseState({
      trialIndex: fresh.trialIndex,
      presentationId: fresh.presentationId,
      practice: fresh.shown.practice,
      run: currentRun,
    }),
  );
  if (generation !== runGeneration) {
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

function snapshotCounts(): Pick<LandoltSnapshot, "scoredCount" | "notSureCount" | "sizeRows"> {
  if (plan === null) {
    return { scoredCount: 0, notSureCount: 0, sizeRows: [] };
  }
  return {
    scoredCount: plan.staircase.scoredCount,
    notSureCount: plan.staircase.notSureCount,
    sizeRows: landoltSizeRows(plan.staircase.attempts),
  };
}

async function finishRun(): Promise<void> {
  if (disposed || setupStopped) {
    return;
  }
  const generation = runGeneration;
  const runSessionId = sessionStore.getSnapshot().sessionId;
  const currentRun = run;
  const currentPlan = plan;
  if (currentRun === null || currentPlan === null || currentPlan.staircase.status !== "finished") {
    fail(MSG_SESSION_CANNOT_CONTINUE, "finish_module_not_finished");
    return;
  }
  const distanceMm = cachedSnapshot.distanceMm;
  if (distanceMm === null) {
    showSessionEndedScreen(MSG_SESSION_CANNOT_CONTINUE, "finish distance null");
    return;
  }
  const result = currentPlan.staircase.result;
  const scoredCount = currentPlan.staircase.scoredCount;
  finishedScoredCount = scoredCount;
  const done = await writeState(
    "complete",
    landoltCompleteState(scoredCount, { run: currentRun, result }),
  );
  if (!done.ok) {
    if (generation !== runGeneration) {
      return;
    }
    fail(MSG_CONNECTION, "finish_complete_write_failed", done.error);
    return;
  }
  if (runSessionId !== null) {
    forgetOpenSession(runSessionId);
  }
  if (!disposed && !setupStopped && generation === runGeneration && channel !== null) {
    await channel.sendNudge("complete");
  }
  if (sessionStore.getSnapshot().sessionId !== runSessionId) {
    return;
  }
  try {
    const qualityResult = await sessionStore.upsertTestQualityForEye(
      currentRun.eye,
      landoltTestQualityPayload({
        result,
        run: currentRun,
        distanceMm,
        notSureCount: currentPlan.staircase.notSureCount,
        practiceTrialIndices: voidedPracticeTrialIndices(),
      }),
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
  if (disposed || setupStopped || generation !== runGeneration) {
    return;
  }
  activeTrial = null;
  stopVisibilityTracking();
  releaseScreenAwake();
  // A reload of the result screen goes back to the start; the result is saved.
  clearSessionIdFromUrl();
  patch({
    phase: "complete",
    result,
    eye: currentRun.eye,
    correction: currentRun.correction,
    ...snapshotCounts(),
    currentTrialIndex: null,
    currentStepIndex: null,
    currentDirection: null,
    currentPractice: false,
    errorMessage: null,
    errorDetail: null,
  });
}

/**
 * Advances only after a vcp_get_session read shows a C responded state for
 * the C on screen. A voided C is kept and not scored.
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
  const generation = runGeneration;
  try {
    const loaded = await sessionStore.loadSession(sessionId);
    if (!loaded.ok || disposed || setupStopped || generation !== runGeneration) {
      return;
    }
    if (loaded.data.status === "abandoned") {
      showSessionEndedScreen(MSG_SESSION_ENDED, "advance_session_abandoned");
      return;
    }
    if (cachedSnapshot.phase !== "awaiting_response" && cachedSnapshot.phase !== "presenting") {
      return;
    }

    const state = parseAnyLoopState(loaded.data.currentState);
    if (state === null || state.phase !== "responded" || !isLandoltState(state)) {
      return;
    }

    if (isVoidedPresentation(state.trialIndex, state.presentationId)) {
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
    if (state.presentationId !== trial.presentationId || state.trialIndex !== trial.trialIndex) {
      return;
    }
    const currentPlan = plan;
    if (currentPlan === null) {
      return;
    }
    if (!trial.shown.practice && currentPlan.staircase.status !== "running") {
      return;
    }

    const answer: LandoltAnswer =
      state.responseKind === "direction" && state.responseDirection !== null
        ? state.responseDirection
        : "not_sure";
    let answered: ReturnType<typeof answerC>;
    try {
      answered = answerC(currentPlan, trial.shown, answer);
    } catch (error) {
      fail(MSG_SESSION_CANNOT_CONTINUE, "answer_not_scored", error);
      return;
    }
    plan = answered.plan;
    activeTrial = null;
    stopVisibilityTracking();
    patch(snapshotCounts());

    if (answered.closedAttempt !== null) {
      const closedEvent = await sessionStore.appendEvent({
        type: "c_size_closed",
        payload: cSizeClosedPayload(answered.closedAttempt),
      });
      if (!closedEvent.ok) {
        console.error(closedEvent.error);
      }
      if (disposed || setupStopped || generation !== runGeneration) {
        return;
      }
    }

    if (plan.staircase.status === "finished" && !inPractice(plan)) {
      await finishRun();
      return;
    }
    await presentNextC();
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

  const loopState = parseAnyLoopState(loaded.data.currentState);
  const decision = autoStartDecision({
    uiPhase: cachedSnapshot.phase,
    sessionStatus: loaded.data.status,
    positionConfirmed:
      loopState !== null && loopState.phase === "ready" && loopState.positionConfirmed === true,
    storedDistanceMm: loaded.data.distanceMmRequested,
    snapshotDistanceMm: cachedSnapshot.distanceMm,
    setup: evaluateSetup(),
  });
  if (decision.kind === "stop-distance") {
    await abandonForDistanceMismatch(cachedSnapshot.distanceMm, loaded.data.distanceMmRequested);
    return;
  }
  if (decision.kind === "stop-setup") {
    await stopForSetup(decision.reason);
    return;
  }
  if (decision.kind === "start-countdown") {
    // Not awaited: the phase must turn countdown in this tick so a concurrent nudge waits.
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

/** Channel + poll. Called from LandoltClient when sessionId appears. */
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
        await interruptActiveC();
        return;
      }
      await presentFreshAfterVoid();
    })
    .catch((error: unknown) => {
      console.error(error);
    });
}

async function interruptActiveC(): Promise<void> {
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
  const outcome = evaluateSetup();
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
  if (plan !== null && !inPractice(plan) && plan.staircase.status === "finished") {
    await finishRun();
    return;
  }
  await presentNextC();
}

/** Puts up the next C: practice first, then the module's size with a fresh random direction. */
async function presentNextC(): Promise<void> {
  if (disposed || setupStopped) {
    return;
  }
  const currentPlan = plan;
  const currentRun = run;
  if (currentPlan === null || currentRun === null || calibration === null) {
    fail(
      msgScreenCannotShow(cachedSnapshot.distanceMm ?? DEFAULT_TEST_DISTANCE_MM),
      "plan_missing",
    );
    return;
  }
  const shown = planNextC(currentPlan, Math.random);
  if (shown === null) {
    await finishRun();
    return;
  }
  const trialIndex = nextTrialIndex;
  nextTrialIndex += 1;
  activeTrial = {
    trialIndex,
    shown,
    presentationId: null,
    recorded: false,
    voided: false,
  };

  startVisibilityTracking(trialIndex, queueVisibility);

  patch({
    phase: "presenting",
    eye: currentRun.eye,
    correction: currentRun.correction,
    currentTrialIndex: trialIndex,
    currentStepIndex: shown.stepIndex,
    currentDirection: shown.direction,
    currentPractice: shown.practice,
    errorMessage: null,
    errorDetail: null,
  });
  if (document.visibilityState === "hidden") {
    // No visibilitychange fires for a C put up in a hidden tab; commitVoid runs before the first await.
    void interruptActiveC();
  }
}

/** Stable onMeasured identity. Accepts a measurement only for the C on screen, once. */
export function handleCanvasMeasured(measurement: LandoltMeasurement): void {
  void acceptMeasurement(measurement);
}

async function acceptMeasurement(measurement: LandoltMeasurement): Promise<void> {
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
  if (measurement.drawnTrialIndex !== trial.trialIndex) {
    // A canvas from an earlier C finished drawing late; it is not this C.
    return;
  }
  if (
    measurement.drawnDirection !== trial.shown.direction ||
    measurement.drawnStepIndex !== trial.shown.stepIndex
  ) {
    fail(MSG_SESSION_CANNOT_CONTINUE, "drawn_c_differs_from_planned_c");
    return;
  }
  const currentRun = run;
  if (calibration === null || cachedSnapshot.distanceMm === null || currentRun === null) {
    return;
  }
  if (measurement.inkBounds === null) {
    fail(MSG_C_NOT_MEASURED, "presentation_measure_failed");
    return;
  }

  measureInFlight = true;
  try {
    const payload = landoltPresentationPayload({
      shown: {
        trialIndex: trial.trialIndex,
        stepIndex: trial.shown.stepIndex,
        direction: trial.shown.direction,
        practice: trial.shown.practice,
      },
      eye: currentRun.eye,
      distanceMm: cachedSnapshot.distanceMm,
      cssPxPerMm: calibration.cssPxPerMm,
      devicePixelRatio: calibration.devicePixelRatio,
      actualLetterHeightDevicePx: measurement.inkBounds.heightPx,
      renderedAtIso: new Date().toISOString(),
      visibilityConfirmed: document.visibilityState === "visible",
    });

    if (document.visibilityState === "hidden" && !commitVoid(trial)) {
      fail(MSG_SESSION_CANNOT_CONTINUE, "void_commit_failed");
      return;
    }
    trial.recorded = true;
    const generation = runGeneration;
    const recorded = await sessionStore.recordPresentation(payload);
    if (generation !== runGeneration) {
      return;
    }
    if (!recorded.ok) {
      trial.recorded = false;
      if (recorded.error.kind === "unique-violation" && !skippingDuplicateTrial) {
        // presentations_session_id_trial_index_key: this trial index is already used. Skip it.
        skippingDuplicateTrial = true;
        if (!commitVoid(trial)) {
          skippingDuplicateTrial = false;
          fail(MSG_CONNECTION, "duplicate_trial_void_failed", recorded.error);
          return;
        }
        if (nextTrialIndex <= trial.trialIndex) {
          nextTrialIndex = trial.trialIndex + 1;
        }
        await presentNextC();
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
      rememberVoided(trial);
      const fresh = activeTrial;
      const freshAlreadySaved =
        fresh !== null && fresh !== trial && !fresh.voided && fresh.presentationId !== null;
      if (!freshAlreadySaved) {
        await persistHiddenVoid(trial);
      }
      return;
    }

    if (activeTrial !== trial || cachedSnapshot.phase !== "presenting") {
      return;
    }

    setVisibilityPresentationId(recorded.data);

    const latestRun = run;
    if (latestRun === null) {
      fail(MSG_SESSION_CANNOT_CONTINUE, "presentation_run_missing");
      return;
    }
    const stateResult = await writeState(
      "running",
      landoltAwaitingResponseState({
        trialIndex: trial.trialIndex,
        presentationId: recorded.data,
        practice: trial.shown.practice,
        run: latestRun,
      }),
    );
    if (generation !== runGeneration) {
      return;
    }
    if (!stateResult.ok) {
      fail(MSG_CONNECTION, "awaiting_response_write_failed", stateResult.error);
      return;
    }

    if (channel !== null) {
      await channel.sendNudge("awaiting_response");
    }
    if (generation !== runGeneration) {
      return;
    }

    patch({ phase: "awaiting_response" });
  } finally {
    measureInFlight = false;
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
  if (currentRun === null || plan === null) {
    fail(
      msgScreenCannotShow(cachedSnapshot.distanceMm ?? DEFAULT_TEST_DISTANCE_MM),
      "begin_plan_missing",
    );
    return;
  }

  beginInFlight = true;
  const generation = runGeneration;
  try {
    const session = sessionStore.getSnapshot();
    if (session.status !== "paired" && session.status !== "running") {
      fail(MSG_SETUP_FAILED, "begin_not_paired");
      return;
    }
    if (session.status === "paired") {
      const running = await writeState("running", readyState(currentRun));
      if (generation !== runGeneration) {
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
    if (generation !== runGeneration) {
      return;
    }
    await presentNextC();
  } finally {
    beginInFlight = false;
  }
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
 * Leaves the result and goes back to the start screen. The finished session
 * is remembered so the next Start can point the phone at the new session,
 * as the letter test does. Eye, wear and distance are kept by the page.
 */
export function startAnotherTest(): void {
  const sessionId = cachedSnapshot.sessionId;
  const result = cachedSnapshot.result;
  const version = sessionStore.getSnapshot().version;
  if (
    sessionId !== null &&
    version !== null &&
    run !== null &&
    result !== null &&
    finishedScoredCount !== null
  ) {
    rememberedFinishedTest = {
      sessionId,
      version,
      run: { ...run, stepIndices: [...run.stepIndices], voidedTrialIndices: [...run.voidedTrialIndices] },
      result,
      scoredCount: finishedScoredCount,
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
    sizeRows: [],
    scoredCount: 0,
    notSureCount: 0,
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
      currentState: landoltCompleteState(prior.scoredCount, {
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

/**
 * Closes the held session unless it is complete or already abandoned, then
 * returns to the start screen holding nothing from it.
 */
export async function backToStart(): Promise<void> {
  if (backInFlight) {
    return;
  }
  backInFlight = true;
  const heldSessionId = sessionStore.getSnapshot().sessionId ?? cachedSnapshot.sessionId;
  // C work still in flight stops at its next check instead of drawing or writing.
  runGeneration += 1;
  setupStopped = true;
  try {
    clearCountdown();
    stopPoll();
    leaveChannel();
    stopVisibilityTracking();
    if (endedSessionClose !== null) {
      await endedSessionClose;
    }
    if (straySessionClose !== null) {
      await straySessionClose;
    }
    await closeOpenSession("back_to_start");
    if (heldSessionId !== null) {
      forgetOpenSession(heldSessionId);
    }
    setupStopped = false;
    releaseScreenAwake();
    activeTrial = null;
    calibration = null;
    resetRunMemory();
    rememberedFinishedTest = null;
    finishedScoredCount = null;
    sessionStore.reset();
    emit({ ...SERVER_SNAPSHOT });
  } finally {
    backInFlight = false;
  }
}

export async function start(
  distance: DistanceConfirmation,
  nextCalibration: Calibration,
  viewportWidthCssPx: number,
  viewportHeightCssPx: number,
  eye: LandoltEye,
  correction: RunContext["correction"],
): Promise<void> {
  if (startInFlight) {
    return;
  }
  if (cachedSnapshot.phase !== "idle" && cachedSnapshot.phase !== "error") {
    return;
  }

  startInFlight = true;
  const generation = runGeneration;
  if (straySessionClose !== null) {
    await straySessionClose;
    if (generation !== runGeneration) {
      startInFlight = false;
      return;
    }
  }
  if (endedSessionClose !== null) {
    await endedSessionClose;
    if (generation !== runGeneration) {
      startInFlight = false;
      return;
    }
  }
  if (cachedSnapshot.sessionId !== null || sessionStore.getSnapshot().sessionId !== null) {
    await closeOpenSession("new_start");
    if (generation !== runGeneration) {
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
        pixelPitchMm: pixelPitchMm(nextCalibration.cssPxPerMm, nextCalibration.devicePixelRatio),
        cssPxPerMm: nextCalibration.cssPxPerMm,
        viewportWidthCssPx,
        viewportHeightCssPx,
        format: "single",
      });
    } catch (error) {
      fail(msgScreenCannotShow(distanceMm), "start_levels_failed", error);
      return;
    }
    if (levels.stepIndices.length === 0) {
      fail(msgScreenCannotShow(distanceMm), "start_no_drawable_levels");
      return;
    }

    const nextPlan = startLandoltPlan(levels.stepIndices, Math.random);
    if (nextPlan === null) {
      fail(msgScreenCannotShow(distanceMm), "start_module_cannot_start");
      return;
    }
    const nextRun: LandoltRunContext = {
      correction,
      stepIndices: levels.stepIndices,
      finestLimitedBy: levels.finestLimitedBy,
      coarsestLimitedBy: levels.coarsestLimitedBy,
      voidedTrialIndices: [],
      testMode: "landolt",
      eye,
    };
    run = nextRun;
    plan = nextPlan;
    nextTrialIndex = 0;

    patch({
      phase: "creating",
      eye,
      correction,
      distanceMm,
      sessionId: null,
      remoteUrl: null,
      qrDataUrl: null,
      currentTrialIndex: null,
      currentStepIndex: null,
      currentDirection: null,
      currentPractice: false,
      cssPxPerMm: nextCalibration.cssPxPerMm,
      devicePixelRatio: nextCalibration.devicePixelRatio,
      errorMessage: null,
      errorDetail: null,
      result: null,
      scoredCount: 0,
      notSureCount: 0,
      sizeRows: [],
      stopReason: null,
    });

    const created = await sessionStore.createSession({
      distanceMmRequested: distanceMm,
      clientBuild: LANDOLT_CLIENT_BUILD,
    });
    if (!created.ok) {
      fail(MSG_CONNECTION, "create_session_failed", created.error);
      return;
    }
    rememberOpenSession(created.data.id);

    const mode = await sessionStore.setTestMode("landolt");
    if (!mode.ok) {
      fail(MSG_CONNECTION, "set_test_mode_failed", mode.error);
      return;
    }
    if (mode.data !== "landolt") {
      fail(MSG_SETUP_FAILED, `set_test_mode_returned ${mode.data}`);
      return;
    }

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

    const startedEvent = await sessionStore.appendEvent({
      type: "test_started",
      payload: landoltTestStartedPayload({ run: nextRun, distanceMm }),
    });
    if (!startedEvent.ok) {
      fail(MSG_CONNECTION, "test_started_event_failed", startedEvent.error);
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
    requestScreenAwake();
  } finally {
    startInFlight = false;
  }
}

/** From the interrupted screen: back to a fresh start screen once the close has finished. */
export async function leaveInterrupted(): Promise<void> {
  if (straySessionClose !== null) {
    await straySessionClose;
  }
  if (cachedSnapshot.phase === "interrupted") {
    emit({ ...SERVER_SNAPSHOT });
  }
}

export function dispose(): void {
  disposed = true;
  setupStopped = false;
  runGeneration += 1;
  clearCountdown();
  stopPoll();
  leaveChannel();
  stopVisibilityTracking();
  releaseScreenAwake();
  startInFlight = false;
  beginInFlight = false;
  distanceAbandonInFlight = false;
  measureInFlight = false;
  advanceInFlight = false;
  activeTrial = null;
  calibration = null;
  resetRunMemory();
  rememberedFinishedTest = null;
  finishedScoredCount = null;
  sessionStore.reset();
  // The interrupted notice stays until staff dismiss it, including across a
  // development double mount, which disposes and mounts again.
  emit(
    cachedSnapshot.phase === "interrupted"
      ? { ...SERVER_SNAPSHOT, phase: "interrupted" }
      : { ...SERVER_SNAPSHOT },
  );
}
